import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { formatCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { isInstallmentLedgerCovered } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger-coverage.js';
import { CONTA_AZUL_LEDGER_AUTO_TOMBSTONE } from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulLedgerLifecycleService } from '../src/modules/integrations/conta-azul/services/conta-azul-ledger-lifecycle.service.js';
import { createContaAzulLedgerBackfillService } from '../src/modules/integrations/conta-azul/services/conta-azul-ledger-backfill.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import {
  ContaAzulApiError,
  type ContaAzulApiClient,
  type ContaAzulSettlementLookup,
} from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import { cleanTestDatabase } from './helpers/test-database.js';
import type { MappedInstallment } from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-mappers.js';
import { createMonthlyCashFlowService } from '../src/modules/analytics/services/monthly-cash-flow.service.js';
import { createLedgerReadRepository } from '../src/modules/finance/repositories/ledger-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import type { MappedSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const ledger = createContaAzulLedgerRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const cashFlow = createMonthlyCashFlowService({
  ledger: createLedgerReadRepository(prisma),
  receivables: createReceivableReadRepository(prisma),
  payables: createPayableReadRepository(prisma),
});

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
    dueDate: new Date('2026-08-12T00:00:00.000Z'),
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
  readonly liquido?: string;
  readonly data?: string;
  readonly juros?: string;
  readonly multa?: string;
}): MappedSettlement {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data ?? '2026-08-12',
    tipo_evento_financeiro: 'RECEITA',
    valor_composicao: {
      valor_bruto: input.bruto,
      valor_liquido: input.liquido ?? input.bruto,
      juros: input.juros ?? '0',
      multa: input.multa ?? '0',
      desconto: '0',
      taxa: '0',
    },
  });
}

function lifecycleClient(input: {
  readonly list?: unknown;
  readonly listError?: ContaAzulApiError;
  readonly byId?: Record<string, ContaAzulSettlementLookup | ContaAzulApiError>;
  readonly detail?: unknown;
  readonly detailError?: ContaAzulApiError;
}): ContaAzulApiClient {
  const base = createMockContaAzulApiClient();
  return {
    ...base,
    getInstallmentSettlements: async () => {
      if (input.listError) {
        throw input.listError;
      }
      return input.list ?? [];
    },
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
  readonly upstream: readonly MappedSettlement[];
  readonly listWasEmpty: boolean;
  readonly listOk?: boolean;
  readonly autoTombstone: boolean;
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
    installmentKind: 'RECEIVABLE',
    previousRows,
    upstreamItems: input.upstream,
    listWasEmpty: input.listWasEmpty,
    listOk: input.listOk ?? true,
    autoTombstone: input.autoTombstone,
    requestWithAuth: async (work) => work('token'),
    gatedGet: async (work) => work(),
  });
}

