import { civilTodayInSaoPaulo } from '../../../analytics/domain/analytical-timezone.js';
import {
  civilMonthBounds,
  civilMonthBoundsFromKey,
  isCivilDateInInclusiveRange,
  shiftCivilMonthKey,
} from '../../../analytics/domain/civil-calendar.js';
import type { CostCenterAllocationNormalizeKind } from './conta-azul-cost-center-allocation-normalize.js';

/**
 * Versão da regra de normalização/persistência de rateio (CC1.1).
 * Incrementar quando a semântica de persistência mudar e exigir re-enrichment.
 */
export const COST_CENTER_DETAIL_RULE_VERSION = 1;

/**
 * TTL após o qual FETCHED / NO_ALLOCATION / UNRESOLVED volta a ser candidato.
 *
 * Justificativa: `data_alteracao` da Conta Azul pode não avançar quando só o
 * rateio muda. Sync automático típico = 60 min. 6h ≈ 6 ciclos sem martelar
 * a parcela que acabou de ser confirmada. Orçamento stale = 40 GET/sync
 * (28 HOT operacional + 12 COLD histórico, com redistribuição de sobra).
 * O GET 200 do 11-E.1 cobre outra fatia no mesmo ciclo sem chamada extra.
 */
export const COST_CENTER_DETAIL_STALE_AFTER_MS = 6 * 60 * 60 * 1000;

/** Teto absoluto de revalidação stale por sync (além dos imediatos). */
export const COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC = 40;

/** Reserva inicial do estoque operacional (mês anterior + atual + seguinte). */
export const COST_CENTER_DETAIL_STALE_HOT_MAX_PER_SYNC = 28;

/** Reserva inicial do histórico (demais ACTIVE stale). */
export const COST_CENTER_DETAIL_STALE_COLD_MAX_PER_SYNC = 12;

export type CostCenterDetailStaleBand = 'hot' | 'cold';

export type CostCenterDetailStatusValue =
  | 'UNKNOWN'
  | 'FETCHED'
  | 'NO_ALLOCATION'
  | 'UNRESOLVED'
  | 'ERROR';

export type CostCenterDetailFetchDecision = {
  readonly shouldFetch: boolean;
  readonly reason:
    | 'unknown'
    | 'error_retry'
    | 'rule_version_bump'
    | 'upstream_changed'
    | 'stale_revalidate'
    | 'skip_fresh'
    | 'skip_no_allocation'
    | 'skip_unresolved_fresh'
    | 'skip_fetched_no_upstream';
};

/**
 * Decide se GET /parcelas/{id} é necessário para enriquecimento de centro.
 * Checkpoint semântico por parcela (não posicional).
 */
export function shouldFetchCostCenterDetail(input: {
  readonly status: CostCenterDetailStatusValue;
  readonly detailSyncedAt: Date | null;
  readonly detailRuleVersion: number;
  readonly upstreamUpdatedAt: Date | null;
  readonly currentRuleVersion?: number;
  readonly now?: Date;
  readonly staleAfterMs?: number;
}): CostCenterDetailFetchDecision {
  const ruleVersion = input.currentRuleVersion ?? COST_CENTER_DETAIL_RULE_VERSION;

  if (input.status === 'UNKNOWN') {
    return { shouldFetch: true, reason: 'unknown' };
  }

  if (input.status === 'ERROR') {
    return { shouldFetch: true, reason: 'error_retry' };
  }

  if (input.detailRuleVersion < ruleVersion) {
    return { shouldFetch: true, reason: 'rule_version_bump' };
  }

  if (
    input.upstreamUpdatedAt !== null &&
    input.detailSyncedAt !== null &&
    input.upstreamUpdatedAt.getTime() > input.detailSyncedAt.getTime()
  ) {
    return { shouldFetch: true, reason: 'upstream_changed' };
  }

  if (input.now !== undefined && input.staleAfterMs !== undefined) {
    const confirmedAt = input.detailSyncedAt?.getTime();
    const ageMs =
      confirmedAt === undefined ? Number.POSITIVE_INFINITY : input.now.getTime() - confirmedAt;
    if (
      ageMs >= input.staleAfterMs &&
      (input.status === 'FETCHED' ||
        input.status === 'NO_ALLOCATION' ||
        input.status === 'UNRESOLVED')
    ) {
      return { shouldFetch: true, reason: 'stale_revalidate' };
    }
  }

  if (input.status === 'NO_ALLOCATION') {
    return { shouldFetch: false, reason: 'skip_no_allocation' };
  }

  if (input.status === 'UNRESOLVED') {
    return { shouldFetch: false, reason: 'skip_unresolved_fresh' };
  }

  if (input.status === 'FETCHED' && input.upstreamUpdatedAt === null) {
    return { shouldFetch: false, reason: 'skip_fetched_no_upstream' };
  }

  return { shouldFetch: false, reason: 'skip_fresh' };
}

