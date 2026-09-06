import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { CONTA_AZUL_LEDGER_AUTO_TOMBSTONE } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger.js';
import { decideTransferMatches } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-match.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import type { MappedSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import type { MappedInstallment } from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-mappers.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulLedgerLifecycleService } from '../src/modules/integrations/conta-azul/services/conta-azul-ledger-lifecycle.service.js';
import { createContaAzulLedgerSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-ledger-sync.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import {
  ContaAzulApiError,
  type ContaAzulApiClient,
  type ContaAzulSettlementLookup,
} from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const ledger = createContaAzulLedgerRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const cashFlow = createMonthlyCashFlowService({
  ledger: createLedgerReadRepository(prisma),
  receivables: createReceivableReadRepository(prisma),
  payables: createPayableReadRepository(prisma),
  categories: createFinancialCategoryReadRepository(prisma),
});

const ACC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedConnected(name: string) {
  const environment = loadEnvironment();
  const tenant = await tenants.create({ name, displayName: name });
  const integration = await integrations.persistConnectedTokens({
    tenantId: tenant.id,
    encryptedAccessToken: encryptSecret('access', environment.integrationEncryptionKey!),
    encryptedRefreshToken: encryptSecret('refresh', environment.integrationEncryptionKey!),
    accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    tokenType: 'Bearer',
    at: new Date(),
  });
  return { tenant, integration };
}

function paidInstallment(input: {
  readonly externalId: string;
  readonly paid: string;
}): MappedInstallment {
  const paid = new Prisma.Decimal(input.paid);
  return {
    externalId: input.externalId,
    description: input.externalId,
    dueDate: new Date('2026-08-31T00:00:00.000Z'),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: 'PAID',
    upstreamStatus: 'PAID',
    total: paid,
    paid,
    unpaid: new Prisma.Decimal(0),
    externalPartyId: null,
    categoryExternalIds: [],
  };
}

function settlement(input: {
  readonly id: string;
  readonly installmentId: string;
  readonly bruto: string;
  readonly tipo?: 'RECEITA' | 'DESPESA';
  readonly data?: string;
  readonly account?: string;
  readonly paymentMethod?: string;
}): MappedSettlement {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data ?? '2026-08-31',
    tipo_evento_financeiro: input.tipo ?? 'DESPESA',
    valor_composicao: {
      valor_bruto: input.bruto,
      valor_liquido: input.bruto,
      juros: '0',
      multa: '0',
      desconto: '0',
      taxa: '0',
    },
    conta_financeira: { id: input.account ?? ACC },
    ...(input.paymentMethod ? { metodo_pagamento: input.paymentMethod } : {}),
  });
}

function lifecycleClient(input: {
  readonly byId?: Record<string, ContaAzulSettlementLookup | ContaAzulApiError>;
  readonly detail?: unknown;
  readonly detailError?: ContaAzulApiError;
}): ContaAzulApiClient {
  const base = createMockContaAzulApiClient();
  return {
    ...base,
    getSettlementById: async (_token, id) => {
      const mapped = input.byId?.[id];
      if (mapped instanceof ContaAzulApiError) {
        throw mapped;
      }
      return mapped ?? { kind: 'not_found' };
    },
    getInstallmentDetail: async () => {
      if (input.detailError) {
        throw input.detailError;
      }
      return input.detail ?? { id: 'unknown' };
    },
  };
}

async function runLifecycle(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly installmentId: string;
  readonly kind?: 'RECEIVABLE' | 'PAYABLE';
  readonly upstream: readonly MappedSettlement[];
  readonly listWasEmpty?: boolean;
  readonly listOk?: boolean;
  readonly autoTombstone?: boolean;
  readonly client: ContaAzulApiClient;
}) {
  const previousRows = await ledger.listByInstallment(
    { tenantId: input.tenantId, integrationId: input.integrationId },
    input.installmentId,
  );
  const service = createContaAzulLedgerLifecycleService({
    prisma,
    ledger,
    apiClient: input.client,
  });
  return service.reconcileInstallment({
    scope: { tenantId: input.tenantId, integrationId: input.integrationId, syncedAt: new Date() },
    installmentExternalId: input.installmentId,
    installmentKind: input.kind ?? 'PAYABLE',
    previousRows,
    upstreamItems: input.upstream,
    listWasEmpty: input.listWasEmpty ?? false,
    listOk: input.listOk ?? true,
    autoTombstone: input.autoTombstone ?? CONTA_AZUL_LEDGER_AUTO_TOMBSTONE,
    requestWithAuth: async (work) => work('token'),
    gatedGet: async (work) => work(),
  });
}