describe('CASH-8A lifecycle do ledger', () => {
  it('L1 — IDs iguais não mudam lifecycle', async () => {
    const { tenant, integration } = await seedConnected('l1');
    const parcela = 'parcela-l1';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '80' })],
    );
    const item = settlement({ id: 'baixa-l1', installmentId: parcela, bruto: '80' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [item],
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [item],
      listWasEmpty: false,
      autoTombstone: true,
      client: lifecycleClient({
        list: [{ id: 'baixa-l1' }],
        byId: { 'baixa-l1': { kind: 'found', payload: { id: 'baixa-l1' } } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 80 },
      }),
    });
    const row = await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId: integration.id },
    });
    expect(row.lifecycleStatus).toBe('ACTIVE');
    expect(counters.deleted).toBe(0);
    expect(counters.confirmedStale).toBe(0);
  });

  it('L2 — novo ID permanece ACTIVE no upsert', async () => {
    const { tenant, integration } = await seedConnected('l2');
    const item = settlement({ id: 'baixa-nova', installmentId: 'parcela-l2', bruto: '10' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [item],
    );
    const row = await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId: integration.id },
    });
    expect(row.lifecycleStatus).toBe('ACTIVE');
    expect(row.externalId).toBe('baixa-nova');
  });

  it('L3 — R3 completo com flag true marca ausente DELETED', async () => {
    const { tenant, integration } = await seedConnected('l3');
    const parcela = 'e5a3c07c-0fcf-427b-8d4b-1c243e5534d8';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '37593.68' })],
    );
    const stale = settlement({
      id: 'f85c987d-fa6d-4159-a490-53a56a4d13ba',
      installmentId: parcela,
      bruto: '37593.68',
    });
    const current = settlement({
      id: 'ffe2bfc4-3368-46eb-ba93-c545036652f1',
      installmentId: parcela,
      bruto: '37593.68',
    });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [stale, current],
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [current],
      listWasEmpty: false,
      autoTombstone: true,
      client: lifecycleClient({
        byId: { [stale.externalId]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 37593.68 },
      }),
    });
    const rows = await prisma.financialTransaction.findMany({
      where: { integrationId: integration.id },
      orderBy: { externalId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.externalId === stale.externalId)?.lifecycleStatus).toBe('DELETED');
    expect(rows.find((row) => row.externalId === current.externalId)?.lifecycleStatus).toBe('ACTIVE');
    expect(counters.deleted).toBe(1);
    expect(counters.confirmedStale).toBe(1);
    expect(
      isInstallmentLedgerCovered({
        paid: new Prisma.Decimal('37593.68'),
        rows,
      }),
    ).toBe(true);
  });

  it('L4 / fixture 9c880 — lista [] não tombstona mesmo com flag true', async () => {
    const { tenant, integration } = await seedConnected('l4');
    const parcela = '9c880f8e-0168-4673-a243-f7f6fa8ada84';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10881' })],
    );
    const item = settlement({
      id: '67e937e2-6b0b-4907-bb27-cedb706d8ab7',
      installmentId: parcela,
      bruto: '10881',
      data: '2026-08-20',
    });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [item],
    );
    const counters = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      autoTombstone: true,
      client: lifecycleClient({
        list: [],
        byId: { [item.externalId]: { kind: 'not_found' } },
        detailError: new ContaAzulApiError('unavailable', '404', { httpStatus: 404 }),
      }),
    });
    const row = await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId: integration.id },
    });
    expect(row.lifecycleStatus).toBe('ACTIVE');
    expect(counters.upstreamEmpty).toBe(1);
    expect(counters.deleted).toBe(0);
  });

  it('L5/L6 — erro de lista ou 5xx no GET individual não muta', async () => {
    const { tenant, integration } = await seedConnected('l5');
    const parcela = 'parcela-err';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    const a = settlement({ id: 'a', installmentId: parcela, bruto: '10' });
    const b = settlement({ id: 'b', installmentId: parcela, bruto: '10' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [a, b],
    );
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [b],
      listWasEmpty: false,
      autoTombstone: true,
      client: lifecycleClient({
        byId: { a: new ContaAzulApiError('unavailable', 'boom', { httpStatus: 500 }) },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 10 },
      }),
    });
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: false,
      listOk: false,
      autoTombstone: true,
      client: lifecycleClient({
        listError: new ContaAzulApiError('unavailable', 'lista', { httpStatus: 500 }),
      }),
    });
    const rows = await prisma.financialTransaction.findMany({
      where: { integrationId: integration.id },
    });
    expect(rows.every((row) => row.lifecycleStatus === 'ACTIVE')).toBe(true);
  });

  it('L7 — timeout no GET individual não muta', async () => {
    const { tenant, integration } = await seedConnected('l7');
    const parcela = 'parcela-timeout';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    const a = settlement({ id: 'ta', installmentId: parcela, bruto: '10' });
    const b = settlement({ id: 'tb', installmentId: parcela, bruto: '10' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [a, b],
    );
    await expect(
      runLifecycle({
        tenantId: tenant.id,
        integrationId: integration.id,
        installmentId: parcela,
        upstream: [b],
        listWasEmpty: false,
        autoTombstone: true,
        client: lifecycleClient({
          byId: { ta: new ContaAzulApiError('timeout', 'timeout') },
          detail: { id: parcela, status: 'QUITADO', valor_pago: 10 },
        }),
      }),
    ).rejects.toMatchObject({ kind: 'timeout' });
    expect(
      (
        await prisma.financialTransaction.findMany({
          where: { integrationId: integration.id },
        })
      ).every((row) => row.lifecycleStatus === 'ACTIVE'),
    ).toBe(true);
  });

  it('L8 — DELETED reaparece via upsert e volta ACTIVE', async () => {
    const { tenant, integration } = await seedConnected('l8');
    const parcela = 'parcela-l8';
    const item = settlement({ id: 'baixa-l8', installmentId: parcela, bruto: '50' });
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() };
    await ledger.upsertSettlements(scope, 'RECEIVABLE', [item]);
    await ledger.markDeleted({ tenantId: tenant.id, integrationId: integration.id }, item.externalId);
    expect(
      (await prisma.financialTransaction.findFirstOrThrow({ where: { integrationId: integration.id } }))
        .lifecycleStatus,
    ).toBe('DELETED');
    await ledger.upsertSettlements(scope, 'RECEIVABLE', [item]);
    const row = await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId: integration.id },
    });
    expect(row.lifecycleStatus).toBe('ACTIVE');
    expect(formatCivilDate(row.occurredOn)).toBe('2026-08-12');
    expect(row.netAmount.toString()).toBe('50');
  });

  it('L9/L13/L14/L16/L17/L18 — substituição R3 preserva payload e isolamento', async () => {
    const a = await seedConnected('l9a');
    const b = await seedConnected('l9b');
    const parcela = 'parcela-l9';
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '100' })],
    );
    const stale = settlement({
      id: 'stale-a',
      installmentId: parcela,
      bruto: '100',
      juros: '0',
      data: '2026-08-01',
    });
    const current = settlement({ id: 'live-b', installmentId: parcela, bruto: '100', data: '2026-08-01' });
    const other = settlement({ id: 'stale-a', installmentId: parcela, bruto: '9' });
    await ledger.upsertSettlements(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [stale, current],
    );
    await ledger.upsertSettlements(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [other],
    );
    const client = lifecycleClient({
      byId: { 'stale-a': { kind: 'not_found' } },
      detail: { id: parcela, status: 'QUITADO', valor_pago: 100 },
    });
    const first = await runLifecycle({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      installmentId: parcela,
      upstream: [current],
      listWasEmpty: false,
      autoTombstone: true,
      client,
    });
    const second = await runLifecycle({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      installmentId: parcela,
      upstream: [current],
      listWasEmpty: false,
      autoTombstone: true,
      client,
    });
    expect(first.deleted).toBe(1);
    expect(second.deleted).toBe(0);
    const local = await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId: a.integration.id, externalId: 'stale-a' },
    });
    expect(local.lifecycleStatus).toBe('DELETED');
    expect(local.grossAmount.toString()).toBe('100');
    expect(local.netAmount.toString()).toBe('100');
    expect(formatCivilDate(local.occurredOn)).toBe('2026-08-01');
    expect(
      (
        await prisma.financialTransaction.findFirstOrThrow({
          where: { integrationId: b.integration.id, externalId: 'stale-a' },
        })
      ).lifecycleStatus,
    ).toBe('ACTIVE');
    expect(await prisma.financialTransaction.count({ where: { integrationId: a.integration.id } })).toBe(2);
  });

  it('L10 — multi-baixa válida não tombstona', async () => {
    const { tenant, integration } = await seedConnected('l10');
    const parcela = '52cc77f3-bab3-4ad2-87b1-21335cd5e8b2';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '11550' })],
    );
    const one = settlement({ id: 'b1', installmentId: parcela, bruto: '10000' });
    const two = settlement({ id: 'b2', installmentId: parcela, bruto: '1550' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [one, two],
    );
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [one, two],
      listWasEmpty: false,
      autoTombstone: true,
      client: lifecycleClient({
        detail: { id: parcela, status: 'QUITADO', valor_pago: 11550 },
      }),
    });
    const rows = await prisma.financialTransaction.findMany({
      where: { integrationId: integration.id },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((row) => row.lifecycleStatus === 'ACTIVE')).toBe(true);
  });

  it('L11/L12 — over/under não ajustam matemática local', async () => {
    const { tenant, integration } = await seedConnected('l11');
    const parcela = 'parcela-over';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    const a = settlement({ id: 'oa', installmentId: parcela, bruto: '10' });
    const b = settlement({ id: 'ob', installmentId: parcela, bruto: '10' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [a, b],
    );
    const over = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [a, b],
      listWasEmpty: false,
      autoTombstone: true,
      client: lifecycleClient({
        detail: { id: parcela, status: 'QUITADO', valor_pago: 10 },
      }),
    });
    expect(over.overCovered).toBe(1);
    expect(over.deleted).toBe(0);
    expect(await prisma.financialTransaction.count({ where: { integrationId: integration.id } })).toBe(2);
  });

  it('L15 — MonthlyCashFlow ignora DELETED', async () => {
    const { tenant, integration } = await seedConnected('l15');
    const parcela = 'parcela-kpi';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '80' })],
    );
    const a = settlement({ id: 'kpi-a', installmentId: parcela, bruto: '80', data: '2026-08-10' });
    const b = settlement({ id: 'kpi-b', installmentId: parcela, bruto: '80', data: '2026-08-10' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [a, b],
    );
    const before = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      now: new Date('2026-08-26T15:00:00.000Z'),
      monthKey: '2026-08',
    });
    expect(before.realized.inflows?.toString()).toBe('160');
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [b],
      listWasEmpty: false,
      autoTombstone: true,
      client: lifecycleClient({
        byId: { 'kpi-a': { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 80 },
      }),
    });
    const after = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      now: new Date('2026-08-26T15:00:00.000Z'),
      monthKey: '2026-08',
    });
    expect(after.realized.inflows?.toString()).toBe('80');
  });

  it('L19 — remaining ≠ paid não tombstona o missing', async () => {
    const { tenant, integration } = await seedConnected('l19');
    const parcela = 'parcela-l19';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    const a = settlement({ id: 'm1', installmentId: parcela, bruto: '10' });
    const b = settlement({ id: 'm2', installmentId: parcela, bruto: '4' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [a, b],
    );
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [b],
      listWasEmpty: false,
      autoTombstone: true,
      client: lifecycleClient({
        byId: { m1: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 10 },
      }),
    });
    expect(
      (
        await prisma.financialTransaction.findFirstOrThrow({
          where: { integrationId: integration.id, externalId: 'm1' },
        })
      ).lifecycleStatus,
    ).toBe('ACTIVE');
  });

  it('L20 — GET missing 200 não tombstona', async () => {
    const { tenant, integration } = await seedConnected('l20');
    const parcela = 'parcela-l20';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    const a = settlement({ id: 'still-there', installmentId: parcela, bruto: '10' });
    const b = settlement({ id: 'listed', installmentId: parcela, bruto: '10' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [a, b],
    );
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [b],
      listWasEmpty: false,
      autoTombstone: true,
      client: lifecycleClient({
        byId: { 'still-there': { kind: 'found', payload: { id: 'still-there' } } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 10 },
      }),
    });
    expect(
      (
        await prisma.financialTransaction.findFirstOrThrow({
          where: { integrationId: integration.id, externalId: 'still-there' },
        })
      ).lifecycleStatus,
    ).toBe('ACTIVE');
  });

  it('L21 — parcela 404 não tombstona diferença parcial', async () => {
    const { tenant, integration } = await seedConnected('l21');
    const parcela = 'parcela-l21';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    const a = settlement({ id: 'gone', installmentId: parcela, bruto: '10' });
    const b = settlement({ id: 'kept', installmentId: parcela, bruto: '10' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [a, b],
    );
    await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [b],
      listWasEmpty: false,
      autoTombstone: true,
      client: lifecycleClient({
        byId: { gone: { kind: 'not_found' } },
        detailError: new ContaAzulApiError('unavailable', '404', { httpStatus: 404 }),
      }),
    });
    expect(
      (
        await prisma.financialTransaction.findFirstOrThrow({
          where: { integrationId: integration.id, externalId: 'gone' },
        })
      ).lifecycleStatus,
    ).toBe('ACTIVE');
  });

  it('L22/L23 / fixture e5a3 — flag false detecta e não muta; true muta', async () => {
    const { tenant, integration } = await seedConnected('l22');
    const parcela = 'e5a3-flag';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '37593.68' })],
    );
    const stale = settlement({ id: 'stale-flag', installmentId: parcela, bruto: '37593.68' });
    const current = settlement({ id: 'live-flag', installmentId: parcela, bruto: '37593.68' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [stale, current],
    );
    const client = lifecycleClient({
      byId: { 'stale-flag': { kind: 'not_found' } },
      detail: { id: parcela, status: 'QUITADO', valor_pago: 37593.68 },
    });
    const dry = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [current],
      listWasEmpty: false,
      autoTombstone: false,
      client,
    });
    expect(dry.confirmedStale).toBe(1);
    expect(dry.wouldDelete).toBe(1);
    expect(dry.deleted).toBe(0);
    expect(CONTA_AZUL_LEDGER_AUTO_TOMBSTONE).toBe(false);
    expect(
      (
        await prisma.financialTransaction.findFirstOrThrow({
          where: { integrationId: integration.id, externalId: 'stale-flag' },
        })
      ).lifecycleStatus,
    ).toBe('ACTIVE');
    const live = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [current],
      listWasEmpty: false,
      autoTombstone: true,
      client,
    });
    expect(live.deleted).toBe(1);
    expect(
      (
        await prisma.financialTransaction.findFirstOrThrow({
          where: { integrationId: integration.id, externalId: 'stale-flag' },
        })
      ).lifecycleStatus,
    ).toBe('DELETED');
  });

  it('backfill skip após R3 e não apaga R4', async () => {
    const { tenant, integration } = await seedConnected('bf-r3');
    const parcela = 'parcela-skip';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '80' })],
    );
    const stale = settlement({ id: 'skip-stale', installmentId: parcela, bruto: '80' });
    const current = settlement({ id: 'skip-live', installmentId: parcela, bruto: '80' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [stale, current],
    );
    await ledger.markDeleted({ tenantId: tenant.id, integrationId: integration.id }, stale.externalId);
    const client = lifecycleClient({
      list: [
        {
          id: current.externalId,
          id_parcela: parcela,
          data_pagamento: '2026-08-12',
          tipo_evento_financeiro: 'RECEITA',
          valor_composicao: {
            valor_bruto: '80',
            valor_liquido: '80',
            juros: '0',
            multa: '0',
            desconto: '0',
            taxa: '0',
          },
        },
      ],
      detail: { id: parcela, status: 'QUITADO', valor_pago: 80 },
    });
    const backfill = createContaAzulLedgerBackfillService({ prisma, ledger, apiClient: client });
    const summary = await backfill.run({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      autoTombstone: false,
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
    });
    expect(summary.skippedCovered).toBe(1);
    expect(summary.requested).toBe(0);
    expect(
      (
        await prisma.financialTransaction.findFirstOrThrow({
          where: { integrationId: integration.id, externalId: stale.externalId },
        })
      ).lifecycleStatus,
    ).toBe('DELETED');
  });

  it('forceReconcile observa R4 coberto sem tombstone', async () => {
    const { tenant, integration } = await seedConnected('force-r4');
    const parcela = '9c880-force';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10881' })],
    );
    const item = settlement({ id: 'r4-live', installmentId: parcela, bruto: '10881' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [item],
    );
    const client = lifecycleClient({
      list: [],
      detailError: new ContaAzulApiError('unavailable', '404', { httpStatus: 404 }),
    });
    const backfill = createContaAzulLedgerBackfillService({ prisma, ledger, apiClient: client });
    const summary = await backfill.run({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      forceReconcile: true,
      autoTombstone: true,
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
    });
    expect(summary.skippedCovered).toBe(0);
    expect(summary.lifecycle.upstreamEmpty).toBe(1);
    expect(summary.lifecycle.deleted).toBe(0);
    expect(
      (
        await prisma.financialTransaction.findFirstOrThrow({
          where: { integrationId: integration.id },
        })
      ).lifecycleStatus,
    ).toBe('ACTIVE');
  });
});
