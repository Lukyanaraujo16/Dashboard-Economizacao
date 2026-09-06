import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { MappedInstallment } from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-mappers.js';
import { mapSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import type { MappedSettlement } from '../src/modules/integrations/conta-azul/domain/conta-azul-settlement-mappers.js';
import { ContaAzulApiError, type ContaAzulApiClient } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulLedgerRepository } from '../src/modules/integrations/conta-azul/repositories/ledger.repository.js';
import { createContaAzulLedgerSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-ledger-sync.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const ledger = createContaAzulLedgerRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);

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
}): MappedSettlement {
  return mapSettlement({
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: '2026-08-31',
    tipo_evento_financeiro: 'DESPESA',
    valor_composicao: {
      valor_bruto: input.bruto,
      valor_liquido: input.bruto,
      juros: '0',
      multa: '0',
      desconto: '0',
      taxa: '0',
    },
    conta_financeira: { id: ACC },
  });
}

function baixaPayload(input: {
  readonly id: string;
  readonly installmentId: string;
  readonly bruto: string;
}): Record<string, unknown> {
  return {
    id: input.id,
    id_parcela: input.installmentId,
    data_pagamento: '2026-08-31',
    tipo_evento_financeiro: 'DESPESA',
    valor_composicao: {
      valor_bruto: input.bruto,
      valor_liquido: input.bruto,
      juros: '0',
      multa: '0',
      desconto: '0',
      taxa: '0',
    },
    conta_financeira: { id: ACC },
  };
}

async function statusOf(integrationId: string, externalId: string) {
  return (
    await prisma.financialTransaction.findFirstOrThrow({
      where: { integrationId, externalId },
    })
  ).lifecycleStatus;
}

type SyncApiHooks = {
  readonly listByInstallment?: Record<string, readonly Record<string, unknown>[]>;
  readonly lookupById?: Record<string, 'found' | 'not_found' | 'error'>;
  readonly detailByInstallment?: Record<string, unknown>;
  readonly onSettlementsFetch?: (installmentId: string) => void;
};

