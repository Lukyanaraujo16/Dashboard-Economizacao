import { describe, expect, it } from 'vitest';

import {
  allocateStaleHotColdBudget,
  classifyCostCenterAllocationMutation,
  COST_CENTER_DETAIL_RULE_VERSION,
  COST_CENTER_DETAIL_STALE_AFTER_MS,
  COST_CENTER_DETAIL_STALE_COLD_MAX_PER_SYNC,
  COST_CENTER_DETAIL_STALE_HOT_MAX_PER_SYNC,
  COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC,
  detailStatusFromNormalizeKind,
  isCostCenterDetailStaleHot,
  selectCostCenterDetailCandidates,
  shouldFetchCostCenterDetail,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-detail-fetch.js';

describe('shouldFetchCostCenterDetail (CC1.2)', () => {
  const syncedAt = new Date('2026-08-20T12:00:00.000Z');
  const earlier = new Date('2026-08-19T12:00:00.000Z');
  const later = new Date('2026-08-21T12:00:00.000Z');

  it('UNKNOWN → fetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'UNKNOWN',
        detailSyncedAt: null,
        detailRuleVersion: 0,
        upstreamUpdatedAt: null,
      }),
    ).toEqual({ shouldFetch: true, reason: 'unknown' });
  });

  it('ERROR → retry fetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'ERROR',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
      }).shouldFetch,
    ).toBe(true);
  });

  it('FETCHED fresco sem mudança upstream → skip', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'FETCHED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
      }),
    ).toEqual({ shouldFetch: false, reason: 'skip_fresh' });
  });

  it('NO_ALLOCATION confirmado sem mudança → skip (não refetch eterno)', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'NO_ALLOCATION',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
      }),
    ).toEqual({ shouldFetch: false, reason: 'skip_no_allocation' });
  });

  it('upstreamUpdatedAt novo → refetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'FETCHED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: later,
      }),
    ).toEqual({ shouldFetch: true, reason: 'upstream_changed' });
  });

  it('NO_ALLOCATION com upstream novo → refetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'NO_ALLOCATION',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: later,
      }).shouldFetch,
    ).toBe(true);
  });

  it('rule version bump → refetch', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'FETCHED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: 0,
        upstreamUpdatedAt: earlier,
        currentRuleVersion: 2,
      }),
    ).toEqual({ shouldFetch: true, reason: 'rule_version_bump' });
  });

  it('UNRESOLVED fresco → skip (não storm; retry só se upstream mudar)', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'UNRESOLVED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
      }),
    ).toEqual({ shouldFetch: false, reason: 'skip_unresolved_fresh' });
  });

  it('FETCHED sem upstreamUpdatedAt → skip', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'FETCHED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: null,
      }),
    ).toEqual({ shouldFetch: false, reason: 'skip_fetched_no_upstream' });
  });

  it('NO_ALLOCATION antigo + data_alteracao inalterada + TTL → stale_revalidate', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'NO_ALLOCATION',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
        now: new Date(syncedAt.getTime() + COST_CENTER_DETAIL_STALE_AFTER_MS),
        staleAfterMs: COST_CENTER_DETAIL_STALE_AFTER_MS,
      }),
    ).toEqual({ shouldFetch: true, reason: 'stale_revalidate' });
  });

  it('FETCHED fresco dentro do TTL + data_alteracao inalterada → skip', () => {
    expect(
      shouldFetchCostCenterDetail({
        status: 'FETCHED',
        detailSyncedAt: syncedAt,
        detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        upstreamUpdatedAt: earlier,
        now: new Date(syncedAt.getTime() + COST_CENTER_DETAIL_STALE_AFTER_MS - 1),
        staleAfterMs: COST_CENTER_DETAIL_STALE_AFTER_MS,
      }),
    ).toEqual({ shouldFetch: false, reason: 'skip_fresh' });
  });
});

describe('detailStatusFromNormalizeKind', () => {
  it('mapeia kinds CC1.1', () => {
    expect(detailStatusFromNormalizeKind('NO_ALLOCATION')).toBe('NO_ALLOCATION');
    expect(detailStatusFromNormalizeKind('MULTI_CENTER_UNRESOLVED')).toBe('UNRESOLVED');
    expect(detailStatusFromNormalizeKind('DIRECT')).toBe('FETCHED');
    expect(detailStatusFromNormalizeKind('PARTIAL')).toBe('FETCHED');
    expect(detailStatusFromNormalizeKind('EVENT_SCOPED_SINGLE_CENTER')).toBe('FETCHED');
  });
});