/** Mapeia kind do normalizador CC1.1 → status persistido CC1.2. */
export function detailStatusFromNormalizeKind(
  kind: CostCenterAllocationNormalizeKind,
): Exclude<CostCenterDetailStatusValue, 'UNKNOWN' | 'ERROR'> {
  if (kind === 'NO_ALLOCATION') {
    return 'NO_ALLOCATION';
  }
  if (kind === 'MULTI_CENTER_UNRESOLVED') {
    return 'UNRESOLVED';
  }
  return 'FETCHED';
}

export type CostCenterAllocationMutation = 'opened' | 'cleared' | 'replaced' | 'unchanged';

export function classifyCostCenterAllocationMutation(
  previousCount: number,
  nextCount: number,
  sameFingerprint: boolean,
): CostCenterAllocationMutation {
  if (sameFingerprint) {
    return 'unchanged';
  }
  if (previousCount === 0 && nextCount > 0) {
    return 'opened';
  }
  if (previousCount > 0 && nextCount === 0) {
    return 'cleared';
  }
  return 'replaced';
}

export type CostCenterDetailSelectionRow<TTotal> = {
  readonly kind: 'RECEIVABLE' | 'PAYABLE';
  readonly localId: string;
  readonly externalId: string;
  readonly total: TTotal;
  readonly status: CostCenterDetailStatusValue;
  readonly detailSyncedAt: Date | null;
  readonly detailRuleVersion: number;
  readonly upstreamUpdatedAt: Date | null;
  readonly dueDate?: Date | null;
  readonly competenceDate?: Date | null;
};

/**
 * HOT = dueDate OU competenceDate no mês civil SP anterior, atual ou seguinte.
 * Datas no contrato @db.Date (meia-noite UTC), âncora = civilTodayInSaoPaulo(now).
 */
export function isCostCenterDetailStaleHot(
  input: {
    readonly dueDate?: Date | null;
    readonly competenceDate?: Date | null;
  },
  now: Date,
): boolean {
  const today = civilTodayInSaoPaulo(now);
  const current = civilMonthBounds(today);
  const previous = civilMonthBoundsFromKey(shiftCivilMonthKey(current.monthKey, -1));
  const next = civilMonthBoundsFromKey(shiftCivilMonthKey(current.monthKey, 1));
  const from = previous.from;
  const to = next.to;
  if (input.dueDate && isCivilDateInInclusiveRange(input.dueDate, from, to)) {
    return true;
  }
  if (input.competenceDate && isCivilDateInInclusiveRange(input.competenceDate, from, to)) {
    return true;
  }
  return false;
}

/** Reserva 28/12 com sobra redistribuída; nunca ultrapassa o teto total. */
export function allocateStaleHotColdBudget(input: {
  readonly hotCount: number;
  readonly coldCount: number;
  readonly hotBudget?: number;
  readonly coldBudget?: number;
  readonly totalBudget?: number;
}): { readonly hot: number; readonly cold: number } {
  const total = input.totalBudget ?? COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC;
  const hotBudget = input.hotBudget ?? COST_CENTER_DETAIL_STALE_HOT_MAX_PER_SYNC;
  const coldBudget = input.coldBudget ?? COST_CENTER_DETAIL_STALE_COLD_MAX_PER_SYNC;
  const hotTake = Math.min(Math.max(0, input.hotCount), hotBudget, total);
  const coldTake = Math.min(
    Math.max(0, input.coldCount),
    coldBudget,
    Math.max(0, total - hotTake),
  );
  let remaining = Math.max(0, total - hotTake - coldTake);
  const extraHot = Math.min(Math.max(0, input.hotCount - hotTake), remaining);
  remaining -= extraHot;
  const extraCold = Math.min(Math.max(0, input.coldCount - coldTake), remaining);
  return { hot: hotTake + extraHot, cold: coldTake + extraCold };
}

function compareStaleCandidates(
  left: { readonly detailSyncedAt: Date | null; readonly kind: string; readonly externalId: string; readonly localId: string },
  right: { readonly detailSyncedAt: Date | null; readonly kind: string; readonly externalId: string; readonly localId: string },
): number {
  const at = left.detailSyncedAt?.getTime() ?? 0;
  const bt = right.detailSyncedAt?.getTime() ?? 0;
  if (at !== bt) {
    return at - bt;
  }
  if (left.kind !== right.kind) {
    return left.kind.localeCompare(right.kind);
  }
  const byExternal = left.externalId.localeCompare(right.externalId);
  if (byExternal !== 0) {
    return byExternal;
  }
  return left.localId.localeCompare(right.localId);
}

/**
 * Immediate (UNKNOWN/ERROR/bump/upstream) + stale HOT/COLD bounded.
 * Sem `now` → não seleciona stale (compatível com listagens de teste).
 */
