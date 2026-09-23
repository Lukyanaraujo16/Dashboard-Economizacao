import { describe, expect, it, vi } from 'vitest';

import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import {
  CONTA_AZUL_COST_CENTER_CATALOG_MAX_PAGES,
  CONTA_AZUL_SYNC_PAGE_SIZE,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { createContaAzulCostCenterSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-cost-center-sync.service.js';
import type { ContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { emptyCostCenterCatalogUpsertCounters } from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-catalog-metrics.js';

function pagePayload(
  items: Array<{ id: string; nome: string; codigo?: string | null; ativo?: boolean }>,
  total: number | null,
) {
  if (total === null) {
    return { itens: items };
  }
  return { itens: items, itens_totais: total };
}

function fullPage(prefix: string) {
  return Array.from({ length: CONTA_AZUL_SYNC_PAGE_SIZE }, (_, i) => ({
    id: `${prefix}-${i}`,
    nome: `${prefix}-${i}`,
    ativo: true,
  }));
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
    upsertCostCenterByExternal: vi.fn(async () => 'id'),
    findCostCenterIdsByExternal: vi.fn(async () => new Map()),
    findCostCentersByTenant: vi.fn(async () => []),
    replaceAllocationsForReceivable: vi.fn(async () => undefined),
    replaceAllocationsForPayable: vi.fn(async () => undefined),
    markReceivableCostCenterDetailState: vi.fn(async () => undefined),
    markPayableCostCenterDetailState: vi.fn(async () => undefined),
    persistInstallmentCostCenterDetail: vi.fn(async () => ({ mutation: 'unchanged' as const })),
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

describe('Cost center catalog sync reconcile (11-A pagination)', () => {
  const scope = {
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
    syncedAt: new Date('2026-09-12T12:00:00.000Z'),
  };

  function run(service: ReturnType<typeof createContaAzulCostCenterSyncService>) {
    return service.syncCatalog({
      scope,
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
  }

  it('A) page1 100 + page2 20 → reconcile após page2; presentExternalIds de todas as páginas', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const page1 = fullPage('p1');
    const page2 = Array.from({ length: 20 }, (_, i) => ({
      id: `p2-${i}`,
      nome: `P2-${i}`,
      ativo: true,
    }));
    const getCostCenters = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(page1, 120))
      .mockResolvedValueOnce(pagePayload(page2, 120));
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getCostCenters } as never,
    });

    expect(await run(service)).toBe(120);
    expect(getCostCenters).toHaveBeenCalledTimes(2);
    expect(markAbsentInactive).toHaveBeenCalledTimes(1);
    const present = markAbsentInactive.mock.calls[0]![0].presentExternalIds as string[];
    expect(present).toHaveLength(120);
    expect(present).toEqual(expect.arrayContaining(['p1-0', 'p2-19']));
  });

  it('B) page1 100 + totalItems=100 → ainda busca page2 []; só então reconcile', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getCostCenters = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('only'), 100))
      .mockResolvedValueOnce(pagePayload([], 100));
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getCostCenters } as never,
    });

    expect(await run(service)).toBe(100);
    expect(getCostCenters).toHaveBeenCalledTimes(2);
    expect(getCostCenters.mock.calls[0]![1]).toEqual(
      expect.objectContaining({ pagina: 1 }),
    );
    expect(getCostCenters.mock.calls[1]![1]).toEqual(
      expect.objectContaining({ pagina: 2 }),
    );
    expect(markAbsentInactive).toHaveBeenCalledTimes(1);
  });

  it('C) page1 100 + totalItems=50 → metadata inconsistente; reconcile NÃO ocorre', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getCostCenters = vi.fn().mockResolvedValueOnce(pagePayload(fullPage('bad'), 50));
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getCostCenters } as never,
    });

    await expect(run(service)).rejects.toBeInstanceOf(ContaAzulMappingError);
    expect(markAbsentInactive).not.toHaveBeenCalled();
  });

  it('D) totalItems=null + page1 100 + page2 [] → reconcile ocorre', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getCostCenters = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('n'), null))
      .mockResolvedValueOnce(pagePayload([], null));
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getCostCenters } as never,
    });

    expect(await run(service)).toBe(100);
    expect(markAbsentInactive).toHaveBeenCalledTimes(1);
  });

  it('E) totalItems=null + páginas cheias até MAX → skip reconcile', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getCostCenters = vi.fn().mockImplementation(() => pagePayload(fullPage('loop'), null));
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getCostCenters } as never,
    });

    await expect(run(service)).rejects.toBeInstanceOf(ContaAzulMappingError);
    expect(getCostCenters).toHaveBeenCalledTimes(CONTA_AZUL_COST_CENTER_CATALOG_MAX_PAGES);
    expect(markAbsentInactive).not.toHaveBeenCalled();
  });

  it('F) page1 [] → snapshot vazio válido → reconcile', async () => {
    const markAbsentInactive = vi.fn(async () => 3);
    const repo = createRepoMock({ markAbsentInactive });
    const getCostCenters = vi.fn().mockResolvedValue(pagePayload([], 0));
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getCostCenters } as never,
    });

    expect(await run(service)).toBe(0);
    expect(markAbsentInactive).toHaveBeenCalledWith(
      expect.objectContaining({ presentExternalIds: [] }),
    );
  });

  it('G) page1 100 + page2 erro → reconcile skipped', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getCostCenters = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('p1'), 200))
      .mockRejectedValueOnce(new ContaAzulApiError('unavailable', '5xx', { httpStatus: 500 }));
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getCostCenters } as never,
    });

    await expect(run(service)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(markAbsentInactive).not.toHaveBeenCalled();
  });

  it('snapshot curto <100 ainda reconcilia; reappearance path', async () => {
    const upsertCostCenters = vi.fn(async () => ({
      ...emptyCostCenterCatalogUpsertCounters(),
      reactivated: 1,
    }));
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ upsertCostCenters, markAbsentInactive });
    const getCostCenters = vi
      .fn()
      .mockResolvedValue(pagePayload([{ id: 'x', nome: 'X', ativo: true }], 1));
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getCostCenters } as never,
    });

    await run(service);
    expect(upsertCostCenters).toHaveBeenCalledWith(scope, [
      expect.objectContaining({ externalId: 'x', active: true }),
    ]);
    expect(markAbsentInactive).toHaveBeenCalled();
  });

  it.each([
    ['429', new ContaAzulApiError('rate_limited', 'rate', { httpStatus: 429 })],
    ['timeout', new ContaAzulApiError('timeout', 'timeout')],
  ] as const)('%s → reconcile skipped', async (_label, error) => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getCostCenters = vi.fn().mockRejectedValue(error);
    const service = createContaAzulCostCenterSyncService({
      costCenters: repo,
      apiClient: { getCostCenters } as never,
    });
    await expect(run(service)).rejects.toBe(error);
    expect(markAbsentInactive).not.toHaveBeenCalled();
  });
});
