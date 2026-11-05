import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { createContaAzulCostCenterSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-cost-center-sync.service.js';
import type { ContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { emptyCostCenterCatalogUpsertCounters } from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-catalog-metrics.js';

const scope = {
  tenantId: 'tenant-a',
  integrationId: 'integration-a',
  syncedAt: new Date('2026-09-23T18:00:00.000Z'),
};

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

function createRepoMock(
  overrides: Partial<ContaAzulCostCenterRepository> = {},
): ContaAzulCostCenterRepository {
  return {
    upsertCostCenters: vi.fn(async (_scope, items) => ({
      ...emptyCostCenterCatalogUpsertCounters(),
      created: items.length,
    })),
    markAbsentInactive: vi.fn(async () => 0),
    upsertCostCenterByExternal: vi.fn(async () => 'cc-local-b'),
    findCostCenterIdsByExternal: vi.fn(async () => new Map()),
    purgeCatalogAbsentCostCenters: vi.fn(async () => ({
      markedAbsent: 0,
      allocationsPurged: 0,
      installmentsRequeued: 0,
    })),
    findCatalogAbsentExternalIds: vi.fn(async () => new Set<string>()),
    findCostCentersByTenant: vi.fn(async () => []),
    replaceAllocationsForReceivable: vi.fn(async () => undefined),
    replaceAllocationsForPayable: vi.fn(async () => undefined),
    markReceivableCostCenterDetailState: vi.fn(async () => undefined),
    markPayableCostCenterDetailState: vi.fn(async () => undefined),
    persistInstallmentCostCenterDetail: vi.fn(async () => ({ mutation: 'opened' as const })),
    findActiveInstallmentForAllocation: vi.fn(async () => null),
    listInstallmentsNeedingAllocationSync: vi.fn(async () => ({
      candidates: [],
      totalInstallments: 0,
      skippedFresh: 0,
      staleSelected: 0,
      staleHotSelected: 0,
      staleColdSelected: 0,
    })),
    ...overrides,
  };
}

describe('cost center allocation reuse / reconcile (unit)', () => {
  it('reconsulta não recria rateio para centro excluído no Conta Azul', async () => {
    const persist = vi.fn(async () => ({ mutation: 'replaced' as const }));
    const upsertByExternal = vi.fn(async () => 'cc-local-gone');
    const repo = createRepoMock({
      persistInstallmentCostCenterDetail: persist,
      upsertCostCenterByExternal: upsertByExternal,
      findCostCenterIdsByExternal: vi.fn(
        async () => new Map([['cc-keep', 'cc-local-keep'], ['cc-gone', 'cc-local-gone']]),
      ),
      findCatalogAbsentExternalIds: vi.fn(async () => new Set(['cc-gone'])),
    });
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: {
        getInstallmentDetail: async () =>
          detailWithCenters([
            { id: 'cc-keep', name: 'Keep', amount: 60 },
            { id: 'cc-gone', name: 'Gone', amount: 40 },
          ]),
      } as never,
    });

    await service.syncAllocationsForInstallments({
      scope,
      installments: [
        { kind: 'PAYABLE', localId: 'local-1', externalId: 'ext-1', total: new Prisma.Decimal('100') },
      ],
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(upsertByExternal).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledTimes(1);
    const written = (persist.mock.calls[0] as unknown as [{ allocations: unknown[] }])[0].allocations;
    expect(written).toEqual([{ costCenterId: 'cc-local-keep', amount: new Prisma.Decimal('60') }]);
  });

  it('reusa payload do 11-E.1 sem segundo GET', async () => {
    const persist = vi.fn(async () => ({ mutation: 'opened' as const }));
    const findActive = vi.fn(async () => ({
      kind: 'PAYABLE' as const,
      localId: 'local-1',
      externalId: 'ext-1',
      total: new Prisma.Decimal('3485'),
    }));
    const getInstallmentDetail = vi.fn();
    const repo = createRepoMock({
      persistInstallmentCostCenterDetail: persist,
      findActiveInstallmentForAllocation: findActive,
    });
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getInstallmentDetail } as never,
    });

    const result = await service.syncAllocationsForInstallments({
      scope,
      reusedDetails: [
        {
          kind: 'PAYABLE',
          externalId: 'ext-1',
          payload: detailWithCenters([{ id: 'cc-b', name: 'Centro B', amount: 3485 }]),
        },
      ],
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(getInstallmentDetail).not.toHaveBeenCalled();
    expect(findActive).toHaveBeenCalledWith(
      { tenantId: scope.tenantId, integrationId: scope.integrationId },
      'PAYABLE',
      'ext-1',
    );
    expect(persist).toHaveBeenCalledTimes(1);
    expect(result.reusedPresencePayloads).toBe(1);
    expect(result.requested).toBe(0);
    expect(result.success).toBe(1);
    expect(result.allocationOpened).toBe(1);
  });

  it('falha upstream não chama persist (não apaga allocation válida)', async () => {
    const persist = vi.fn(async () => ({ mutation: 'replaced' as const }));
    const markPayable = vi.fn(async () => undefined);
    const { ContaAzulApiError } = await import(
      '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js'
    );
    const repo = createRepoMock({
      persistInstallmentCostCenterDetail: persist,
      markPayableCostCenterDetailState: markPayable,
    });
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: {
        getInstallmentDetail: async () => {
          throw new ContaAzulApiError('unavailable', 'falha temporária', { httpStatus: 503 });
        },
      } as never,
    });

    const result = await service.syncAllocationsForInstallments({
      scope,
      installments: [
        {
          kind: 'PAYABLE',
          localId: 'local-1',
          externalId: 'ext-1',
          total: new Prisma.Decimal('100'),
        },
      ],
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(persist).not.toHaveBeenCalled();
    expect(markPayable).toHaveBeenCalledTimes(1);
    expect(result.errors).toBe(1);
    expect(result.success).toBe(0);
  });

  it('TESTE K: reusedDetails aplicado antes não consome budget stale / segundo GET', async () => {
    const persist = vi.fn(async () => ({ mutation: 'opened' as const }));
    const getInstallmentDetail = vi.fn(async () => detailWithCenters([]));
    const listInstallmentsNeedingAllocationSync = vi.fn(async () => ({
      candidates: [
        {
          kind: 'PAYABLE' as const,
          localId: 'local-1',
          externalId: 'ext-1',
          total: new Prisma.Decimal('3485'),
        },
      ],
      totalInstallments: 1,
      skippedFresh: 0,
      staleSelected: 1,
      staleHotSelected: 1,
      staleColdSelected: 0,
    }));
    const repo = createRepoMock({
      persistInstallmentCostCenterDetail: persist,
      findActiveInstallmentForAllocation: vi.fn(async () => ({
        kind: 'PAYABLE' as const,
        localId: 'local-1',
        externalId: 'ext-1',
        total: new Prisma.Decimal('3485'),
      })),
      listInstallmentsNeedingAllocationSync,
    });
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getInstallmentDetail } as never,
    });

    const result = await service.syncAllocationsForInstallments({
      scope,
      reusedDetails: [
        {
          kind: 'PAYABLE',
          externalId: 'ext-1',
          payload: detailWithCenters([{ id: 'cc-b', name: 'Centro B', amount: 3485 }]),
        },
      ],
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });

    expect(getInstallmentDetail).not.toHaveBeenCalled();
    expect(persist).toHaveBeenCalledTimes(1);
    expect(result.reusedPresencePayloads).toBe(1);
    expect(result.requested).toBe(0);
  });

  it('TESTE M: nenhum candidato → zero GET', async () => {
    const getInstallmentDetail = vi.fn();
    const service = createContaAzulCostCenterSyncService({
      costCenters: createRepoMock(),
      apiClient: { getInstallmentDetail } as never,
    });
    const result = await service.syncAllocationsForInstallments({
      scope,
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
    expect(getInstallmentDetail).not.toHaveBeenCalled();
    expect(result.requested).toBe(0);
    expect(result.staleRevalidated).toBe(0);
  });
});