export function selectCostCenterDetailCandidates<TTotal>(
  rows: readonly CostCenterDetailSelectionRow<TTotal>[],
  options: {
    readonly now?: Date;
    readonly staleAfterMs?: number;
    readonly staleLimit?: number;
    readonly currentRuleVersion?: number;
  } = {},
): {
  readonly candidates: Array<{
    readonly kind: 'RECEIVABLE' | 'PAYABLE';
    readonly localId: string;
    readonly externalId: string;
    readonly total: TTotal;
    readonly reason: CostCenterDetailFetchDecision['reason'];
    readonly staleBand?: CostCenterDetailStaleBand;
  }>;
  readonly skippedFresh: number;
  readonly staleSelected: number;
  readonly staleHotSelected: number;
  readonly staleColdSelected: number;
} {
  const staleEnabled = options.now !== undefined;
  const staleAfterMs = options.staleAfterMs ?? COST_CENTER_DETAIL_STALE_AFTER_MS;
  const staleLimit = staleEnabled
    ? (options.staleLimit ?? COST_CENTER_DETAIL_STALE_REVALIDATE_MAX_PER_SYNC)
    : 0;

  type Selected = {
    readonly kind: 'RECEIVABLE' | 'PAYABLE';
    readonly localId: string;
    readonly externalId: string;
    readonly total: TTotal;
    readonly reason: CostCenterDetailFetchDecision['reason'];
    readonly staleBand?: CostCenterDetailStaleBand;
  };
  type StaleRow = Selected & {
    readonly detailSyncedAt: Date | null;
    readonly staleBand: CostCenterDetailStaleBand;
  };

  const immediate: Selected[] = [];
  const hot: StaleRow[] = [];
  const cold: StaleRow[] = [];
  let skippedFresh = 0;

  for (const row of rows) {
    const decision = shouldFetchCostCenterDetail({
      status: row.status,
      detailSyncedAt: row.detailSyncedAt,
      detailRuleVersion: row.detailRuleVersion,
      upstreamUpdatedAt: row.upstreamUpdatedAt,
      currentRuleVersion: options.currentRuleVersion,
      now: staleEnabled ? options.now : undefined,
      staleAfterMs: staleEnabled ? staleAfterMs : undefined,
    });
    if (!decision.shouldFetch) {
      skippedFresh += 1;
      continue;
    }
    const candidate = {
      kind: row.kind,
      localId: row.localId,
      externalId: row.externalId,
      total: row.total,
      reason: decision.reason,
    };
    if (decision.reason === 'stale_revalidate' && options.now) {
      const band: CostCenterDetailStaleBand = isCostCenterDetailStaleHot(row, options.now)
        ? 'hot'
        : 'cold';
      const staleRow = { ...candidate, detailSyncedAt: row.detailSyncedAt, staleBand: band };
      if (band === 'hot') {
        hot.push(staleRow);
      } else {
        cold.push(staleRow);
      }
    } else {
      immediate.push(candidate);
    }
  }

  hot.sort(compareStaleCandidates);
  cold.sort(compareStaleCandidates);

  const budget = allocateStaleHotColdBudget({
    hotCount: hot.length,
    coldCount: cold.length,
    totalBudget: Math.max(0, staleLimit),
  });
  const takenHot = hot.slice(0, budget.hot);
  const takenCold = cold.slice(0, budget.cold);
  skippedFresh += hot.length - takenHot.length + (cold.length - takenCold.length);

  const takenStale = [...takenHot, ...takenCold];

  return {
    candidates: [
      ...immediate,
      ...takenStale.map((row) => ({
        kind: row.kind,
        localId: row.localId,
        externalId: row.externalId,
        total: row.total,
        reason: row.reason,
        staleBand: row.staleBand,
      })),
    ],
    skippedFresh,
    staleSelected: takenStale.length,
    staleHotSelected: takenHot.length,
    staleColdSelected: takenCold.length,
  };
}

export type CostCenterEnrichmentCounters = {
  candidates: number;
  skippedFresh: number;
  requested: number;
  success: number;
  noAllocation: number;
  partial: number;
  unresolved: number;
  errors: number;
  allocationsWritten: number;
  reusedPresencePayloads: number;
  staleRevalidated: number;
  staleHotSelected: number;
  staleColdSelected: number;
  allocationOpened: number;
  allocationCleared: number;
  allocationReplaced: number;
  allocationUnchanged: number;
};

export function emptyCostCenterEnrichmentCounters(): CostCenterEnrichmentCounters {
  return {
    candidates: 0,
    skippedFresh: 0,
    requested: 0,
    success: 0,
    noAllocation: 0,
    partial: 0,
    unresolved: 0,
    errors: 0,
    allocationsWritten: 0,
    reusedPresencePayloads: 0,
    staleRevalidated: 0,
    staleHotSelected: 0,
    staleColdSelected: 0,
    allocationOpened: 0,
    allocationCleared: 0,
    allocationReplaced: 0,
    allocationUnchanged: 0,
  };
}
