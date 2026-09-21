import { describe, expect, it, vi } from 'vitest';

import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import {
  CONTA_AZUL_FINANCIAL_ACCOUNT_CATALOG_MAX_PAGES,
  CONTA_AZUL_SYNC_PAGE_SIZE,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { emptyFinancialAccountCatalogUpsertCounters } from '../src/modules/integrations/conta-azul/domain/conta-azul-financial-account-catalog-metrics.js';
import { createContaAzulFinancialAccountCatalogSyncService } from '../src/modules/integrations/conta-azul/services/conta-azul-financial-account-catalog-sync.service.js';
import type { ContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';

function pagePayload(
  items: Array<{ id: string; nome: string; tipo?: string; ativo?: boolean }>,
  total: number | null,
) {
  const mapped = items.map((item) => ({
    id: item.id,
    nome: item.nome,
    tipo: item.tipo ?? 'CONTA_CORRENTE',
    ativo: item.ativo ?? true,
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
    ativo: true,
  }));
}

function createRepoMock(
  overrides: Partial<ContaAzulFinancialRepository> = {},
): ContaAzulFinancialRepository {
  return {
    upsertCategories: vi.fn(async () => undefined),
    markAbsentCategoriesInactive: vi.fn(async () => 0),
    upsertAccounts: vi.fn(async (_scope, items) => ({
      ...emptyFinancialAccountCatalogUpsertCounters(),
      created: items.length,
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

describe('Financial account catalog sync reconcile (11-B pagination)', () => {
  const scope = {
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
    syncedAt: new Date('2026-09-13T12:00:00.000Z'),
  };

  function run(service: ReturnType<typeof createContaAzulFinancialAccountCatalogSyncService>) {
    return service.syncCatalog({
      scope,
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
  }

  it('7) page1 100 + page2 20 → reconcile após page2; não encerra só por totalItems', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const page1 = fullPage('p1');
    const page2 = Array.from({ length: 20 }, (_, i) => ({
      id: `p2-${i}`,
      nome: `P2-${i}`,
      ativo: true,
    }));
    const getFinancialAccounts = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(page1, 120))
      .mockResolvedValueOnce(pagePayload(page2, 120));
    const service = createContaAzulFinancialAccountCatalogSyncService({
      financial: repo,
      apiClient: { getFinancialAccounts } as never,
    });

    expect(await run(service)).toBe(120);
    expect(getFinancialAccounts).toHaveBeenCalledTimes(2);
    expect(markAbsentInactive).toHaveBeenCalledTimes(1);
    const present = markAbsentInactive.mock.calls[0]![0].presentExternalIds as string[];
    expect(present).toHaveLength(120);
  });

  it('7b) page1 100 + totalItems=100 → ainda busca page2 []; só então reconcile', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getFinancialAccounts = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('only'), 100))
      .mockResolvedValueOnce(pagePayload([], 100));
    const service = createContaAzulFinancialAccountCatalogSyncService({
      financial: repo,
      apiClient: { getFinancialAccounts } as never,
    });

    expect(await run(service)).toBe(100);
    expect(getFinancialAccounts).toHaveBeenCalledTimes(2);
    expect(markAbsentInactive).toHaveBeenCalledTimes(1);
  });

  it('6) totalItems inconsistente → NÃO reconcilia', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getFinancialAccounts = vi.fn().mockResolvedValueOnce(pagePayload(fullPage('bad'), 50));
    const service = createContaAzulFinancialAccountCatalogSyncService({
      financial: repo,
      apiClient: { getFinancialAccounts } as never,
    });

    await expect(run(service)).rejects.toBeInstanceOf(ContaAzulMappingError);
    expect(markAbsentInactive).not.toHaveBeenCalled();
  });

  it('8) max pages sem terminal → NÃO reconcile', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getFinancialAccounts = vi.fn().mockImplementation(() => pagePayload(fullPage('loop'), null));
    const service = createContaAzulFinancialAccountCatalogSyncService({
      financial: repo,
      apiClient: { getFinancialAccounts } as never,
    });

    await expect(run(service)).rejects.toBeInstanceOf(ContaAzulMappingError);
    expect(getFinancialAccounts).toHaveBeenCalledTimes(CONTA_AZUL_FINANCIAL_ACCOUNT_CATALOG_MAX_PAGES);
    expect(markAbsentInactive).not.toHaveBeenCalled();
  });

  it('5) page1 100 + page2 erro → reconcile skipped', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getFinancialAccounts = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('p1'), 200))
      .mockRejectedValueOnce(new ContaAzulApiError('unavailable', '5xx', { httpStatus: 500 }));
    const service = createContaAzulFinancialAccountCatalogSyncService({
      financial: repo,
      apiClient: { getFinancialAccounts } as never,
    });

    await expect(run(service)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(markAbsentInactive).not.toHaveBeenCalled();
  });

  it('9) snapshot vazio → NÃO markAbsent; reconcileSkipped', async () => {
    const markAbsentInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentInactive });
    const getFinancialAccounts = vi.fn().mockResolvedValue(pagePayload([], 0));
    const service = createContaAzulFinancialAccountCatalogSyncService({
      financial: repo,
      apiClient: { getFinancialAccounts } as never,
    });

    expect(await run(service)).toBe(0);
    expect(markAbsentInactive).not.toHaveBeenCalled();
  });

  it('2) upstream inactive + ausente reconciliado', async () => {
    const markAbsentInactive = vi.fn(async () => 1);
    const upsertAccounts = vi.fn(async () => ({
      ...emptyFinancialAccountCatalogUpsertCounters(),
      inactivatedByUpstream: 1,
      updated: 0,
    }));
    const repo = createRepoMock({ markAbsentInactive, upsertAccounts });
    const getFinancialAccounts = vi.fn().mockResolvedValue(
      pagePayload([{ id: 'x', nome: 'X', ativo: false }], 1),
    );
    const service = createContaAzulFinancialAccountCatalogSyncService({
      financial: repo,
      apiClient: { getFinancialAccounts } as never,
    });

    expect(await run(service)).toBe(1);
    expect(markAbsentInactive).toHaveBeenCalledWith(
      expect.objectContaining({ presentExternalIds: ['x'] }),
    );
  });
});