function syncClient(hooks: SyncApiHooks): ContaAzulApiClient {
  const base = createMockContaAzulApiClient();
  return {
    ...base,
    getInstallmentSettlements: async (_token, installmentId) => {
      hooks.onSettlementsFetch?.(installmentId);
      return [...(hooks.listByInstallment?.[installmentId] ?? [])];
    },
    getSettlementById: async (_token, id) => {
      const kind = hooks.lookupById?.[id] ?? 'not_found';
      if (kind === 'error') {
        throw new ContaAzulApiError('unavailable', 'lookup failed', { httpStatus: 500 });
      }
      if (kind === 'found') {
        return { kind: 'found', payload: { id } };
      }
      return { kind: 'not_found' };
    },
    getInstallmentDetail: async (_token, installmentId) => {
      return (
        hooks.detailByInstallment?.[installmentId] ?? {
          id: installmentId,
          status: 'QUITADO',
          valor_pago: 0,
        }
      );
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

describe('Correção 10-C — candidatos multi-ACTIVE no incremental', () => {
  it('lista multi-ACTIVE só do tenant/integration e só ACTIVE', async () => {
    const a = await seedConnected('10c-ma-iso-a');
    const b = await seedConnected('10c-ma-iso-b');
    const parcelaA = '792e421e-65de-4116-84d4-203edf3ae454';
    const parcelaB = '00fcc4f3-1ec7-458f-8560-b68aaa283711';
    const parcelaSingle = 'single-active-only';

    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      [
        paidInstallment({ externalId: parcelaA, paid: '2550.82' }),
        paidInstallment({ externalId: parcelaSingle, paid: '100' }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcelaB, paid: '536.04' })],
    );

    await ledger.upsertSettlements(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: 'a-live', installmentId: parcelaA, bruto: '2550.82' }),
        settlement({ id: 'a-stale', installmentId: parcelaA, bruto: '2550.82' }),
        settlement({ id: 'a-single', installmentId: parcelaSingle, bruto: '100' }),
        settlement({ id: 'a-deleted-1', installmentId: 'deleted-pair', bruto: '10' }),
        settlement({ id: 'a-deleted-2', installmentId: 'deleted-pair', bruto: '10' }),
      ],
    );
    await ledger.markDeleted(
      { tenantId: a.tenant.id, integrationId: a.integration.id },
      'a-deleted-1',
    );
    await ledger.markDeleted(
      { tenantId: a.tenant.id, integrationId: a.integration.id },
      'a-deleted-2',
    );

    await ledger.upsertSettlements(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: 'b-live', installmentId: parcelaB, bruto: '536.04' }),
        settlement({ id: 'b-stale', installmentId: parcelaB, bruto: '536.04' }),
      ],
    );

    const onlyA = await ledger.listMultiActiveInstallments({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
    });
    expect(onlyA).toEqual([
      { kind: 'PAYABLE', externalId: parcelaA, activeCount: 2 },
    ]);

    const onlyB = await ledger.listMultiActiveInstallments({
      tenantId: b.tenant.id,
      integrationId: b.integration.id,
    });
    expect(onlyB).toEqual([
      { kind: 'PAYABLE', externalId: parcelaB, activeCount: 2 },
    ]);
  });

  it('Life — incremental sem changedInstallments tombstona stale multi-ACTIVE (2550.82)', async () => {
    const { tenant, integration } = await seedConnected('10c-ma-life-2550');
    const parcela = '792e421e-65de-4116-84d4-203edf3ae454';
    const liveId = 'b0df6a9a-c1ac-440e-99f3-b610586aa7dd';
    const staleId = 'fe924c42-be89-44fa-82c7-3896e12a3ddc';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '2550.82' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: liveId, installmentId: parcela, bruto: '2550.82' }),
        settlement({ id: staleId, installmentId: parcela, bruto: '2550.82' }),
      ],
    );

    const fetched: string[] = [];
    const summary = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [],
      client: syncClient({
        onSettlementsFetch: (id) => fetched.push(id),
        listByInstallment: {
          [parcela]: [baixaPayload({ id: liveId, installmentId: parcela, bruto: '2550.82' })],
        },
        lookupById: { [staleId]: 'not_found', [liveId]: 'found' },
        detailByInstallment: {
          [parcela]: { id: parcela, status: 'QUITADO', valor_pago: 2550.82 },
        },
      }),
    });

    expect(fetched).toEqual([parcela]);
    expect(summary.candidates).toBe(1);
    expect(summary.lifecycle.deleted).toBe(1);
    expect(await statusOf(integration.id, staleId)).toBe('DELETED');
    expect(await statusOf(integration.id, liveId)).toBe('ACTIVE');
  });

  it('Life — incremental sem changedInstallments tombstona stale multi-ACTIVE (536.04)', async () => {
    const { tenant, integration } = await seedConnected('10c-ma-life-536');
    const parcela = '00fcc4f3-1ec7-458f-8560-b68aaa283711';
    const liveId = '81f28700-2131-4d78-b6b1-83a038751e62';
    const staleId = 'bca05277-0ac7-4a49-9bbd-9ed5bc51195b';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '536.04' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: liveId, installmentId: parcela, bruto: '536.04' }),
        settlement({ id: staleId, installmentId: parcela, bruto: '536.04' }),
      ],
    );

    const summary = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [],
      client: syncClient({
        listByInstallment: {
          [parcela]: [baixaPayload({ id: liveId, installmentId: parcela, bruto: '536.04' })],
        },
        lookupById: { [staleId]: 'not_found', [liveId]: 'found' },
        detailByInstallment: {
          [parcela]: { id: parcela, status: 'QUITADO', valor_pago: 536.04 },
        },
      }),
    });

    expect(summary.lifecycle.deleted).toBe(1);
    expect(await statusOf(integration.id, staleId)).toBe('DELETED');
    expect(await statusOf(integration.id, liveId)).toBe('ACTIVE');
  });

  it('multi-ACTIVE + upstream mantém todos => nenhum delete', async () => {
    const { tenant, integration } = await seedConnected('10c-ma-keep-all');
    const parcela = 'parcela-keep-all';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '300' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: 'keep-a', installmentId: parcela, bruto: '100' }),
        settlement({ id: 'keep-b', installmentId: parcela, bruto: '200' }),
      ],
    );

    const summary = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [],
      client: syncClient({
        listByInstallment: {
          [parcela]: [
            baixaPayload({ id: 'keep-a', installmentId: parcela, bruto: '100' }),
            baixaPayload({ id: 'keep-b', installmentId: parcela, bruto: '200' }),
          ],
        },
        lookupById: { 'keep-a': 'found', 'keep-b': 'found' },
        detailByInstallment: {
          [parcela]: { id: parcela, status: 'QUITADO', valor_pago: 300 },
        },
      }),
    });

    expect(summary.lifecycle.deleted).toBe(0);
    expect(summary.lifecycle.missingSettlement).toBe(0);
    expect(await statusOf(integration.id, 'keep-a')).toBe('ACTIVE');
    expect(await statusOf(integration.id, 'keep-b')).toBe('ACTIVE');
  });

  it('multi-ACTIVE + lookup do ausente falha => HOLD', async () => {
    const { tenant, integration } = await seedConnected('10c-ma-lookup-fail');
    const parcela = 'parcela-lookup-fail';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '100' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: 'live-ok', installmentId: parcela, bruto: '100' }),
        settlement({ id: 'stale-err', installmentId: parcela, bruto: '100' }),
      ],
    );

    const summary = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [],
      client: syncClient({
        listByInstallment: {
          [parcela]: [baixaPayload({ id: 'live-ok', installmentId: parcela, bruto: '100' })],
        },
        lookupById: { 'stale-err': 'error', 'live-ok': 'found' },
        detailByInstallment: {
          [parcela]: { id: parcela, status: 'QUITADO', valor_pago: 100 },
        },
      }),
    });

    expect(summary.lifecycle.deleted).toBe(0);
    expect(summary.lifecycle.skippedFetchFailure).toBeGreaterThanOrEqual(1);
    expect(await statusOf(integration.id, 'stale-err')).toBe('ACTIVE');
  });

  it('multi-ACTIVE + remaining under_paid => HOLD', async () => {
    const { tenant, integration } = await seedConnected('10c-ma-under');
    const parcela = 'parcela-under';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '200' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: 'under-live', installmentId: parcela, bruto: '100' }),
        settlement({ id: 'under-stale', installmentId: parcela, bruto: '100' }),
      ],
    );

    const summary = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [],
      client: syncClient({
        listByInstallment: {
          [parcela]: [baixaPayload({ id: 'under-live', installmentId: parcela, bruto: '100' })],
        },
        lookupById: { 'under-stale': 'not_found', 'under-live': 'found' },
        detailByInstallment: {
          [parcela]: { id: parcela, status: 'QUITADO', valor_pago: 200 },
        },
      }),
    });

    expect(summary.lifecycle.deleted).toBe(0);
    expect(summary.lifecycle.skippedUnderCovered).toBe(1);
    expect(await statusOf(integration.id, 'under-stale')).toBe('ACTIVE');
  });

  it('multi-ACTIVE + lista upstream vazia => R4 HOLD', async () => {
    const { tenant, integration } = await seedConnected('10c-ma-empty');
    const parcela = 'parcela-empty';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '50' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: 'empty-a', installmentId: parcela, bruto: '50' }),
        settlement({ id: 'empty-b', installmentId: parcela, bruto: '50' }),
      ],
    );

    const summary = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [],
      client: syncClient({
        listByInstallment: { [parcela]: [] },
        detailByInstallment: {
          [parcela]: { id: parcela, status: 'QUITADO', valor_pago: 50 },
        },
      }),
    });

    expect(summary.lifecycle.deleted).toBe(0);
    expect(summary.lifecycle.upstreamEmpty).toBe(1);
    expect(await statusOf(integration.id, 'empty-a')).toBe('ACTIVE');
    expect(await statusOf(integration.id, 'empty-b')).toBe('ACTIVE');
  });

  it('candidato já em changedInstallments não duplica GET /baixa', async () => {
    const { tenant, integration } = await seedConnected('10c-ma-dedupe');
    const parcela = 'parcela-dedupe';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '80' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: 'dup-live', installmentId: parcela, bruto: '80' }),
        settlement({ id: 'dup-stale', installmentId: parcela, bruto: '80' }),
      ],
    );

    const fetched: string[] = [];
    const summary = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [{ kind: 'PAYABLE', externalId: parcela }],
      client: syncClient({
        onSettlementsFetch: (id) => fetched.push(id),
        listByInstallment: {
          [parcela]: [baixaPayload({ id: 'dup-live', installmentId: parcela, bruto: '80' })],
        },
        lookupById: { 'dup-stale': 'not_found', 'dup-live': 'found' },
        detailByInstallment: {
          [parcela]: { id: parcela, status: 'QUITADO', valor_pago: 80 },
        },
      }),
    });

    expect(fetched).toEqual([parcela]);
    expect(summary.candidates).toBe(1);
    expect(summary.lifecycle.deleted).toBe(1);
  });

  it('sem multi-ACTIVE e sem changedInstallments — 10-F maintenance ainda pode enfileirar single ACTIVE', async () => {
    const { tenant, integration } = await seedConnected('10c-ma-noop');
    const parcela = 'parcela-single';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '40' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [settlement({ id: 'only-one', installmentId: parcela, bruto: '40' })],
    );

    let fetched = 0;
    const summary = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [],
      client: syncClient({
        onSettlementsFetch: () => {
          fetched += 1;
        },
        listByInstallment: {
          [parcela]: [baixaPayload({ id: 'only-one', installmentId: parcela, bruto: '40' })],
        },
      }),
    });

    // 10-C: sem multi-ACTIVE. 10-F: maintenance bounded pode reconciliar single ACTIVE ≤90d.
    expect(summary.candidates).toBe(1);
    expect(fetched).toBe(1);
    expect(summary.lifecycle.deleted).toBe(0);
  });

  it('idempotência — segundo incremental após tombstone não re-tombstona', async () => {
    const { tenant, integration } = await seedConnected('10c-ma-idem');
    const parcela = 'parcela-idem';
    await financial.upsertPayables(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      [paidInstallment({ externalId: parcela, paid: '90' })],
    );
    await ledger.upsertSettlements(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt: new Date() },
      'PAYABLE',
      [
        settlement({ id: 'idem-live', installmentId: parcela, bruto: '90' }),
        settlement({ id: 'idem-stale', installmentId: parcela, bruto: '90' }),
      ],
    );

    const client = syncClient({
      listByInstallment: {
        [parcela]: [baixaPayload({ id: 'idem-live', installmentId: parcela, bruto: '90' })],
      },
      lookupById: { 'idem-stale': 'not_found', 'idem-live': 'found' },
      detailByInstallment: {
        [parcela]: { id: parcela, status: 'QUITADO', valor_pago: 90 },
      },
    });

    const first = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [],
      client,
    });
    expect(first.lifecycle.deleted).toBe(1);
    expect(await statusOf(integration.id, 'idem-stale')).toBe('DELETED');

    let fetched = 0;
    const second = await runIncremental({
      tenantId: tenant.id,
      integrationId: integration.id,
      changedInstallments: [],
      client: {
        ...client,
        getInstallmentSettlements: async (_t, id) => {
          fetched += 1;
          return client.getInstallmentSettlements('token', id);
        },
      },
    });
    // 10-F: maintenance pode revisitar a parcela (ainda há ACTIVE live), mas sem novo tombstone.
    expect(second.candidates).toBeGreaterThanOrEqual(1);
    expect(fetched).toBeGreaterThanOrEqual(1);
    expect(second.lifecycle.deleted).toBe(0);
  });
});
