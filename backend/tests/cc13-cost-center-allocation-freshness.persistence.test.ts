import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { loadEnvironment } from '../src/config/env.js';
import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createCostCenterAllocationReadRepository } from '../src/modules/finance/repositories/cost-center-allocation-read.repository.js';
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
const allocationsRead = createCostCenterAllocationReadRepository(prisma);

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

function detailWithCenters(
  centers: Array<{ id: string; name: string; amount: number }>,
) {
  return {
    id: 'parcela',
    evento: {
      rateio: [
        {
          rateio_centro_custo: centers.map((c) => ({
            id_centro_custo: c.id,
            nome_centro_custo: c.name,
            valor: c.amount,
          })),
        },
      ],
    },
  };
}

describe('11-E.3 cost center allocation freshness', () => {
  it('ERROR preserva allocation física, exclui CURRENT e permanece elegível a retry', async () => {
    const { tenant, integration } = await seedConnected('11e3-error');
    const syncedAt = new Date('2026-09-21T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-a', name: 'Centro A', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(scope, ['cc-a']);

    await financial.upsertReceivables(scope, [
      {
        externalId: 'ar-1',
        description: 'com rateio',
        dueDate: parseCivilDate('2026-09-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-09-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('100'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('100'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ]);
    const receivable = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ar-1' },
    });

    await costCenters.replaceAllocationsForReceivable(
      tenant.id,
      receivable.id,
      [{ costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('100') }],
      syncedAt,
    );
    await costCenters.markReceivableCostCenterDetailState(tenant.id, receivable.id, {
      status: 'FETCHED',
      syncedAt,
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
      scope: { ...scope, syncedAt: new Date('2026-09-21T13:00:00.000Z') },
      installments: [
        {
          kind: 'RECEIVABLE',
          localId: receivable.id,
          externalId: 'ar-1',
          total: new Prisma.Decimal('100'),
        },
      ],
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(result.errors).toBe(1);
    const after = await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } });
    expect(after.costCenterDetailStatus).toBe('ERROR');

    const physical = await prisma.installmentCostCenterAllocation.findMany({
      where: { receivableId: receivable.id },
    });
    expect(physical).toHaveLength(1);
    expect(physical[0]?.amount.equals(new Prisma.Decimal('100'))).toBe(true);

    const current = await allocationsRead.findActiveReceivableAllocations({
      tenantId: tenant.id,
      integrationId: integration.id,
      costCenterId: ids.get('cc-a')!,
    });
    expect(current).toHaveLength(0);

    const historical = await allocationsRead.findHistoricalReceivableAllocationsByExternalIds({
      tenantId: tenant.id,
      integrationId: integration.id,
      costCenterId: ids.get('cc-a')!,
      externalIds: ['ar-1'],
    });
    expect(historical).toHaveLength(1);

    const listed = await costCenters.listInstallmentsNeedingAllocationSync({
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(listed.candidates.map((c) => c.localId)).toContain(receivable.id);
  });

  it('abort (timeout) marca ERROR só na parcela tentada, preserva rows e rethrow', async () => {
    const { tenant, integration } = await seedConnected('11e3-abort');
    const syncedAt = new Date('2026-09-21T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-a', name: 'Centro A', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(scope, ['cc-a']);

    await financial.upsertReceivables(scope, [
      {
        externalId: 'ar-timeout',
        description: 'tentada',
        dueDate: parseCivilDate('2026-09-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-09-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('50'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('50'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
      {
        externalId: 'ar-skip',
        description: 'não requisitada',
        dueDate: parseCivilDate('2026-09-11', 'dueDate'),
        competenceDate: parseCivilDate('2026-09-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('50'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('50'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ]);
    const attempted = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ar-timeout' },
    });
    const notRequested = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ar-skip' },
    });

    await costCenters.replaceAllocationsForReceivable(
      tenant.id,
      attempted.id,
      [{ costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('50') }],
      syncedAt,
    );
    await costCenters.markReceivableCostCenterDetailState(tenant.id, attempted.id, {
      status: 'FETCHED',
      syncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });
    await costCenters.replaceAllocationsForReceivable(
      tenant.id,
      notRequested.id,
      [{ costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('50') }],
      syncedAt,
    );
    await costCenters.markReceivableCostCenterDetailState(tenant.id, notRequested.id, {
      status: 'FETCHED',
      syncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const getInstallmentDetail = vi.fn(async () => {
      throw new ContaAzulApiError('timeout', 'timeout');
    });
    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: { getInstallmentDetail } as never,
    });

    await expect(
      service.syncAllocationsForInstallments({
        scope: { ...scope, syncedAt: new Date('2026-09-21T14:00:00.000Z') },
        installments: [
          {
            kind: 'RECEIVABLE',
            localId: attempted.id,
            externalId: 'ar-timeout',
            total: new Prisma.Decimal('50'),
          },
          {
            kind: 'RECEIVABLE',
            localId: notRequested.id,
            externalId: 'ar-skip',
            total: new Prisma.Decimal('50'),
          },
        ],
        requestWithAuth: async (work) => work('token'),
        gatedGet: async (work) => work(),
        heartbeat: async () => undefined,
      }),
    ).rejects.toBeInstanceOf(ContaAzulApiError);

    expect(getInstallmentDetail).toHaveBeenCalledTimes(1);

    const attemptedAfter = await prisma.receivable.findUniqueOrThrow({
      where: { id: attempted.id },
    });
    const skippedAfter = await prisma.receivable.findUniqueOrThrow({
      where: { id: notRequested.id },
    });
    expect(attemptedAfter.costCenterDetailStatus).toBe('ERROR');
    expect(skippedAfter.costCenterDetailStatus).toBe('FETCHED');

    expect(
      await prisma.installmentCostCenterAllocation.count({
        where: { receivableId: attempted.id },
      }),
    ).toBe(1);

    const current = await allocationsRead.findActiveReceivableAllocations({
      tenantId: tenant.id,
      integrationId: integration.id,
      costCenterId: ids.get('cc-a')!,
    });
    expect(current.map((r) => r.installment.externalId)).toEqual(['ar-skip']);

    const listed = await costCenters.listInstallmentsNeedingAllocationSync({
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(listed.candidates.map((c) => c.externalId)).toContain('ar-timeout');
    expect(listed.candidates.map((c) => c.externalId)).not.toContain('ar-skip');
  });

  it('NO_ALLOCATION válido limpa allocation corrente (≠ ERROR)', async () => {
    const { tenant, integration } = await seedConnected('11e3-noalloc');
    const syncedAt = new Date('2026-09-21T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-a', name: 'Centro A', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(scope, ['cc-a']);

    await financial.upsertPayables(scope, [
      {
        externalId: 'ap-1',
        description: 'tinha rateio',
        dueDate: parseCivilDate('2026-09-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-09-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('80'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('80'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ]);
    const payable = await prisma.payable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ap-1' },
    });
    await costCenters.replaceAllocationsForPayable(
      tenant.id,
      payable.id,
      [{ costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('80') }],
      syncedAt,
    );
    await costCenters.markPayableCostCenterDetailState(tenant.id, payable.id, {
      status: 'FETCHED',
      syncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: {
        getInstallmentDetail: async () => ({ id: 'ap-1', evento: { rateio: [] } }),
      } as never,
    });

    const result = await service.syncAllocationsForInstallments({
      scope: { ...scope, syncedAt: new Date('2026-09-21T15:00:00.000Z') },
      installments: [
        {
          kind: 'PAYABLE',
          localId: payable.id,
          externalId: 'ap-1',
          total: new Prisma.Decimal('80'),
        },
      ],
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(result.noAllocation).toBe(1);
    expect(
      await prisma.installmentCostCenterAllocation.count({ where: { payableId: payable.id } }),
    ).toBe(0);
    const after = await prisma.payable.findUniqueOrThrow({ where: { id: payable.id } });
    expect(after.costCenterDetailStatus).toBe('NO_ALLOCATION');

    const current = await allocationsRead.findActivePayableAllocations({
      tenantId: tenant.id,
      integrationId: integration.id,
      costCenterId: ids.get('cc-a')!,
    });
    expect(current).toHaveLength(0);
  });

  it('replace válido substitui CC-A por CC-B sem acumular', async () => {
    const { tenant, integration } = await seedConnected('11e3-replace');
    const syncedAt = new Date('2026-09-21T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-a', name: 'A', code: null, active: true },
      { externalId: 'cc-b', name: 'B', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(scope, ['cc-a', 'cc-b']);

    await financial.upsertReceivables(scope, [
      {
        externalId: 'ar-swap',
        description: 'swap',
        dueDate: parseCivilDate('2026-09-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-09-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('100'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('100'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ]);
    const receivable = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ar-swap' },
    });
    await costCenters.replaceAllocationsForReceivable(
      tenant.id,
      receivable.id,
      [{ costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('100') }],
      syncedAt,
    );
    await costCenters.markReceivableCostCenterDetailState(tenant.id, receivable.id, {
      status: 'FETCHED',
      syncedAt,
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
      scope: { ...scope, syncedAt: new Date('2026-09-21T16:00:00.000Z') },
      installments: [
        {
          kind: 'RECEIVABLE',
          localId: receivable.id,
          externalId: 'ar-swap',
          total: new Prisma.Decimal('100'),
        },
      ],
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    const rows = await prisma.installmentCostCenterAllocation.findMany({
      where: { receivableId: receivable.id },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.costCenterId).toBe(ids.get('cc-b'));

    const currentA = await allocationsRead.findActiveReceivableAllocations({
      tenantId: tenant.id,
      integrationId: integration.id,
      costCenterId: ids.get('cc-a')!,
    });
    const currentB = await allocationsRead.findActiveReceivableAllocations({
      tenantId: tenant.id,
      integrationId: integration.id,
      costCenterId: ids.get('cc-b')!,
    });
    expect(currentA).toHaveLength(0);
    expect(currentB).toHaveLength(1);
  });

  it('DELETED (11-E.1) sai do CURRENT; historical por externalId permanece', async () => {
    const { tenant, integration } = await seedConnected('11e3-deleted');
    const syncedAt = new Date('2026-09-21T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-a', name: 'A', code: null, active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(scope, ['cc-a']);

    await financial.upsertPayables(scope, [
      {
        externalId: 'ap-del',
        description: 'deleted later',
        dueDate: parseCivilDate('2026-09-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-09-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('40'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('40'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ]);
    const payable = await prisma.payable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ap-del' },
    });
    await costCenters.replaceAllocationsForPayable(
      tenant.id,
      payable.id,
      [{ costCenterId: ids.get('cc-a')!, amount: new Prisma.Decimal('40') }],
      syncedAt,
    );
    await costCenters.markPayableCostCenterDetailState(tenant.id, payable.id, {
      status: 'FETCHED',
      syncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    await prisma.payable.update({
      where: { id: payable.id },
      data: {
        lifecycleStatus: 'DELETED',
        lifecycleDeletedAt: new Date('2026-09-21T17:00:00.000Z'),
      },
    });

    expect(
      await prisma.installmentCostCenterAllocation.count({ where: { payableId: payable.id } }),
    ).toBe(1);

    const current = await allocationsRead.findActivePayableAllocations({
      tenantId: tenant.id,
      integrationId: integration.id,
      costCenterId: ids.get('cc-a')!,
    });
    expect(current).toHaveLength(0);

    const historical = await allocationsRead.findHistoricalPayableAllocationsByExternalIds({
      tenantId: tenant.id,
      integrationId: integration.id,
      costCenterId: ids.get('cc-a')!,
      externalIds: ['ap-del'],
    });
    expect(historical).toHaveLength(1);
  });

  it('UNRESOLVED persiste rows para diagnóstico mas CURRENT não as usa', async () => {
    const { tenant, integration } = await seedConnected('11e3-unresolved');
    const syncedAt = new Date('2026-09-21T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await financial.upsertReceivables(scope, [
      {
        externalId: 'ar-multi',
        description: 'multi event-scoped',
        dueDate: parseCivilDate('2026-09-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-09-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('100'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('100'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ]);
    const receivable = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ar-multi' },
    });

    const service = createContaAzulCostCenterSyncService({
      costCenters,
      apiClient: {
        getInstallmentDetail: async () =>
          detailWithCenters([
            { id: 'cc-1', name: 'Um', amount: 200 },
            { id: 'cc-2', name: 'Dois', amount: 200 },
          ]),
      } as never,
    });

    const result = await service.syncAllocationsForInstallments({
      scope,
      installments: [
        {
          kind: 'RECEIVABLE',
          localId: receivable.id,
          externalId: 'ar-multi',
          total: new Prisma.Decimal('100'),
        },
      ],
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(result.unresolved).toBe(1);
    const after = await prisma.receivable.findUniqueOrThrow({ where: { id: receivable.id } });
    expect(after.costCenterDetailStatus).toBe('UNRESOLVED');
    expect(
      await prisma.installmentCostCenterAllocation.count({
        where: { receivableId: receivable.id },
      }),
    ).toBe(2);

    const centers = await prisma.costCenter.findMany({ where: { tenantId: tenant.id } });
    for (const center of centers) {
      const current = await allocationsRead.findActiveReceivableAllocations({
        tenantId: tenant.id,
        integrationId: integration.id,
        costCenterId: center.id,
      });
      expect(current).toHaveLength(0);
    }

    const historical = await allocationsRead.findHistoricalReceivableAllocationsByExternalIds({
      tenantId: tenant.id,
      integrationId: integration.id,
      costCenterId: centers[0]!.id,
      externalIds: ['ar-multi'],
    });
    expect(historical.length).toBeGreaterThanOrEqual(1);
  });

  it('isolamento multi-tenant: CURRENT não vaza allocation entre tenants', async () => {
    const a = await seedConnected('11e3-tenant-a');
    const b = await seedConnected('11e3-tenant-b');
    const syncedAt = new Date('2026-09-21T12:00:00.000Z');

    for (const seeded of [a, b]) {
      const scope = {
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        syncedAt,
      };
      await costCenters.upsertCostCenters(scope, [
        { externalId: 'cc-shared-ext', name: 'Shared name', code: null, active: true },
      ]);
      const ids = await costCenters.findCostCenterIdsByExternal(scope, ['cc-shared-ext']);
      await financial.upsertReceivables(scope, [
        {
          externalId: 'ar-same-ext',
          description: 'same external',
          dueDate: parseCivilDate('2026-09-10', 'dueDate'),
          competenceDate: parseCivilDate('2026-09-01', 'competenceDate'),
          upstreamCreatedAt: null,
          upstreamUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
          status: 'OPEN',
          upstreamStatus: 'EM_ABERTO',
          total: new Prisma.Decimal('10'),
          paid: new Prisma.Decimal('0'),
          unpaid: new Prisma.Decimal('10'),
          externalPartyId: null,
          categoryExternalIds: [],
        },
      ]);
      const receivable = await prisma.receivable.findFirstOrThrow({
        where: { tenantId: seeded.tenant.id, externalId: 'ar-same-ext' },
      });
      await costCenters.replaceAllocationsForReceivable(
        seeded.tenant.id,
        receivable.id,
        [{ costCenterId: ids.get('cc-shared-ext')!, amount: new Prisma.Decimal('10') }],
        syncedAt,
      );
      await costCenters.markReceivableCostCenterDetailState(seeded.tenant.id, receivable.id, {
        status: 'FETCHED',
        syncedAt,
        ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
      });
    }

    const idsA = await costCenters.findCostCenterIdsByExternal(
      { tenantId: a.tenant.id, integrationId: a.integration.id },
      ['cc-shared-ext'],
    );
    const fromA = await allocationsRead.findActiveReceivableAllocations({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      costCenterId: idsA.get('cc-shared-ext')!,
    });
    expect(fromA).toHaveLength(1);
    expect(fromA[0]?.installment.tenantId).toBe(a.tenant.id);

    const leaked = await allocationsRead.findActiveReceivableAllocations({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      costCenterId: (
        await costCenters.findCostCenterIdsByExternal(
          { tenantId: b.tenant.id, integrationId: b.integration.id },
          ['cc-shared-ext'],
        )
      ).get('cc-shared-ext')!,
    });
    expect(leaked).toHaveLength(0);
  });
});