describe('selectCostCenterDetailCandidates', () => {
  const now = new Date('2026-09-23T18:00:00.000Z');

  function staleRow(externalId: string, hoursAgo: number) {
    return {
      kind: 'PAYABLE' as const,
      localId: externalId,
      externalId,
      total: 1,
      status: 'NO_ALLOCATION' as const,
      detailSyncedAt: new Date(now.getTime() - hoursAgo * 60 * 60 * 1000),
      detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
      upstreamUpdatedAt: new Date('2026-09-03T10:51:37.000Z'),
    };
  }

  it('respeita teto de stale e prioriza os mais antigos', () => {
    const rows = Array.from({ length: COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC + 10 }, (_, i) =>
      staleRow(`stale-${String(i).padStart(2, '0')}`, 7 + i),
    );
    const unknown = {
      kind: 'PAYABLE' as const,
      localId: 'unknown-1',
      externalId: 'unknown-1',
      total: 1,
      status: 'UNKNOWN' as const,
      detailSyncedAt: null,
      detailRuleVersion: 0,
      upstreamUpdatedAt: null,
    };
    const selected = selectCostCenterDetailCandidates([unknown, ...rows], {
      now,
      staleAfterMs: COST_CENTER_DETAIL_STALE_AFTER_MS,
      staleLimit: COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC,
    });
    expect(selected.candidates).toHaveLength(1 + COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC);
    expect(selected.staleSelected).toBe(COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC);
    expect(selected.staleHotSelected).toBe(0);
    expect(selected.staleColdSelected).toBe(COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC);
    expect(selected.candidates[0]?.externalId).toBe('unknown-1');
    expect(selected.candidates[1]?.externalId).toBe('stale-49');
    expect(selected.skippedFresh).toBe(10);
  });

  it('sem now não seleciona stale', () => {
    const selected = selectCostCenterDetailCandidates([staleRow('old', 48)]);
    expect(selected.candidates).toHaveLength(0);
    expect(selected.staleSelected).toBe(0);
    expect(selected.staleHotSelected).toBe(0);
    expect(selected.staleColdSelected).toBe(0);
    expect(selected.skippedFresh).toBe(1);
  });
});

describe('allocateStaleHotColdBudget', () => {
  it('TESTE A: 28+ HOT e 12+ COLD → 28 + 12', () => {
    expect(allocateStaleHotColdBudget({ hotCount: 100, coldCount: 100 })).toEqual({
      hot: COST_CENTER_DETAIL_STALE_HOT_MAX_PER_SYNC,
      cold: COST_CENTER_DETAIL_STALE_COLD_MAX_PER_SYNC,
    });
  });

  it('TESTE B: 10 HOT e 50 COLD → 10 + 30', () => {
    expect(allocateStaleHotColdBudget({ hotCount: 10, coldCount: 50 })).toEqual({
      hot: 10,
      cold: 30,
    });
  });

  it('TESTE C: 50 HOT e 5 COLD → 35 + 5', () => {
    expect(allocateStaleHotColdBudget({ hotCount: 50, coldCount: 5 })).toEqual({
      hot: 35,
      cold: 5,
    });
  });

  it('TESTE D: 10 HOT e 5 COLD → 15 total', () => {
    expect(allocateStaleHotColdBudget({ hotCount: 10, coldCount: 5 })).toEqual({
      hot: 10,
      cold: 5,
    });
  });

  it('TESTE N: nunca ultrapassa o teto 40', () => {
    const budget = allocateStaleHotColdBudget({ hotCount: 400, coldCount: 400 });
    expect(budget.hot + budget.cold).toBe(COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC);
  });
});

