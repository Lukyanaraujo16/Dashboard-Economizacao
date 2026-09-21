import { describe, expect, it, vi } from 'vitest';

import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import {
  CONTA_AZUL_FINANCIAL_CATEGORY_CATALOG_MAX_PAGES,
  CONTA_AZUL_SYNC_PAGE_SIZE,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { emptyFinancialCategoryCatalogUpsertCounters } from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-category-catalog-metrics.js';
import { createContaAzulFinancialCategoryCatalogSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-financial-category-catalog-sync.service.js';
import type { ContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';

function pagePayload(
  items: Array<{ id: string; nome: string; tipo?: string; categoria_pai?: string | null }>,
  total: number | null,
) {
  const mapped = items.map((item) => ({
    id: item.id,
    nome: item.nome,
    tipo: item.tipo ?? 'RECEITA',
    categoria_pai: item.categoria_pai ?? null,
    versao: 1,
  }));
  if (total === null) {
    return { itens: mapped };
  }
  return { itens: mapped, itens_totais: total };
}

function fullPage(prefix: string) {
  return Array.from({ length: CONTA_AZUL_SYNC_PAGE_SIZE }, (_, i) => ({
    id: `${prefix}-${i}`,
    nome: `${prefix}-${i}`,
  }));
}

function createRepoMock(
  overrides: Partial<ContaAzulFinancialRepository> = {},
): ContaAzulFinancialRepository {
  return {
    upsertCategories: vi.fn(async (_scope, items) => ({
      ...emptyFinancialCategoryCatalogUpsertCounters(),
      created: items.length,
    })),
    markAbsentCategoriesInactive: vi.fn(async () => 0),
    upsertAccounts: vi.fn(async () => ({
      created: 0,
      updated: 0,
      reactivated: 0,
      inactivatedByUpstream: 0,
      alreadyInactive: 0,
    })),
    markAbsentInactive: vi.fn(async () => 0),
    upsertParties: vi.fn(async () => ({
      created: 0,
      updated: 0,
      reactivated: 0,
      inactivatedByUpstream: 0,
      alreadyInactive: 0,
    })),
    markAbsentPartiesInactive: vi.fn(async () => 0),
    upsertReceivables: vi.fn(async () => undefined),
    upsertPayables: vi.fn(async () => undefined),
    listActiveAccounts: vi.fn(async () => []),
    upsertDailyBalanceSnapshot: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('Financial category catalog sync reconcile (11-C pagination)', () => {
  const scope = {
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
    syncedAt: new Date('2026-09-13T12:00:00.000Z'),
  };

  function run(service: ReturnType<typeof createContaAzulFinancialCategoryCatalogSyncService>) {
    return service.syncCatalog({
      scope,
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
  }

  it('I) page1 100 + page2 20 → reconcile após page2; não encerra só por totalItems', async () => {
    const markAbsentCategoriesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentCategoriesInactive });
    const page1 = fullPage('p1');
    const page2 = Array.from({ length: 20 }, (_, i) => ({
      id: `p2-${i}`,
      nome: `P2-${i}`,
    }));
    const getCategories = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(page1, 120))
      .mockResolvedValueOnce(pagePayload(page2, 120));
    const service = createContaAzulFinancialCategoryCatalogSyncService({
      financial: repo,
      apiClient: { getCategories } as never,
    });

    expect(await run(service)).toBe(120);
    expect(getCategories).toHaveBeenCalledTimes(2);
    expect(markAbsentCategoriesInactive).toHaveBeenCalledTimes(1);
    const present = markAbsentCategoriesInactive.mock.calls[0]![0].presentExternalIds as string[];
    expect(present).toHaveLength(120);
  });

  it('I-b) page1 100 + totalItems=100 → ainda busca page2 []; só então reconcile', async () => {
    const markAbsentCategoriesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentCategoriesInactive });
    const getCategories = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('only'), 100))
      .mockResolvedValueOnce(pagePayload([], 100));
    const service = createContaAzulFinancialCategoryCatalogSyncService({
      financial: repo,
      apiClient: { getCategories } as never,
    });

    expect(await run(service)).toBe(100);
    expect(getCategories).toHaveBeenCalledTimes(2);
    expect(markAbsentCategoriesInactive).toHaveBeenCalledTimes(1);
  });

  it('J) processed > reportedTotal → NÃO reconcilia', async () => {
    const markAbsentCategoriesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentCategoriesInactive });
    const getCategories = vi.fn().mockResolvedValueOnce(pagePayload(fullPage('bad'), 50));
    const service = createContaAzulFinancialCategoryCatalogSyncService({
      financial: repo,
      apiClient: { getCategories } as never,
    });

    await expect(run(service)).rejects.toBeInstanceOf(ContaAzulMappingError);
    expect(markAbsentCategoriesInactive).not.toHaveBeenCalled();
  });

  it('K) max pages sem terminal → NÃO reconcile', async () => {
    const markAbsentCategoriesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentCategoriesInactive });
    const getCategories = vi.fn().mockImplementation(() => pagePayload(fullPage('loop'), null));
    const service = createContaAzulFinancialCategoryCatalogSyncService({
      financial: repo,
      apiClient: { getCategories } as never,
    });

    await expect(run(service)).rejects.toBeInstanceOf(ContaAzulMappingError);
    expect(getCategories).toHaveBeenCalledTimes(CONTA_AZUL_FINANCIAL_CATEGORY_CATALOG_MAX_PAGES);
    expect(markAbsentCategoriesInactive).not.toHaveBeenCalled();
  });

  it('H) page1 100 + page2 erro → NÃO reconcilia ausência', async () => {
    const markAbsentCategoriesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentCategoriesInactive });
    const getCategories = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('p1'), 200))
      .mockRejectedValueOnce(new ContaAzulApiError('unavailable', '5xx', { httpStatus: 500 }));
    const service = createContaAzulFinancialCategoryCatalogSyncService({
      financial: repo,
      apiClient: { getCategories } as never,
    });

    await expect(run(service)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(markAbsentCategoriesInactive).not.toHaveBeenCalled();
  });

  it('G) snapshot vazio → NÃO markAbsent; skipReason empty_snapshot', async () => {
    const markAbsentCategoriesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentCategoriesInactive });
    const getCategories = vi.fn().mockResolvedValue(pagePayload([], 0));
    const service = createContaAzulFinancialCategoryCatalogSyncService({
      financial: repo,
      apiClient: { getCategories } as never,
    });

    expect(await run(service)).toBe(0);
    expect(markAbsentCategoriesInactive).not.toHaveBeenCalled();
  });
});
