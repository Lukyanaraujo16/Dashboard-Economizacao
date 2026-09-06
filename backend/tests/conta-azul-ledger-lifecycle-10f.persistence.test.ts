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
import {
  CONTA_AZUL_LEDGER_AUTO_TOMBSTONE,
  LIFECYCLE_PROBE_OCCURRED_ON_LOOKBACK_DAYS,
  MAX_LIFECYCLE_PROBE_CANDIDATES_PER_SYNC,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-ledger.js';
import { addUtcDays, utcCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import { decideTransferMatches } from '../src/modules/integrations/conta-azul/domain/conta-azul-transfer-match.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import type { MappedSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import type { MappedInstallment } from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-mappers.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulTransferRepository } from '../src/modules/integrations/conta-azul/repositories/transfer.repository.js';
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
const transfers = createContaAzulTransferRepository(prisma);
const cashFlow = createMonthlyCashFlowService({
  ledger: createLedgerReadRepository(prisma),
  receivables: createReceivableReadRepository(prisma),
  payables: createPayableReadRepository(prisma),
  categories: createFinancialCategoryReadRepository(prisma),
});

const ACC = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const ACC_BTG = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const ACC_SRC = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

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
}): MappedSettlement {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: input.data ?? '2026-08-21',
    tipo_evento_financeiro: input.tipo ?? 'RECEITA',
    valor_composicao: {
      valor_bruto: input.bruto,
      valor_liquido: input.bruto,
      juros: '0',
      multa: '0',
      desconto: '0',
      taxa: '0',
    },
    conta_financeira: { id: input.account ?? ACC },
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
      return input.detail ?? { id: 'unknown', status: 'QUITADO', valor_pago: 0 };
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
    installmentKind: input.kind ?? 'RECEIVABLE',
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

function syncClient(hooks: {
  readonly listByInstallment?: Record<string, readonly Record<string, unknown>[]>;
  readonly lookupById?: Record<string, 'found' | 'not_found' | ContaAzulApiError>;
  readonly detailByInstallment?: Record<string, unknown | ContaAzulApiError>;
  readonly onSettlementsFetch?: (installmentId: string) => void;
}): ContaAzulApiClient {
  const base = createMockContaAzulApiClient();
  return {
    ...base,
    getInstallmentSettlements: async (_token, installmentId) => {
      hooks.onSettlementsFetch?.(installmentId);
      return [...(hooks.listByInstallment?.[installmentId] ?? [])];
    },
    getSettlementById: async (_token, id) => {
      const mapped = hooks.lookupById?.[id] ?? 'not_found';
      if (mapped instanceof ContaAzulApiError) {
        throw mapped;
      }
      if (mapped === 'found') {
        return { kind: 'found', payload: { id } };
      }
      return { kind: 'not_found' };
    },
    getInstallmentDetail: async (_token, installmentId) => {
      const mapped = hooks.detailByInstallment?.[installmentId];
      if (mapped instanceof ContaAzulApiError) {
        throw mapped;
      }
      if (mapped) {
        return mapped;
      }
      return {
        id: installmentId,
        status: 'QUITADO',
        valor_pago: 0,
      };
    },
  };
}

async function runIncremental(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly client: ContaAzulApiClient;
  readonly changedInstallments?: ReadonlyArray<{
    readonly kind: 'RECEIVABLE' | 'PAYABLE';
    readonly externalId: string;
  }>;
}) {
  return createContaAzulLedgerSyncService({
    prisma,
    ledger,
    apiClient: input.client,
  }).sync({
    scope: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      syncedAt: new Date(),
    },
    mode: 'incremental',
    changedInstallments: input.changedInstallments ?? [],
    paymentDiscoveryWindow: null,
    dueHorizon: { de: '2026-08-01', ate: '2026-09-06' },
    requestWithAuth: async (work) => work('token'),
    gatedGet: async (work) => work(),
    heartbeat: async () => undefined,
  });
}

