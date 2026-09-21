import { describe, expect, it, vi } from 'vitest';

import { ContaAzulApiError } from '../src/modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import { ContaAzulMappingError } from '../src/modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import {
  CONTA_AZUL_PARTY_CATALOG_MAX_PAGES,
  CONTA_AZUL_SYNC_PAGE_SIZE,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { emptyPartyCatalogUpsertCounters } from '../src/modules/integrations/conta-azul/domain/conta-azul-party-catalog-metrics.js';
import {
  createContaAzulPartyCatalogSyncService,
  partiesSemanticallyEquivalent,
} from '../src/modules/integrations/conta-azul/services/conta-azul-party-catalog-sync.service.js';
import type { ContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';

function pagePayload(
  items: Array<{
    id: string;
    nome: string;
    documento?: string | null;
    ativo?: boolean;
    perfis?: string[];
  }>,
  total: number | null,
) {
  const mapped = items.map((item) => ({
    id: item.id,
    nome: item.nome,
    documento: item.documento ?? null,
    ativo: item.ativo,
    perfis: item.perfis ?? ['CLIENTE'],
  }));
  if (total === null) {
    return { items: mapped };
  }
  return { items: mapped, totalItems: total };
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
    upsertCategories: vi.fn(async () => ({
      created: 0,
      updated: 0,
      reactivated: 0,
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
    upsertParties: vi.fn(async (_scope, items) => ({
      ...emptyPartyCatalogUpsertCounters(),
      created: items.length,
    })),
    markAbsentPartiesInactive: vi.fn(async () => 0),
    upsertReceivables: vi.fn(async () => undefined),
    upsertPayables: vi.fn(async () => undefined),
    listActiveAccounts: vi.fn(async () => []),
    upsertDailyBalanceSnapshot: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe('Party catalog sync reconcile (11-D pagination / duplicates)', () => {
  const scope = {
    tenantId: 'tenant-1',
    integrationId: 'integration-1',
    syncedAt: new Date('2026-09-13T12:00:00.000Z'),
  };

  function run(service: ReturnType<typeof createContaAzulPartyCatalogSyncService>) {
    return service.syncCatalog({
      scope,
      requestWithAuth: async (work) => work('token'),
      gatedGet: async (work) => work(),
      heartbeat: async () => undefined,
    });
  }

  it('H) page1 100 + totalItems=100 → ainda busca page2 []; só então reconcile', async () => {
    const markAbsentPartiesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentPartiesInactive });
    const getPeople = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('only'), 100))
      .mockResolvedValueOnce(pagePayload([], 100));
    const service = createContaAzulPartyCatalogSyncService({
      financial: repo,
      apiClient: { getPeople } as never,
    });

    expect(await run(service)).toBe(100);
    expect(getPeople).toHaveBeenCalledTimes(2);
    expect(markAbsentPartiesInactive).toHaveBeenCalledTimes(1);
  });

  it('H-b) page1 100 + page2 20 → reconcile após page2; totalItems não encerra', async () => {
    const markAbsentPartiesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentPartiesInactive });
    const page2 = Array.from({ length: 20 }, (_, i) => ({
      id: `p2-${i}`,
      nome: `P2-${i}`,
      ativo: true,
    }));
    const getPeople = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('p1'), 120))
      .mockResolvedValueOnce(pagePayload(page2, 120));
    const service = createContaAzulPartyCatalogSyncService({
      financial: repo,
      apiClient: { getPeople } as never,
    });

    expect(await run(service)).toBe(120);
    expect(getPeople).toHaveBeenCalledTimes(2);
    expect(markAbsentPartiesInactive).toHaveBeenCalledTimes(1);
    const present = markAbsentPartiesInactive.mock.calls[0]![0].presentExternalIds as string[];
    expect(present).toHaveLength(120);
  });

  it('G) processed > reportedTotal → NÃO reconcilia', async () => {
    const markAbsentPartiesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentPartiesInactive });
    const getPeople = vi.fn().mockResolvedValueOnce(pagePayload(fullPage('bad'), 50));
    const service = createContaAzulPartyCatalogSyncService({
      financial: repo,
      apiClient: { getPeople } as never,
    });

    await expect(run(service)).rejects.toBeInstanceOf(ContaAzulMappingError);
    expect(markAbsentPartiesInactive).not.toHaveBeenCalled();
  });

  it('I) max pages sem terminal → NÃO reconcile', async () => {
    const markAbsentPartiesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentPartiesInactive });
    const getPeople = vi.fn().mockImplementation(() => pagePayload(fullPage('loop'), null));
    const service = createContaAzulPartyCatalogSyncService({
      financial: repo,
      apiClient: { getPeople } as never,
    });

    await expect(run(service)).rejects.toBeInstanceOf(ContaAzulMappingError);
    expect(getPeople).toHaveBeenCalledTimes(CONTA_AZUL_PARTY_CATALOG_MAX_PAGES);
    expect(markAbsentPartiesInactive).not.toHaveBeenCalled();
  });

  it('F) page1 100 + page2 erro → NÃO reconcilia ausência', async () => {
    const markAbsentPartiesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentPartiesInactive });
    const getPeople = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(fullPage('p1'), 200))
      .mockRejectedValueOnce(new ContaAzulApiError('unavailable', '5xx', { httpStatus: 500 }));
    const service = createContaAzulPartyCatalogSyncService({
      financial: repo,
      apiClient: { getPeople } as never,
    });

    await expect(run(service)).rejects.toMatchObject({ kind: 'unavailable' });
    expect(markAbsentPartiesInactive).not.toHaveBeenCalled();
  });

  it('J) snapshot vazio → NÃO markAbsent; skipReason empty_snapshot', async () => {
    const markAbsentPartiesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentPartiesInactive });
    const getPeople = vi.fn().mockResolvedValue(pagePayload([], 0));
    const service = createContaAzulPartyCatalogSyncService({
      financial: repo,
      apiClient: { getPeople } as never,
    });

    expect(await run(service)).toBe(0);
    expect(markAbsentPartiesInactive).not.toHaveBeenCalled();
  });

  it('N) duplicata equivalente → reconcile com unique IDs; métricas de dup', async () => {
    const markAbsentPartiesInactive = vi.fn(async () => 0);
    const upsertParties = vi.fn(async (_scope, items) => ({
      ...emptyPartyCatalogUpsertCounters(),
      created: items.length,
    }));
    const repo = createRepoMock({ markAbsentPartiesInactive, upsertParties });
    const dupId = '03f942c6-0553-42aa-b637-50adfd4a4d4e';
    const getPeople = vi.fn().mockResolvedValue(
      pagePayload(
        [
          { id: 'a', nome: 'A', ativo: true },
          { id: dupId, nome: 'Dup', documento: '1', ativo: true, perfis: ['CLIENTE'] },
          { id: dupId, nome: 'Dup', documento: '1', ativo: true, perfis: ['CLIENTE'] },
        ],
        3,
      ),
    );
    const service = createContaAzulPartyCatalogSyncService({
      financial: repo,
      apiClient: { getPeople } as never,
    });

    expect(await run(service)).toBe(2);
    expect(upsertParties.mock.calls[0]![1]).toHaveLength(2);
    expect(markAbsentPartiesInactive).toHaveBeenCalledTimes(1);
    const present = markAbsentPartiesInactive.mock.calls[0]![0].presentExternalIds as string[];
    expect(present).toEqual(expect.arrayContaining(['a', dupId]));
    expect(present).toHaveLength(2);
  });

  it('O) duplicata conflitante → NÃO reconcilia ausência; upsert só não-conflitantes', async () => {
    const markAbsentPartiesInactive = vi.fn(async () => 0);
    const upsertParties = vi.fn(async (_scope, items) => ({
      ...emptyPartyCatalogUpsertCounters(),
      created: items.length,
    }));
    const repo = createRepoMock({ markAbsentPartiesInactive, upsertParties });
    const conflictId = 'conflict-1';
    const getPeople = vi.fn().mockResolvedValue(
      pagePayload(
        [
          { id: 'safe', nome: 'Safe', ativo: true },
          { id: conflictId, nome: 'One', ativo: true },
          { id: conflictId, nome: 'Two', ativo: false },
        ],
        3,
      ),
    );
    const service = createContaAzulPartyCatalogSyncService({
      financial: repo,
      apiClient: { getPeople } as never,
    });

    expect(await run(service)).toBe(2);
    expect(upsertParties.mock.calls[0]![1]).toHaveLength(1);
    expect(upsertParties.mock.calls[0]![1][0]?.externalId).toBe('safe');
    expect(markAbsentPartiesInactive).not.toHaveBeenCalled();
  });

  it('Q) 305 brutos / 304 únicos (caso auditado) → reconcile sem falso localOnly', async () => {
    const markAbsentPartiesInactive = vi.fn(async () => 0);
    const repo = createRepoMock({ markAbsentPartiesInactive });
    const dupId = '03f942c6-0553-42aa-b637-50adfd4a4d4e';
    const page1 = [
      { id: dupId, nome: 'Dup Life', ativo: true },
      ...Array.from({ length: CONTA_AZUL_SYNC_PAGE_SIZE - 1 }, (_, i) => ({
        id: `life-p1-${i}`,
        nome: `P1-${i}`,
        ativo: true,
      })),
    ];
    const page2 = fullPage('life-p2');
    const page3 = fullPage('life-p3');
    // 5 itens na última página, um deles é a 2ª ocorrência do dupId → 305 brutos / 304 únicos
    const page4 = [
      ...Array.from({ length: 4 }, (_, i) => ({
        id: `life-p4-${i}`,
        nome: `P4-${i}`,
        ativo: true,
      })),
      { id: dupId, nome: 'Dup Life', ativo: true },
    ];
    expect(page1.length + page2.length + page3.length + page4.length).toBe(305);
    const getPeople = vi
      .fn()
      .mockResolvedValueOnce(pagePayload(page1, 305))
      .mockResolvedValueOnce(pagePayload(page2, 305))
      .mockResolvedValueOnce(pagePayload(page3, 305))
      .mockResolvedValueOnce(pagePayload(page4, 305));
    const service = createContaAzulPartyCatalogSyncService({
      financial: repo,
      apiClient: { getPeople } as never,
    });

    expect(await run(service)).toBe(304);
    expect(getPeople).toHaveBeenCalledTimes(4);
    const present = markAbsentPartiesInactive.mock.calls[0]![0].presentExternalIds as string[];
    expect(present).toHaveLength(304);
    expect(present).toContain(dupId);
  });

  it('partiesSemanticallyEquivalent distingue active/name/document/profiles', () => {
    const base = {
      externalId: 'x',
      name: 'N',
      document: '1',
      active: true,
      profiles: ['CUSTOMER' as const],
    };
    expect(partiesSemanticallyEquivalent(base, { ...base })).toBe(true);
    expect(partiesSemanticallyEquivalent(base, { ...base, active: false })).toBe(false);
    expect(partiesSemanticallyEquivalent(base, { ...base, name: 'Other' })).toBe(false);
    expect(partiesSemanticallyEquivalent(base, { ...base, document: '2' })).toBe(false);
    expect(
      partiesSemanticallyEquivalent(base, { ...base, profiles: ['SUPPLIER' as const] }),
    ).toBe(false);
  });
});
