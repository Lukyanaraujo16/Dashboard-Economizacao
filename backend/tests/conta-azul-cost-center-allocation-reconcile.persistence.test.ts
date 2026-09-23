import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { loadEnvironment } from '../src/config/env.js';
import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { COST_CENTER_DETAIL_RULE_VERSION } from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-detail-fetch.js';
import { parseCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import { createContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulCostCenterSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-cost-center-sync.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const costCenters = createContaAzulCostCenterRepository(prisma);

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

function detailWithCenters(centers: Array<{ id: string; name: string; amount: number }>) {
  return {
    id: 'parcela',
    evento: {
      rateio: [
        {
          rateio_centro_custo: centers.map((center) => ({
            id_centro_custo: center.id,
            nome_centro_custo: center.name,
            valor: center.amount,
          })),
        },
      ],
    },
  };
}

async function seedPayable(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly syncedAt: Date;
  readonly externalId: string;
  readonly total: string;
  readonly upstreamUpdatedAt: Date;
}) {
  const scope = {
    tenantId: input.tenantId,
    integrationId: input.integrationId,
    syncedAt: input.syncedAt,
  };
  await financial.upsertPayables(scope, [
    {
      externalId: input.externalId,
      description: 'parcela de homologação genérica',
      dueDate: parseCivilDate('2026-09-02', 'dueDate'),
      competenceDate: parseCivilDate('2026-09-02', 'competenceDate'),
      upstreamCreatedAt: null,
      upstreamUpdatedAt: input.upstreamUpdatedAt,
      status: 'PAID',
      upstreamStatus: 'PAGO',
      total: new Prisma.Decimal(input.total),
      paid: new Prisma.Decimal(input.total),
      unpaid: new Prisma.Decimal('0'),
      externalPartyId: null,
      categoryExternalIds: [],
    },
  ]);
  return prisma.payable.findFirstOrThrow({
    where: { tenantId: input.tenantId, externalId: input.externalId },
  });
}

describe('reconciliação automática de rateio (TTL + persistência)', () => {
  const upstreamUpdatedAt = new Date('2026-09-03T10:51:37.000Z');
  const detailSyncedAt = new Date('2026-09-03T14:28:17.161Z');
  const reconcileAt = new Date('2026-09-04T00:00:00.000Z');

  it('caso 1 + regressão: NO_ALLOCATION antigo converge sem avanço de data_alteracao', async () => {
    const { tenant, integration } = await seedConnected('cc-reconcile-1');
    const seedScope = {
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
    };
    await costCenters.upsertCostCenters(seedScope, [
      { externalId: 'cc-b', name: 'Centro B', code: null, active: true },
    ]);
    const payable = await seedPayable({
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
      externalId: 'parcela-stale-rateio',
      total: '3485',
      upstreamUpdatedAt,
    });
    await costCenters.markPayableCostCenterDetailState(tenant.id, payable.id, {
      status: 'NO_ALLOCATION',
      syncedAt: detailSyncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const listedFresh = await costCenters.listInstallmentsNeedingAllocationSync({
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(listedFresh.candidates).toHaveLength(0);

    const listedStale = await costCenters.listInstallmentsNeedingAllocationSync({
      tenantId: tenant.id,
      integrationId: integration.id,
      now: reconcileAt,
    });
    expect(listedStale.candidates.map((row) => row.externalId)).toEqual(['parcela-stale-rateio']);
    expect(listedStale.staleSelected).toBe(1);
    expect(listedStale.staleHotSelected).toBe(1);
    expect(listedStale.staleColdSelected).toBe(0);

    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: {
        getInstallmentDetail: async () =>
          detailWithCenters([{ id: 'cc-b', name: 'Centro B', amount: 3485 }]),
      } as never,
    });
    const result = await service.syncAllocationsForInstallments({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: reconcileAt },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(result.success).toBe(1);
    expect(result.allocationOpened).toBe(1);
    const after = await prisma.payable.findUniqueOrThrow({ where: { id: payable.id } });
    expect(after.costCenterDetailStatus).toBe('FETCHED');
    const rows = await prisma.installmentCostCenterAllocation.findMany({
      where: { tenantId: tenant.id, payableId: payable.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.amount.equals(new Prisma.Decimal('3485'))).toBe(true);
  });

  it('caso 2: FETCHED A → B sem avanço de timestamp remove A', async () => {
    const { tenant, integration } = await seedConnected('cc-reconcile-2');
    const seedScope = {
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
    };
    await costCenters.upsertCostCenters(seedScope, [
      { externalId: 'cc-a', name: 'Centro A', code: null, active: true },
      { externalId: 'cc-b', name: 'Centro B', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(seedScope, ['cc-a', 'cc-b']);
    const payable = await seedPayable({
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
      externalId: 'parcela-swap',
      total: '100',
      upstreamUpdatedAt,
    });
    await costCenters.replaceAllocationsForPayable(
      tenant.id,
      payable.id,
      [{ costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('100') }],
      detailSyncedAt,
    );
    await costCenters.markPayableCostCenterDetailState(tenant.id, payable.id, {
      status: 'FETCHED',
      syncedAt: detailSyncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: {
        getInstallmentDetail: async () =>
          detailWithCenters([{ id: 'cc-b', name: 'Centro B', amount: 100 }]),
      } as never,
    });
    await service.syncAllocationsForInstallments({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: reconcileAt },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    const rows = await prisma.installmentCostCenterAllocation.findMany({
      where: { tenantId: tenant.id, payableId: payable.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.costCenterId).toBe(ids.get('cc-b'));
  });

  it('caso 3: FETCHED A → sem rateio remove allocation e marca NO_ALLOCATION', async () => {
    const { tenant, integration } = await seedConnected('cc-reconcile-3');
    const seedScope = {
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
    };
    await costCenters.upsertCostCenters(seedScope, [
      { externalId: 'cc-a', name: 'Centro A', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(seedScope, ['cc-a']);
    const payable = await seedPayable({
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
      externalId: 'parcela-clear',
      total: '80',
      upstreamUpdatedAt,
    });
    await costCenters.replaceAllocationsForPayable(
      tenant.id,
      payable.id,
      [{ costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('80') }],
      detailSyncedAt,
    );
    await costCenters.markPayableCostCenterDetailState(tenant.id, payable.id, {
      status: 'FETCHED',
      syncedAt: detailSyncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: {
        getInstallmentDetail: async () => ({ id: 'parcela-clear', evento: { rateio: [] } }),
      } as never,
    });
    const result = await service.syncAllocationsForInstallments({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: reconcileAt },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(result.allocationCleared).toBe(1);
    expect(result.noAllocation).toBe(1);
    const after = await prisma.payable.findUniqueOrThrow({ where: { id: payable.id } });
    expect(after.costCenterDetailStatus).toBe('NO_ALLOCATION');
    expect(
      await prisma.installmentCostCenterAllocation.count({
        where: { tenantId: tenant.id, payableId: payable.id },
      }),
    ).toBe(0);
  });

  it('caso 4 + 5: múltiplo substitui exatamente e o mesmo payload é idempotente', async () => {
    const { tenant, integration } = await seedConnected('cc-reconcile-4');
    const seedScope = {
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
    };
    await costCenters.upsertCostCenters(seedScope, [
      { externalId: 'cc-a', name: 'A', code: null, active: true },
      { externalId: 'cc-b', name: 'B', code: null, active: true },
      { externalId: 'cc-c', name: 'C', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(seedScope, ['cc-a', 'cc-b', 'cc-c']);
    const payable = await seedPayable({
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
      externalId: 'parcela-multi',
      total: '100',
      upstreamUpdatedAt,
    });
    await costCenters.replaceAllocationsForPayable(
      tenant.id,
      payable.id,
      [
        { costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('60') },
        { costCenterId: ids.get('cc-b')!, amount: new Prisma.Decimal('40') },
      ],
      detailSyncedAt,
    );
    await costCenters.markPayableCostCenterDetailState(tenant.id, payable.id, {
      status: 'FETCHED',
      syncedAt: detailSyncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const payload = detailWithCenters([
      { id: 'cc-a', name: 'A', amount: 30 },
      { id: 'cc-c', name: 'C', amount: 70 },
    ]);
    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: { getInstallmentDetail: async () => payload } as never,
    });
    const first = await service.syncAllocationsForInstallments({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: reconcileAt },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
    expect(first.allocationReplaced).toBe(1);

    const second = await service.syncAllocationsForInstallments({
      scope: {
        tenantId: tenant.id,
        integrationId: integration.id,
        syncedAt: new Date('2026-09-04T07:00:00.000Z'),
      },
      installments: [
        {
          kind: 'PAYABLE',
          localId: payable.id,
          externalId: 'parcela-multi',
          total: new Prisma.Decimal('100'),
        },
      ],
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
    expect(second.allocationUnchanged).toBe(1);

    const rows = await prisma.installmentCostCenterAllocation.findMany({
      where: { tenantId: tenant.id, payableId: payable.id },
      orderBy: { amount: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.costCenterId).sort()).toEqual(
      [ids.get('cc-a'), ids.get('cc-c')].sort(),
    );
    expect(rows.some((row) => row.costCenterId === ids.get('cc-b'))).toBe(false);
    expect(rows.find((row) => row.costCenterId === ids.get('cc-a'))?.amount.toFixed()).toBe('30');
    expect(rows.find((row) => row.costCenterId === ids.get('cc-c'))?.amount.toFixed()).toBe('70');
  });

  it('caso 8: tenant A não altera allocation do tenant B', async () => {
    const a = await seedConnected('cc-reconcile-8a');
    const b = await seedConnected('cc-reconcile-8b');
    const seedA = {
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      syncedAt: detailSyncedAt,
    };
    const seedB = {
      tenantId: b.tenant.id,
      integrationId: b.integration.id,
      syncedAt: detailSyncedAt,
    };
    await costCenters.upsertCostCenters(seedA, [
      { externalId: 'cc-a', name: 'A', code: null, active: true },
      { externalId: 'cc-b', name: 'B', code: null, active: true },
    ]);
    await costCenters.upsertCostCenters(seedB, [
      { externalId: 'cc-a', name: 'A', code: null, active: true },
    ]);
    const idsA = await costCenters.findCostCenterIdsByExternal(seedA, ['cc-a', 'cc-b']);
    const idsB = await costCenters.findCostCenterIdsByExternal(seedB, ['cc-a']);
    const payableA = await seedPayable({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      syncedAt: detailSyncedAt,
      externalId: 'parcela-shared-ext',
      total: '100',
      upstreamUpdatedAt,
    });
    const payableB = await seedPayable({
      tenantId: b.tenant.id,
      integrationId: b.integration.id,
      syncedAt: detailSyncedAt,
      externalId: 'parcela-shared-ext',
      total: '100',
      upstreamUpdatedAt,
    });
    await costCenters.replaceAllocationsForPayable(
      a.tenant.id,
      payableA.id,
      [{ costCenterId: idsA.get('cc-a')!, amount: new Prisma.Decimal('100') }],
      detailSyncedAt,
    );
    await costCenters.markPayableCostCenterDetailState(a.tenant.id, payableA.id, {
      status: 'FETCHED',
      syncedAt: detailSyncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });
    await costCenters.replaceAllocationsForPayable(
      b.tenant.id,
      payableB.id,
      [{ costCenterId: idsB.get('cc-a')!, amount: new Prisma.Decimal('100') }],
      detailSyncedAt,
    );
    await costCenters.markPayableCostCenterDetailState(b.tenant.id, payableB.id, {
      status: 'FETCHED',
      syncedAt: detailSyncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: {
        getInstallmentDetail: async () =>
          detailWithCenters([{ id: 'cc-b', name: 'B', amount: 100 }]),
      } as never,
    });
    await service.syncAllocationsForInstallments({
      scope: { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: reconcileAt },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    const rowsA = await prisma.installmentCostCenterAllocation.findMany({
      where: { tenantId: a.tenant.id, payableId: payableA.id },
    });
    const rowsB = await prisma.installmentCostCenterAllocation.findMany({
      where: { tenantId: b.tenant.id, payableId: payableB.id },
    });
    expect(rowsA).toHaveLength(1);
    expect(rowsA[0]?.costCenterId).toBe(idsA.get('cc-b'));
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]?.costCenterId).toBe(idsB.get('cc-a'));
  });

  it('caso 9: erro upstream não apaga allocation válida', async () => {
    const { tenant, integration } = await seedConnected('cc-reconcile-9');
    const seedScope = {
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
    };
    await costCenters.upsertCostCenters(seedScope, [
      { externalId: 'cc-a', name: 'A', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(seedScope, ['cc-a']);
    const payable = await seedPayable({
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
      externalId: 'parcela-error',
      total: '40',
      upstreamUpdatedAt,
    });
    await costCenters.replaceAllocationsForPayable(
      tenant.id,
      payable.id,
      [{ costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('40') }],
      detailSyncedAt,
    );
    await costCenters.markPayableCostCenterDetailState(tenant.id, payable.id, {
      status: 'FETCHED',
      syncedAt: detailSyncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: {
        getInstallmentDetail: async () => {
          throw new ContaAzulApiError('unavailable', 'falha temporária', { httpStatus: 503 });
        },
      } as never,
    });
    const result = await service.syncAllocationsForInstallments({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: reconcileAt },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(result.errors).toBe(1);
    const after = await prisma.payable.findUniqueOrThrow({ where: { id: payable.id } });
    expect(after.costCenterDetailStatus).toBe('ERROR');
    expect(
      await prisma.installmentCostCenterAllocation.count({
        where: { tenantId: tenant.id, payableId: payable.id },
      }),
    ).toBe(1);
  });

  it('caso 10: centro ausente no catálogo é materializado sem corromper o rateio', async () => {
    const { tenant, integration } = await seedConnected('cc-reconcile-10');
    const payable = await seedPayable({
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: detailSyncedAt,
      externalId: 'parcela-unknown-cc',
      total: '25',
      upstreamUpdatedAt,
    });

    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: {
        getInstallmentDetail: async () =>
          detailWithCenters([{ id: 'cc-novo', name: 'Centro novo', amount: 25 }]),
      } as never,
    });
    await service.syncAllocationsForInstallments({
      scope: { tenantId: tenant.id, integrationId: integration.id, syncedAt: reconcileAt },
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    const center = await prisma.costCenter.findFirstOrThrow({
      where: { tenantId: tenant.id, integrationId: integration.id, externalId: 'cc-novo' },
    });
    const rows = await prisma.installmentCostCenterAllocation.findMany({
      where: { tenantId: tenant.id, payableId: payable.id },
    });
    const after = await prisma.payable.findUniqueOrThrow({ where: { id: payable.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.costCenterId).toBe(center.id);
    expect(after.costCenterDetailStatus).toBe('FETCHED');
  });
});