describe('Correção 10-F — CONFIRMED_UPSTREAM_ORPHAN', () => {
  it('A/L — [] + settlement 404 + installment 404 + autoTombstone => markDeleted', async () => {
    const { tenant, integration } = await seedConnected('10f-a');
    const parcela = 'parcela-orphan-a';
    const baixa = 'baixa-orphan-a';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '100' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: baixa, installmentId: parcela, bruto: '100' })],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      autoTombstone: true,
      client: lifecycleClient({
        byId: { [baixa]: { kind: 'not_found' } },
        detailError: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
      }),
    });
    expect(result.probeConclusive).toBe(true);
    expect(result.counters.confirmedUpstreamOrphan).toBe(1);
    expect(result.counters.orphanTombstoned).toBe(1);
    expect(result.counters.deleted).toBe(1);
    expect(result.counters.upstreamEmpty).toBe(0);
    expect(await statusOf(integration.id, baixa)).toBe('DELETED');
  });

  it('B — [] + settlement 404 + installment 200 => HOLD', async () => {
    const { tenant, integration } = await seedConnected('10f-b');
    const parcela = 'parcela-hold-b';
    const baixa = 'baixa-hold-b';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '50' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: baixa, installmentId: parcela, bruto: '50' })],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      client: lifecycleClient({
        byId: { [baixa]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 50 },
      }),
    });
    expect(result.counters.upstreamEmpty).toBe(1);
    expect(result.counters.confirmedUpstreamOrphan).toBe(0);
    expect(result.counters.deleted).toBe(0);
    expect(await statusOf(integration.id, baixa)).toBe('ACTIVE');
  });

  it('C — [] + settlement FOUND + installment 404 => HOLD', async () => {
    const { tenant, integration } = await seedConnected('10f-c');
    const parcela = 'parcela-hold-c';
    const baixa = 'baixa-hold-c';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '50' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: baixa, installmentId: parcela, bruto: '50' })],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      client: lifecycleClient({
        byId: { [baixa]: { kind: 'found', payload: { id: baixa } } },
        detailError: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
      }),
    });
    expect(result.counters.upstreamEmpty).toBe(1);
    expect(result.counters.deleted).toBe(0);
    expect(await statusOf(integration.id, baixa)).toBe('ACTIVE');
  });

  it('D — settlement timeout => HOLD / failure, sem tombstone', async () => {
    const { tenant, integration } = await seedConnected('10f-d');
    const parcela = 'parcela-timeout';
    const baixa = 'baixa-timeout';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: baixa, installmentId: parcela, bruto: '10' })],
    );
    await expect(
      runLifecycle({
        tenantId: tenant.id,
        integrationId: integration.id,
        installmentId: parcela,
        upstream: [],
        listWasEmpty: true,
        client: lifecycleClient({
          byId: {
            [baixa]: new ContaAzulApiError('timeout', 'slow'),
          },
          detailError: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
        }),
      }),
    ).rejects.toBeInstanceOf(ContaAzulApiError);
    expect(await statusOf(integration.id, baixa)).toBe('ACTIVE');
  });

  it('E — settlement 429 => não tombstone, probe inconclusivo', async () => {
    const { tenant, integration } = await seedConnected('10f-e');
    const parcela = 'parcela-429';
    const baixa = 'baixa-429';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: baixa, installmentId: parcela, bruto: '10' })],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      client: lifecycleClient({
        byId: {
          [baixa]: new ContaAzulApiError('rate_limited', 'slow down', { httpStatus: 429 }),
        },
      }),
    });
    expect(result.probeConclusive).toBe(false);
    expect(result.counters.orphanProbeFailed).toBe(1);
    expect(result.counters.deleted).toBe(0);
    expect(await statusOf(integration.id, baixa)).toBe('ACTIVE');
  });

  it('F — installment 500 => não tombstone', async () => {
    const { tenant, integration } = await seedConnected('10f-f');
    const parcela = 'parcela-500';
    const baixa = 'baixa-500';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: baixa, installmentId: parcela, bruto: '10' })],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      client: lifecycleClient({
        byId: { [baixa]: { kind: 'not_found' } },
        detailError: new ContaAzulApiError('unavailable', 'boom', { httpStatus: 500 }),
      }),
    });
    expect(result.probeConclusive).toBe(false);
    expect(result.counters.orphanProbeFailed).toBe(1);
    expect(await statusOf(integration.id, baixa)).toBe('ACTIVE');
  });

  it('G — listOk=false => não orphan tombstone', async () => {
    const { tenant, integration } = await seedConnected('10f-g');
    const parcela = 'parcela-listfail';
    const baixa = 'baixa-listfail';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: baixa, installmentId: parcela, bruto: '10' })],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: false,
      listOk: false,
      client: lifecycleClient({
        byId: { [baixa]: { kind: 'not_found' } },
        detailError: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
      }),
    });
    expect(result.probeConclusive).toBe(false);
    expect(result.counters.skippedFetchFailure).toBe(1);
    expect(result.counters.confirmedUpstreamOrphan).toBe(0);
    expect(await statusOf(integration.id, baixa)).toBe('ACTIVE');
  });

  it('H — LIST [] sozinho (sem probes conclusivos de orphan path com parcela viva) R4 HOLD', async () => {
    const { tenant, integration } = await seedConnected('10f-h');
    const parcela = 'parcela-r4-only';
    const baixa = 'baixa-r4-only';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: baixa, installmentId: parcela, bruto: '10' })],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      client: lifecycleClient({
        byId: { [baixa]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 10 },
      }),
    });
    expect(result.counters.upstreamEmpty).toBe(1);
    expect(result.counters.confirmedUpstreamOrphan).toBe(0);
  });

  it('I — múltiplos ACTIVE todos 404 + parcela 404 => todos tombstonados', async () => {
    const { tenant, integration } = await seedConnected('10f-i');
    const parcela = 'parcela-multi-orphan';
    const a = 'baixa-a';
    const b = 'baixa-b';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '200' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [
        settlement({ id: a, installmentId: parcela, bruto: '100' }),
        settlement({ id: b, installmentId: parcela, bruto: '100' }),
      ],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      client: lifecycleClient({
        byId: {
          [a]: { kind: 'not_found' },
          [b]: { kind: 'not_found' },
        },
        detailError: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
      }),
    });
    expect(result.counters.confirmedUpstreamOrphan).toBe(2);
    expect(result.counters.orphanTombstoned).toBe(2);
    expect(await statusOf(integration.id, a)).toBe('DELETED');
    expect(await statusOf(integration.id, b)).toBe('DELETED');
  });

  it('J — múltiplos ACTIVE com um found => nenhum tombstone R4b', async () => {
    const { tenant, integration } = await seedConnected('10f-j');
    const parcela = 'parcela-multi-hold';
    const a = 'baixa-found';
    const b = 'baixa-missing';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '200' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [
        settlement({ id: a, installmentId: parcela, bruto: '100' }),
        settlement({ id: b, installmentId: parcela, bruto: '100' }),
      ],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      client: lifecycleClient({
        byId: {
          [a]: { kind: 'found', payload: { id: a } },
          [b]: { kind: 'not_found' },
        },
        detailError: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
      }),
    });
    expect(result.counters.confirmedUpstreamOrphan).toBe(0);
    expect(await statusOf(integration.id, a)).toBe('ACTIVE');
    expect(await statusOf(integration.id, b)).toBe('ACTIVE');
  });

  it('K — autoTombstone=false => wouldTombstone sem escrita', async () => {
    const { tenant, integration } = await seedConnected('10f-k');
    const parcela = 'parcela-dry';
    const baixa = 'baixa-dry';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: baixa, installmentId: parcela, bruto: '10' })],
    );
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      autoTombstone: false,
      client: lifecycleClient({
        byId: { [baixa]: { kind: 'not_found' } },
        detailError: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
      }),
    });
    expect(result.counters.orphanWouldTombstone).toBe(1);
    expect(result.counters.deleted).toBe(0);
    expect(await statusOf(integration.id, baixa)).toBe('ACTIVE');
  });

  it('M — reappearance DELETED -> ACTIVE via upsert', async () => {
    const { tenant, integration } = await seedConnected('10f-m');
    const parcela = 'parcela-reappear';
    const item = settlement({ id: 'reappear-1', installmentId: parcela, bruto: '80' });
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [item],
    );
    await ledger.markDeleted({ tenantId: tenant.id, integrationId: integration.id }, item.externalId);
    expect(await statusOf(integration.id, item.externalId)).toBe('DELETED');
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [item],
    );
    expect(await statusOf(integration.id, item.externalId)).toBe('ACTIVE');
  });

  it('N/O — R3 Life lista não-vazia + under-covered preservados', async () => {
    const { tenant, integration } = await seedConnected('10f-n');
    const parcela = 'parcela-r3';
    const live = settlement({ id: 'live-r3', installmentId: parcela, bruto: '2550.82' });
    const stale = settlement({ id: 'stale-r3', installmentId: parcela, bruto: '2550.82' });
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '2550.82' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [live, stale],
    );
    const ok = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      kind: 'PAYABLE',
      upstream: [live],
      listWasEmpty: false,
      client: lifecycleClient({
        byId: { [stale.externalId]: { kind: 'not_found' } },
        detail: { id: parcela, status: 'QUITADO', valor_pago: 2550.82 },
      }),
    });
    expect(ok.counters.confirmedStale).toBe(1);
    expect(ok.counters.deleted).toBe(1);
    expect(await statusOf(integration.id, stale.externalId)).toBe('DELETED');

    const under = await seedConnected('10f-o');
    const parcelaU = 'parcela-under';
    const onlyHalf = settlement({ id: 'half', installmentId: parcelaU, bruto: '100' });
    const staleU = settlement({ id: 'stale-u', installmentId: parcelaU, bruto: '100' });
    await financial.upsertPayables(
      { tenantId: under.tenant.id, integrationId: under.integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcelaU, paid: '200' })],
    );
    await ledger.upsertSettlements(
      { tenantId: under.tenant.id, integrationId: under.integration.id, syncedAt: new Date() },
      'PAYABLE',
      [onlyHalf, staleU],
    );
    const underResult = await runLifecycle({
      tenantId: under.tenant.id,
      integrationId: under.integration.id,
      installmentId: parcelaU,
      kind: 'PAYABLE',
      upstream: [onlyHalf],
      listWasEmpty: false,
      client: lifecycleClient({
        byId: { [staleU.externalId]: { kind: 'not_found' } },
        detail: { id: parcelaU, status: 'QUITADO', valor_pago: 200 },
      }),
    });
    expect(underResult.counters.skippedUnderCovered).toBe(1);
    expect(await statusOf(under.integration.id, staleU.externalId)).toBe('ACTIVE');
  });

  it('Caso Blooty-like 24017.08 => tombstone genérico', async () => {
    const { tenant, integration } = await seedConnected('10f-blooty-a');
    const parcela = 'installment-aporte-like';
    const baixa = 'settlement-aporte-like';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '24017.08' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [
        settlement({
          id: baixa,
          installmentId: parcela,
          bruto: '24017.08',
          data: '2026-08-21',
        }),
      ],
    );
    const before = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      integrationId: integration.id,
      monthKey: '2026-08',
      now: new Date('2026-09-05T12:00:00.000Z'),
    });
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      client: lifecycleClient({
        byId: { [baixa]: { kind: 'not_found' } },
        detailError: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
      }),
    });
    expect(result.counters.orphanTombstoned).toBe(1);
    const after = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      integrationId: integration.id,
      monthKey: '2026-08',
      now: new Date('2026-09-05T12:00:00.000Z'),
    });
    expect((before.realized.inflows?.toNumber() ?? 0) - (after.realized.inflows?.toNumber() ?? 0)).toBe(
      24017.08,
    );
  });

  it('Caso Blooty-like 20400 + AMBIGUOUS transfers: tombstone tx sem matcher', async () => {
    const { tenant, integration } = await seedConnected('10f-blooty-b');
    const parcela = 'installment-ghost-20400';
    const baixa = 'settlement-ghost-20400';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '20400' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [
        settlement({
          id: baixa,
          installmentId: parcela,
          bruto: '20400',
          data: '2026-08-24',
          account: ACC_BTG,
        }),
      ],
    );
    await transfers.upsertTransfers(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [
        {
          externalId: 'tr-1',
          occurredOn: new Date('2026-08-24T00:00:00.000Z'),
          amount: new Prisma.Decimal('20400'),
          sourceFinancialAccountExternalId: ACC_SRC,
          destinationFinancialAccountExternalId: ACC_BTG,
          description: 't1',
        },
        {
          externalId: 'tr-2',
          occurredOn: new Date('2026-08-24T00:00:00.000Z'),
          amount: new Prisma.Decimal('20400'),
          sourceFinancialAccountExternalId: ACC_SRC,
          destinationFinancialAccountExternalId: ACC_BTG,
          description: 't2',
        },
      ],
    );
    const txRow = await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId: integration.id, externalId: baixa },
    });
    const transferRowsBefore = await prisma.financialTransfer.findMany({
      where: { integrationId: integration.id },
      orderBy: { externalId: 'asc' },
    });
    const decisions = decideTransferMatches(
      transferRowsBefore.map((row) => ({
        id: row.id,
        occurredOn: row.occurredOn,
        amount: row.amount,
        sourceFinancialAccountExternalId: row.sourceFinancialAccountExternalId,
        destinationFinancialAccountExternalId: row.destinationFinancialAccountExternalId,
      })),
      [
        {
          id: txRow.id,
          occurredOn: txRow.occurredOn,
          netAmount: txRow.netAmount,
          financialAccountExternalId: txRow.financialAccountExternalId,
          lifecycleStatus: 'ACTIVE',
          transactionType: 'RECEIPT',
        },
      ],
    );
    expect(decisions.every((row) => row.status === 'AMBIGUOUS')).toBe(true);
    await prisma.financialTransfer.updateMany({
      where: { integrationId: integration.id },
      data: { matchStatus: 'AMBIGUOUS' },
    });

    const before = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      integrationId: integration.id,
      monthKey: '2026-08',
      now: new Date('2026-09-05T12:00:00.000Z'),
    });
    const result = await runLifecycle({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentId: parcela,
      upstream: [],
      listWasEmpty: true,
      client: lifecycleClient({
        byId: { [baixa]: { kind: 'not_found' } },
        detailError: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
      }),
    });
    expect(result.counters.orphanTombstoned).toBe(1);
    expect(await statusOf(integration.id, baixa)).toBe('DELETED');
    const tx = await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId: integration.id, externalId: baixa },
    });
    expect(tx.financialTransferId).toBeNull();
    const after = await cashFlow.getMonthlyCashFlow({
      tenantId: tenant.id,
      integrationId: integration.id,
      monthKey: '2026-08',
      now: new Date('2026-09-05T12:00:00.000Z'),
    });
    expect((before.realized.inflows?.toNumber() ?? 0) - (after.realized.inflows?.toNumber() ?? 0)).toBe(
      20400,
    );
    const transferRows = await prisma.financialTransfer.findMany({
      where: { integrationId: integration.id },
    });
    expect(transferRows.every((row) => row.matchStatus === 'AMBIGUOUS')).toBe(true);
    expect(transferRows.some((row) => row.matchStatus === 'MATCHED')).toBe(false);
  });
});

