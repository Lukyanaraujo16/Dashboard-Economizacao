import type { CostCenterAllocationNormalizeKind } from './conta-azul-cost-center-allocation-normalize.js';

/**
 * Versão da regra de normalização/persistência de rateio (CC1.1).
 * Incrementar quando a semântica de persistência mudar e exigir re-enrichment.
 */
export const COST_CENTER_DETAIL_RULE_VERSION = 1;

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
  };
}