async function statusOf(integrationId: string, externalId: string) {
  return (
    await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId, externalId },
    })
  ).lifecycleStatus;
}

describe('Correção 10-C — lifecycle/supersession de baixas', () => {
  it('flag default do fluxo padrão é true', () => {
    expect(CONTA_AZUL_LEDGER_AUTO_TOMBSTONE).toBe(true);
  });

  it('CASO 1 — substituição simples A+B local → só B upstream → A DELETED', async () => {
    const { tenant, integration } = await seedConnected('10c-1');
    const parcela = '792e421e-65de-4116-84d4-203edf3ae454';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '2550.82' })],
    );
    const a = settlement({
      id: 'b0df6a9a-c1ac-440e-99f3-b610586aa7dd',
      installmentId: parcela,
      bruto: '2550.82',
    });
    const b = settlement({
      id: 'fe924c42-be89-44fa-82c7-3896e12a3ddc',
      installmentId: parcela,
      bruto: '2550.82',
    });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [a, b],
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [b],
      client: lifecycleClient({
        byId: { [a.externalId]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 2550.82 },
      }),
    });
    expect(counters.deleted).toBe(1);
    expect(await statusOf(integration.id, a.externalId)).toBe('DELETED');
    expect(await statusOf(integration.id, b.externalId)).toBe('ACTIVE');
  });

  it('CASO 2 — duas baixas parciais legítimas permanecem ACTIVE', async () => {
    const { tenant, integration } = await seedConnected('10c-2');
    const parcela = 'parcela-parcial';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '1000' })],
    );
    const a = settlement({ id: 'parcial-a', installmentId: parcela, bruto: '500' });
    const b = settlement({ id: 'parcial-b', installmentId: parcela, bruto: '500' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [a, b],
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [a, b],
      client: lifecycleClient({
        detail: { id: parcela, status: 'QUITADO', valor_pago: 1000 },
      }),
    });
    expect(counters.deleted).toBe(0);
    expect(counters.missingSettlement).toBe(0);
    expect(await statusOf(integration.id, a.externalId)).toBe('ACTIVE');
    expect(await statusOf(integration.id, b.externalId)).toBe('ACTIVE');
  });

  it('CASO 3 — três baixas legítimas A+B+C = paid', async () => {
    const { tenant, integration } = await seedConnected('10c-3');
    const parcela = 'parcela-tres';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '900' })],
    );
    const items = [
      settlement({ id: 't-a', installmentId: parcela, bruto: '300' }),
      settlement({ id: 't-b', installmentId: parcela, bruto: '300' }),
      settlement({ id: 't-c', installmentId: parcela, bruto: '300' }),
    ];
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      items,
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: items,
      client: lifecycleClient({
        detail: { id: parcela, status: 'QUITADO', valor_pago: 900 },
      }),
    });
    expect(counters.deleted).toBe(0);
    expect(await prisma.financialTransaction.count({
      where: { integrationId: integration.id, lifecycleStatus: 'ACTIVE' },
    })).toBe(3);
  });

  it('CASO 4 — falha na lista de baixas não tombstona', async () => {
    const { tenant, integration } = await seedConnected('10c-4');
    const parcela = 'parcela-fail';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '100' })],
    );
    const a = settlement({ id: 'fail-a', installmentId: parcela, bruto: '100' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [a],
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listOk: false,
      client: lifecycleClient({}),
    });
    expect(counters.deleted).toBe(0);
    expect(counters.skippedFetchFailure).toBe(1);
    expect(await statusOf(integration.id, a.externalId)).toBe('ACTIVE');
  });

  it('CASO 5 — under_covered: não tombstona se remaining < paid', async () => {
    const { tenant, integration } = await seedConnected('10c-5');
    const parcela = 'parcela-under';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '1000' })],
    );
    const a = settlement({ id: 'under-a', installmentId: parcela, bruto: '500' });
    const b = settlement({ id: 'under-b', installmentId: parcela, bruto: '500' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [a, b],
    );
    // Upstream incompleto (só B) com paid=1000 → remaining 500 < 1000 → HOLD
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [b],
      client: lifecycleClient({
        byId: { [a.externalId]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 1000 },
      }),
    });
    expect(counters.deleted).toBe(0);
    expect(counters.skippedUnderCovered).toBe(1);
    expect(await statusOf(integration.id, a.externalId)).toBe('ACTIVE');
  });

  it('CASO 6 — over_covered confirmado: stale → DELETED', async () => {
    const { tenant, integration } = await seedConnected('10c-6');
    const parcela = 'parcela-over';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '1000' })],
    );
    const stale = settlement({ id: 'over-stale', installmentId: parcela, bruto: '1000' });
    const live = settlement({ id: 'over-live', installmentId: parcela, bruto: '1000' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [stale, live],
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [live],
      client: lifecycleClient({
        byId: { [stale.externalId]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 1000 },
      }),
    });
    expect(counters.overCovered).toBe(1);
    expect(counters.deleted).toBe(1);
    expect(await statusOf(integration.id, stale.externalId)).toBe('DELETED');
    expect(await statusOf(integration.id, live.externalId)).toBe('ACTIVE');
  });

  it('CASO 7 — settlement DELETED reaparece → upsert reativa ACTIVE', async () => {
    const { tenant, integration } = await seedConnected('10c-7');
    const parcela = 'parcela-reappear';
    const item = settlement({ id: 'reappear-1', installmentId: parcela, bruto: '80' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [item],
    );
    await ledger.markDeleted({ tenantId: tenant.id, integrationId: integration.id }, item.externalId);
    expect(await statusOf(integration.id, item.externalId)).toBe('DELETED');
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [item],
    );
    expect(await statusOf(integration.id, item.externalId)).toBe('ACTIVE');
  });

  it('CASO 8 — mesmo external_id com metadata atualizada faz UPDATE, não nova row', async () => {
    const { tenant, integration } = await seedConnected('10c-8');
    const parcela = 'parcela-meta';
    const first = settlement({
      id: 'meta-1',
      installmentId: parcela,
      bruto: '50',
      paymentMethod: 'PIX',
    });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [first],
    );
    const updated = settlement({
      id: 'meta-1',
      installmentId: parcela,
      bruto: '50',
      paymentMethod: 'TED',
    });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [updated],
    );
    const rows = await prisma.financialTransaction.findMany({
      where: { integrationId: integration.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.paymentMethod).toBe('TED');
    expect(rows[0]?.lifecycleStatus).toBe('ACTIVE');
  });

  it('CASO 9 — novo external_id B; A DELETED após reconcile seguro', async () => {
    const { tenant, integration } = await seedConnected('10c-9');
    const parcela = 'parcela-swap';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '200' })],
    );
    const a = settlement({ id: 'swap-a', installmentId: parcela, bruto: '200' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [a],
    );
    const b = settlement({ id: 'swap-b', installmentId: parcela, bruto: '200' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [b],
    );
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [b],
      client: lifecycleClient({
        byId: { [a.externalId]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 200 },
      }),
    });
    expect(await statusOf(integration.id, a.externalId)).toBe('DELETED');
    expect(await statusOf(integration.id, b.externalId)).toBe('ACTIVE');
  });

  it('CASO 10 — A+B+C → A+C; B DELETED', async () => {
    const { tenant, integration } = await seedConnected('10c-10');
    const parcela = 'parcela-abc';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '600' })],
    );
    const a = settlement({ id: 'abc-a', installmentId: parcela, bruto: '200' });
    const b = settlement({ id: 'abc-b', installmentId: parcela, bruto: '200' });
    const c = settlement({ id: 'abc-c', installmentId: parcela, bruto: '200' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [a, b, c],
    );
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [a, c],
      client: lifecycleClient({
        byId: { [b.externalId]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 400 },
      }),
    });
    // paid local ainda 600 mas valor_pago da parcela (upstream) = 400 = A+C
    expect(await statusOf(integration.id, b.externalId)).toBe('DELETED');
    expect(await statusOf(integration.id, a.externalId)).toBe('ACTIVE');
    expect(await statusOf(integration.id, c.externalId)).toBe('ACTIVE');
  });

  it('11 — resync idempotente não tombstone novamente', async () => {
    const { tenant, integration } = await seedConnected('10c-11');
    const parcela = 'parcela-idem';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '100' })],
    );
    const stale = settlement({ id: 'idem-stale', installmentId: parcela, bruto: '100' });
    const live = settlement({ id: 'idem-live', installmentId: parcela, bruto: '100' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [stale, live],
    );
    const client = lifecycleClient({
      byId: { [stale.externalId]: { kind: 'not_found' } },
      detail: { id: parcela, status: 'QUITADO', valor_pago: 100 },
    });
    const first = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [live],
      client,
    });
    const second = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [live],
      client,
    });
    expect(first.deleted).toBe(1);
    expect(second.deleted).toBe(0);
    expect(second.missingSettlement).toBe(0);
    expect(await statusOf(integration.id, stale.externalId)).toBe('DELETED');
  });

  it('12 — DELETED não entra no matcher CASH-9C / 10-A', () => {
    const transfer = {
      id: 'tr-1',
      occurredOn: new Date('2026-08-31T00:00:00.000Z'),
      amount: new Prisma.Decimal('100'),
      sourceFinancialAccountExternalId: ACC,
      destinationFinancialAccountExternalId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    };
    const deleted = {
      id: 's-del',
      occurredOn: transfer.occurredOn,
      netAmount: new Prisma.Decimal('100'),
      financialAccountExternalId: ACC,
      lifecycleStatus: 'DELETED' as const,
      transactionType: 'DISBURSEMENT' as const,
    };
    const active = {
      ...deleted,
      id: 's-act',
      lifecycleStatus: 'ACTIVE' as const,
    };
    expect(decideTransferMatches([transfer], [deleted])[0]).toEqual({
      transferId: 'tr-1',
      status: 'UNMATCHED',
    });
    expect(decideTransferMatches([transfer], [active])[0]).toEqual({
      transferId: 'tr-1',
      status: 'MATCHED',
      settlementId: 's-act',
    });
  });

  it('13 — ACTIVE→DELETED sai das leituras realized (CASH-4B)', async () => {
    const { tenant, integration } = await seedConnected('10c-13');
    const parcela = 'parcela-kpi';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '536.04' })],
    );
    const stale = settlement({ id: 'kpi-stale', installmentId: parcela, bruto: '536.04' });
    const live = settlement({ id: 'kpi-live', installmentId: parcela, bruto: '536.04' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [stale, live],
    );
    const before = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      integrationId: integration.id,
      monthKey: '2026-08',
      now: new Date('2026-09-05T12:00:00.000Z'),
    });
    expect(before.realized.outflows?.toNumber()).toBeGreaterThanOrEqual(1072);
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [live],
      client: lifecycleClient({
        byId: { [stale.externalId]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 536.04 },
      }),
    });
    const after = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      integrationId: integration.id,
      monthKey: '2026-08',
      now: new Date('2026-09-05T12:00:00.000Z'),
    });
    expect(after.realized.outflows?.toNumber()).toBe(
      (before.realized.outflows?.toNumber() ?? 0) - 536.04,
    );
  });

  it('14 — dois external_ids distintos ambos upstream NÃO deduplicam', async () => {
    const { tenant, integration } = await seedConnected('10c-14');
    const parcela = 'parcela-dup-ok';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '200' })],
    );
    const a = settlement({ id: 'dup-a', installmentId: parcela, bruto: '100', data: '2026-08-31' });
    const b = settlement({ id: 'dup-b', installmentId: parcela, bruto: '100', data: '2026-08-31' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [a, b],
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [a, b],
      client: lifecycleClient({
        detail: { id: parcela, status: 'QUITADO', valor_pago: 200 },
      }),
    });
    expect(counters.deleted).toBe(0);
    expect(await prisma.financialTransaction.count({
      where: { integrationId: integration.id, lifecycleStatus: 'ACTIVE' },
    })).toBe(2);
  });

  it('15 — falha no detalhe da parcela não causa tombstone', async () => {
    const { tenant, integration } = await seedConnected('10c-15');
    const parcela = 'parcela-pagfail';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '100' })],
    );
    const stale = settlement({ id: 'pag-stale', installmentId: parcela, bruto: '100' });
    const live = settlement({ id: 'pag-live', installmentId: parcela, bruto: '100' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [stale, live],
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [live],
      client: lifecycleClient({
        byId: { [stale.externalId]: { kind: 'not_found' } },
        detailError: new ContaAzulApiError('unavailable', 'timeout detail', { httpStatus: 500 }),
      }),
    });
    expect(counters.deleted).toBe(0);
    expect(counters.skippedFetchFailure).toBe(1);
    expect(await statusOf(integration.id, stale.externalId)).toBe('ACTIVE');
  });

  it('16 — ledger sync (default autoTombstone) reconcilia stale sem deixar duplicata ACTIVE', async () => {
    const { tenant, integration } = await seedConnected('10c-16');
    const parcela = 'parcela-sync-full';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '2550.82' })],
    );
    const stale = settlement({ id: 'sync-stale', installmentId: parcela, bruto: '2550.82' });
    const live = settlement({ id: 'sync-live', installmentId: parcela, bruto: '2550.82' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [stale, live],
    );
    const base = createMockContaAzulApiClient();
    const client: ContaAzulApiClient = {
      ...base,
      getInstallmentSettlements: async () => [
        {
          id: live.externalId,
          id_parcela: parcela,
          data_pagamento: '2026-08-31',
          tipo_evento_financeiro: 'DESPESA',
          valor_composicao: {
            valor_bruto: '2550.82',
            valor_liquido: '2550.82',
            juros: '0',
            multa: '0',
            desconto: '0',
            taxa: '0',
          },
          conta_financeira: { id: ACC },
        },
      ],
      getSettlementById: async (_t, id) =>
        id === stale.externalId ? { kind: 'not_found' } : { kind: 'found', payload: { id } },
      getInstallmentDetail: async () => ({
        id: parcela,
        status: 'QUITADO',
        valor_pago: 2550.82,
      }),
    };
    const summary = await createContaAzulLedgerSyncService({
      prisma,
      ledger,
      apiClient: client,
    }).sync({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      mode: 'incremental',
      changedInstallments: [{ kind: 'PAYABLE', externalId: parcela }],
      paymentDiscoveryWindow: null,
      dueHorizon: { de: '2026-08-01', ate: '2026-08-31' },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
    expect(summary.autoTombstone).toBe(true);
    expect(summary.lifecycle.deleted).toBe(1);
    expect(await statusOf(integration.id, stale.externalId)).toBe('DELETED');
    expect(await statusOf(integration.id, live.externalId)).toBe('ACTIVE');
  });

  it('17 — sync recorrente (mesmo caminho incremental) reconcilia stale', async () => {
    const { tenant, integration } = await seedConnected('10c-17');
    const parcela = '00fcc4f3-1ec7-458f-8560-b68aaa283711';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '536.04' })],
    );
    const stale = settlement({
      id: '81f28700-2131-4d78-b6b1-83a038751e62',
      installmentId: parcela,
      bruto: '536.04',
    });
    const live = settlement({
      id: 'bca05277-0ac7-4a49-9bbd-9ed5bc51195b',
      installmentId: parcela,
      bruto: '536.04',
    });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [stale, live],
    );
    const base = createMockContaAzulApiClient();
    const client: ContaAzulApiClient = {
      ...base,
      getInstallmentSettlements: async () => [
        {
          id: live.externalId,
          id_parcela: parcela,
          data_pagamento: '2026-08-31',
          tipo_evento_financeiro: 'DESPESA',
          valor_composicao: {
            valor_bruto: '536.04',
            valor_liquido: '536.04',
            juros: '0',
            multa: '0',
            desconto: '0',
            taxa: '0',
          },
          conta_financeira: { id: ACC },
        },
      ],
      getSettlementById: async (_t, id) =>
        id === stale.externalId ? { kind: 'not_found' } : { kind: 'found', payload: { id } },
      getInstallmentDetail: async () => ({
        id: parcela,
        status: 'QUITADO',
        valor_pago: 536.04,
      }),
    };
    const summary = await createContaAzulLedgerSyncService({
      prisma,
      ledger,
      apiClient: client,
    }).sync({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      mode: 'incremental',
      changedInstallments: [{ kind: 'PAYABLE', externalId: parcela }],
      paymentDiscoveryWindow: null,
      dueHorizon: { de: '2026-08-01', ate: '2026-09-05' },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
    expect(summary.lifecycle.deleted).toBe(1);
    expect(await statusOf(integration.id, stale.externalId)).toBe('DELETED');
  });
});