describe('Correção 10-F — bounded discovery + checkpoint', () => {
  it('T/U/S/Y — NULL first, sem starvation, limit 100, fora de 90d excluído', async () => {
    const { tenant, integration } = await seedConnected('10f-discovery');
    const today = utcCivilDate(new Date());
    const within = addUtcDays(today, -10);
    const outside = addUtcDays(today, -(LIFECYCLE_PROBE_OCCURRED_ON_LOOKBACK_DAYS + 5));
    const occurredOnFrom = addUtcDays(today, -(LIFECYCLE_PROBE_OCCURRED_ON_LOOKBACK_DAYS - 1));

    const ids: string[] = [];
    for (let i = 0; i < 105; i += 1) {
      const installmentId = `inst-${String(i).padStart(3, '0')}`;
      ids.push(installmentId);
      await ledger.upsertSettlements(
        { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
        'RECEIVABLE',
        [
          settlement({
            id: `baixa-${installmentId}`,
            installmentId,
            bruto: '1',
            data: within.toISOString().slice(0, 10),
          }),
        ],
      );
    }
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [
        settlement({
          id: 'baixa-old',
          installmentId: 'inst-old',
          bruto: '1',
          data: outside.toISOString().slice(0, 10),
        }),
      ],
    );

    const firstPage = await ledger.listBoundedLifecycleProbeCandidates(
      { tenantId: tenant.id, integrationId: integration.id },
      { occurredOnFrom, limit: MAX_LIFECYCLE_PROBE_CANDIDATES_PER_SYNC },
    );
    expect(firstPage).toHaveLength(100);
    expect(firstPage.every((row) => row.lastLifecycleCheckedAt === null)).toBe(true);
    expect(firstPage.some((row) => row.externalId === 'inst-old')).toBe(false);

    const checkedAt = new Date('2026-09-01T12:00:00.000Z');
    for (const row of firstPage) {
      await ledger.touchLifecycleCheckpoint(
        { tenantId: tenant.id, integrationId: integration.id },
        {
          installmentKind: row.kind,
          installmentExternalId: row.externalId,
          checkedAt,
        },
      );
    }

    const secondPage = await ledger.listBoundedLifecycleProbeCandidates(
      { tenantId: tenant.id, integrationId: integration.id },
      { occurredOnFrom, limit: MAX_LIFECYCLE_PROBE_CANDIDATES_PER_SYNC },
    );
    expect(secondPage.some((row) => row.lastLifecycleCheckedAt === null)).toBe(true);
    const neverChecked = secondPage.filter((row) => row.lastLifecycleCheckedAt === null);
    expect(neverChecked.length).toBe(5);
    expect(neverChecked.map((row) => row.externalId).sort()).toEqual(
      ['inst-100', 'inst-101', 'inst-102', 'inst-103', 'inst-104'].sort(),
    );
  });

  it('Q/R — isolamento tenant/integration na discovery', async () => {
    const a = await seedConnected('10f-iso-a');
    const b = await seedConnected('10f-iso-b');
    const occurredOnFrom = addUtcDays(utcCivilDate(new Date()), -89);
    await ledger.upsertSettlements(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: 'a1', installmentId: 'pa', bruto: '1', data: '2026-08-20' })],
    );
    await ledger.upsertSettlements(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: 'b1', installmentId: 'pb', bruto: '1', data: '2026-08-20' })],
    );
    const onlyA = await ledger.listBoundedLifecycleProbeCandidates(
      { tenantId: a.tenant.id, integrationId: a.integration.id },
      { occurredOnFrom, limit: 100 },
    );
    expect(onlyA.map((row) => row.externalId)).toEqual(['pa']);
  });

  it('V/W/X — changed/multi não truncados; dedupe com maintenance', async () => {
    const { tenant, integration } = await seedConnected('10f-dedupe');
    const changedId = 'changed-only';
    const multiId = 'multi-active';
    const maintId = 'maint-only';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [
        paidInstallment({ externalId: changedId, paid: '10' }),
        paidInstallment({ externalId: multiId, paid: '20' }),
        paidInstallment({ externalId: maintId, paid: '30' }),
      ],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: 'c1', installmentId: changedId, bruto: '10', tipo: 'DESPESA' }),
        settlement({ id: 'm1', installmentId: multiId, bruto: '10', tipo: 'DESPESA' }),
        settlement({ id: 'm2', installmentId: multiId, bruto: '10', tipo: 'DESPESA' }),
        settlement({ id: 'h1', installmentId: maintId, bruto: '30', tipo: 'DESPESA' }),
      ],
    );

    const fetched: string[] = [];
    const summary = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [{ kind: 'PAYABLE', externalId: changedId }],
      client: syncClient({
        onSettlementsFetch: (id) => fetched.push(id),
        listByInstallment: {
          [changedId]: [
            {
              id: 'c1',
              id_parcela: changedId,
              data_pagamento: '2026-08-21',
              tipo_evento_financeiro: 'DESPESA',
              valor_composicao: {
                valor_bruto: '10',
                valor_liquido: '10',
                juros: '0',
                multa: '0',
                desconto: '0',
                taxa: '0',
              },
              conta_financeira: { id: ACC },
            },
          ],
          [multiId]: [
            {
              id: 'm1',
              id_parcela: multiId,
              data_pagamento: '2026-08-21',
              tipo_evento_financeiro: 'DESPESA',
              valor_composicao: {
                valor_bruto: '10',
                valor_liquido: '10',
                juros: '0',
                multa: '0',
                desconto: '0',
                taxa: '0',
              },
              conta_financeira: { id: ACC },
            },
          ],
          [maintId]: [],
        },
        lookupById: {
          m2: 'not_found',
          h1: 'not_found',
        },
        detailByInstallment: {
          [multiId]: { id: multiId, status: 'QUITADO', valor_pago: 10 },
          [maintId]: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
          [changedId]: { id: changedId, status: 'QUITADO', valor_pago: 10 },
        },
      }),
    });

    expect(fetched.filter((id) => id === changedId)).toHaveLength(1);
    expect(fetched.filter((id) => id === multiId)).toHaveLength(1);
    expect(fetched.filter((id) => id === maintId)).toHaveLength(1);
    expect(new Set(fetched).size).toBe(fetched.length);
    expect(summary.candidates).toBeGreaterThanOrEqual(3);
    expect(await statusOf(integration.id, 'm2')).toBe('DELETED');
    expect(await statusOf(integration.id, 'h1')).toBe('DELETED');
  });

  it('checkpoint não avança em probe inconclusivo (429)', async () => {
    const { tenant, integration } = await seedConnected('10f-checkpoint-fail');
    const parcela = 'parcela-cp-fail';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: 'b-cp', installmentId: parcela, bruto: '10' })],
    );
    await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      client: syncClient({
        listByInstallment: { [parcela]: [] },
        lookupById: {
          'b-cp': new ContaAzulApiError('rate_limited', 'slow', { httpStatus: 429 }),
        },
      }),
    });
    const checkpoint = await prisma.financialInstallmentLifecycleCheckpoint.findFirst({
      where: {
        integrationId: integration.id,
        installmentExternalId: parcela,
      },
    });
    expect(checkpoint).toBeNull();
  });

  it('checkpoint avança após orphan conclusivo', async () => {
    const { tenant, integration } = await seedConnected('10f-checkpoint-ok');
    const parcela = 'parcela-cp-ok';
    await financial.upsertReceivables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '10' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'RECEIVABLE',
      [settlement({ id: 'b-ok', installmentId: parcela, bruto: '10' })],
    );
    await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      client: syncClient({
        listByInstallment: { [parcela]: [] },
        lookupById: { 'b-ok': 'not_found' },
        detailByInstallment: {
          [parcela]: new ContaAzulApiError('unavailable', 'gone', { httpStatus: 404 }),
        },
      }),
    });
    const checkpoint = await prisma.financialInstallmentLifecycleCheckpoint.findFirstOrThrow({
      where: {
        integrationId: integration.id,
        installmentExternalId: parcela,
      },
    });
    expect(checkpoint.lastLifecycleCheckedAt).toBeInstanceOf(Date);
    expect(await statusOf(integration.id, 'b-ok')).toBe('DELETED');
  });
});