describe('selectCostCenterDetailCandidates HOT/COLD', () => {
  const now = new Date('2026-09-23T18:00:00.000Z');
  const upstreamUpdatedAt = new Date('2026-09-03T10:51:37.000Z');

  function civil(isoDate: string): Date {
    return new Date(`${isoDate}T00:00:00.000Z`);
  }

  function row(input: {
    readonly externalId: string;
    readonly dueDate?: string | null;
    readonly competenceDate?: string | null;
    readonly hoursAgo?: number;
    readonly kind?: 'RECEIVABLE' | 'PAYABLE';
    readonly localId?: string;
  }) {
    return {
      kind: input.kind ?? ('PAYABLE' as const),
      localId: input.localId ?? input.externalId,
      externalId: input.externalId,
      total: 1,
      status: 'NO_ALLOCATION' as const,
      detailSyncedAt: new Date(now.getTime() - (input.hoursAgo ?? 8) * 60 * 60 * 1000),
      detailRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
      upstreamUpdatedAt,
      dueDate: input.dueDate === undefined || input.dueDate === null ? input.dueDate ?? null : civil(input.dueDate),
      competenceDate:
        input.competenceDate === undefined || input.competenceDate === null
          ? input.competenceDate ?? null
          : civil(input.competenceDate),
    };
  }

  function select(rows: ReturnType<typeof row>[]) {
    return selectCostCenterDetailCandidates(rows, {
      now,
      staleAfterMs: COST_CENTER_DETAIL_STALE_AFTER_MS,
      staleLimit: COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC,
    });
  }

  it('TESTE A: 40 HOT + 20 COLD → 28 HOT + 12 COLD', () => {
    const rows = [
      ...Array.from({ length: 40 }, (_, i) =>
        row({
          externalId: `hot-${String(i).padStart(2, '0')}`,
          dueDate: '2026-09-10',
          hoursAgo: 8 + i,
        }),
      ),
      ...Array.from({ length: 20 }, (_, i) =>
        row({
          externalId: `cold-${String(i).padStart(2, '0')}`,
          dueDate: '2025-01-10',
          hoursAgo: 8 + i,
        }),
      ),
    ];
    const selected = select(rows);
    expect(selected.staleHotSelected).toBe(28);
    expect(selected.staleColdSelected).toBe(12);
    expect(selected.staleSelected).toBe(40);
    expect(selected.candidates.filter((item) => item.staleBand === 'hot')).toHaveLength(28);
    expect(selected.candidates.filter((item) => item.staleBand === 'cold')).toHaveLength(12);
    expect(selected.candidates[0]?.externalId).toBe('hot-39');
  });

  it('TESTE B: 10 HOT + 50 COLD → 10 + 30', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) =>
        row({ externalId: `hot-${i}`, dueDate: '2026-09-02', hoursAgo: 8 + i }),
      ),
      ...Array.from({ length: 50 }, (_, i) =>
        row({ externalId: `cold-${i}`, dueDate: '2024-03-01', hoursAgo: 8 + i }),
      ),
    ];
    const selected = select(rows);
    expect(selected.staleHotSelected).toBe(10);
    expect(selected.staleColdSelected).toBe(30);
    expect(selected.staleSelected).toBe(40);
  });

  it('TESTE C: 50 HOT + 5 COLD → 35 + 5', () => {
    const rows = [
      ...Array.from({ length: 50 }, (_, i) =>
        row({ externalId: `hot-${i}`, dueDate: '2026-08-15', hoursAgo: 8 + i }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        row({ externalId: `cold-${i}`, dueDate: '2023-06-01', hoursAgo: 8 + i }),
      ),
    ];
    const selected = select(rows);
    expect(selected.staleHotSelected).toBe(35);
    expect(selected.staleColdSelected).toBe(5);
    expect(selected.staleSelected).toBe(40);
  });

  it('TESTE D: 10 HOT + 5 COLD → 15 total, sem GET artificial', () => {
    const rows = [
      ...Array.from({ length: 10 }, (_, i) =>
        row({ externalId: `hot-${i}`, dueDate: '2026-10-01', hoursAgo: 8 }),
      ),
      ...Array.from({ length: 5 }, (_, i) =>
        row({ externalId: `cold-${i}`, dueDate: '2022-01-01', hoursAgo: 8 }),
      ),
    ];
    const selected = select(rows);
    expect(selected.staleSelected).toBe(15);
    expect(selected.staleHotSelected).toBe(10);
    expect(selected.staleColdSelected).toBe(5);
  });

  it('TESTE E: PAID do mês corrente stale é HOT (sem filtro financeiro)', () => {
    const selected = select([row({ externalId: 'paid-current', dueDate: '2026-09-02' })]);
    expect(selected.staleHotSelected).toBe(1);
    expect(selected.candidates[0]?.staleBand).toBe('hot');
  });

  it('TESTE F: due fora + competence dentro → HOT', () => {
    expect(
      isCostCenterDetailStaleHot(
        { dueDate: civil('2025-01-01'), competenceDate: civil('2026-09-15') },
        now,
      ),
    ).toBe(true);
    const selected = select([
      row({
        externalId: 'comp-hot',
        dueDate: '2025-01-01',
        competenceDate: '2026-09-15',
      }),
    ]);
    expect(selected.candidates[0]?.staleBand).toBe('hot');
  });

  it('TESTE G: competence fora + due dentro → HOT', () => {
    const selected = select([
      row({
        externalId: 'due-hot',
        dueDate: '2026-08-20',
        competenceDate: '2025-02-01',
      }),
    ]);
    expect(selected.candidates[0]?.staleBand).toBe('hot');
  });

  it('TESTE H: ambos fora → COLD', () => {
    const selected = select([
      row({
        externalId: 'both-cold',
        dueDate: '2025-01-01',
        competenceDate: '2025-02-01',
      }),
    ]);
    expect(selected.candidates[0]?.staleBand).toBe('cold');
    expect(selected.staleColdSelected).toBe(1);
  });

  it('TESTE I: virada de ano e timezone civil São Paulo', () => {
    const beforeMidnightSp = new Date('2027-01-01T02:00:00.000Z');
    expect(
      isCostCenterDetailStaleHot({ dueDate: civil('2026-11-01') }, beforeMidnightSp),
    ).toBe(true);
    expect(
      isCostCenterDetailStaleHot({ dueDate: civil('2026-10-31') }, beforeMidnightSp),
    ).toBe(false);
    expect(
      isCostCenterDetailStaleHot({ dueDate: civil('2027-01-31') }, beforeMidnightSp),
    ).toBe(true);
    expect(
      isCostCenterDetailStaleHot({ dueDate: civil('2027-02-01') }, beforeMidnightSp),
    ).toBe(false);

    const afterMidnightSp = new Date('2027-01-01T04:00:00.000Z');
    expect(
      isCostCenterDetailStaleHot({ dueDate: civil('2026-11-01') }, afterMidnightSp),
    ).toBe(false);
    expect(
      isCostCenterDetailStaleHot({ dueDate: civil('2026-12-01') }, afterMidnightSp),
    ).toBe(true);
    expect(
      isCostCenterDetailStaleHot({ dueDate: civil('2027-02-01') }, afterMidnightSp),
    ).toBe(true);

    const december = new Date('2026-12-15T15:00:00.000Z');
    expect(isCostCenterDetailStaleHot({ dueDate: civil('2026-11-01') }, december)).toBe(true);
    expect(isCostCenterDetailStaleHot({ dueDate: civil('2027-01-31') }, december)).toBe(true);
    expect(isCostCenterDetailStaleHot({ dueDate: civil('2026-10-31') }, december)).toBe(false);
    expect(isCostCenterDetailStaleHot({ dueDate: civil('2027-02-01') }, december)).toBe(false);
  });

  it('TESTE J: mesmo detailSyncedAt → tie-break kind + externalId + localId', () => {
    const selected = select([
      row({
        externalId: 'b-id',
        localId: 'local-b',
        kind: 'RECEIVABLE',
        dueDate: '2026-09-01',
        hoursAgo: 10,
      }),
      row({
        externalId: 'a-id',
        localId: 'local-a',
        kind: 'RECEIVABLE',
        dueDate: '2026-09-01',
        hoursAgo: 10,
      }),
      row({
        externalId: 'a-id',
        localId: 'local-z',
        kind: 'PAYABLE',
        dueDate: '2026-09-01',
        hoursAgo: 10,
      }),
    ]);
    expect(selected.candidates.map((item) => `${item.kind}:${item.externalId}:${item.localId}`)).toEqual([
      'PAYABLE:a-id:local-z',
      'RECEIVABLE:a-id:local-a',
      'RECEIVABLE:b-id:local-b',
    ]);
  });

  it('TESTE L: seleção de um tenant não inclui rows de outro', () => {
    const tenantA = [row({ externalId: 'a-1', dueDate: '2026-09-01' })];
    const tenantB = [row({ externalId: 'b-1', dueDate: '2026-09-01' })];
    const selectedA = select(tenantA);
    expect(selectedA.candidates.map((item) => item.externalId)).toEqual(['a-1']);
    expect(selectedA.candidates.some((item) => item.externalId === 'b-1')).toBe(false);
    expect(select(tenantB).candidates.map((item) => item.externalId)).toEqual(['b-1']);
  });

  it('TESTE M: nenhum candidato → zero stale', () => {
    const selected = select([]);
    expect(selected.candidates).toHaveLength(0);
    expect(selected.staleSelected).toBe(0);
  });

  it('TESTE N: mais de 40 candidatos → nunca ultrapassa 40 stale', () => {
    const rows = [
      ...Array.from({ length: 80 }, (_, i) =>
        row({ externalId: `hot-${i}`, dueDate: '2026-09-01', hoursAgo: 8 + i }),
      ),
      ...Array.from({ length: 80 }, (_, i) =>
        row({ externalId: `cold-${i}`, dueDate: '2021-01-01', hoursAgo: 8 + i }),
      ),
    ];
    const selected = select(rows);
    expect(selected.staleSelected).toBe(40);
    expect(selected.staleHotSelected + selected.staleColdSelected).toBe(40);
    expect(selected.staleHotSelected).toBe(28);
    expect(selected.staleColdSelected).toBe(12);
  });
});

describe('classifyCostCenterAllocationMutation', () => {
  it('classifica abertura, troca, limpeza e idempotência', () => {
    expect(classifyCostCenterAllocationMutation(0, 1, false)).toBe('opened');
    expect(classifyCostCenterAllocationMutation(1, 1, false)).toBe('replaced');
    expect(classifyCostCenterAllocationMutation(1, 0, false)).toBe('cleared');
    expect(classifyCostCenterAllocationMutation(2, 2, true)).toBe('unchanged');
  });
});
