/**
 * Vocabulário tipado da Universal Analytical Layer (F13.8.5A).
 * Registry de capabilities = o que está publicado; estes keys ≠ permissão de execução.
 */

export const ANALYTICAL_SEMANTIC_FAMILIES = [
  'FLOW',
  'STOCK',
  'BILLING',
  'BANK_BALANCE',
  'FORECAST',
  'COMPETENCE',
] as const;
export type AnalyticalSemanticFamily = (typeof ANALYTICAL_SEMANTIC_FAMILIES)[number];

export const ANALYTICAL_METRIC_KEYS = [
  'REALIZED_CASH',
  'CASH_RESULT',
  'BILLING',
  'RECEIVABLE_STOCK',
  'PAYABLE_STOCK',
  'DELINQUENCY',
  'BANK_BALANCE',
  'FORECAST_CASH',
] as const;
export type AnalyticalMetricKey = (typeof ANALYTICAL_METRIC_KEYS)[number];

/**
 * CUSTOMER/SUPPLIER não são DimensionKey — são partyProfile em filters.
 * CONVENIO não é dimensão — alias/filtro categorial futuro.
 */
export const ANALYTICAL_DIMENSION_KEYS = [
  'CATEGORY',
  'COST_CENTER',
  'COUNTERPARTY',
] as const;
export type AnalyticalDimensionKey = (typeof ANALYTICAL_DIMENSION_KEYS)[number];

export const ANALYTICAL_DIRECTIONS = ['INFLOW', 'OUTFLOW', 'NET'] as const;
export type AnalyticalDirection = (typeof ANALYTICAL_DIRECTIONS)[number];

export const ANALYTICAL_PERIOD_KINDS = [
  'MONTH',
  'YTD',
  'YEAR',
  'CURRENT',
  'COMPARISON',
] as const;
export type AnalyticalPeriodKind = (typeof ANALYTICAL_PERIOD_KINDS)[number];

export const ANALYTICAL_OPERATION_KEYS = [
  'VALUE',
  'LOOKUP',
  'RANKING_WINNER',
  'RANKING_TOPN',
  'BREAKDOWN',
  'SHARE',
  'MOVEMENTS',
  'COMPARE',
] as const;
export type AnalyticalOperationKey = (typeof ANALYTICAL_OPERATION_KEYS)[number];

export const ANALYTICAL_FILTER_KEYS = [
  'partyProfile',
  'categoryReference',
  'costCenterQuery',
] as const;
export type AnalyticalFilterKey = (typeof ANALYTICAL_FILTER_KEYS)[number];

export const ANALYTICAL_PARTY_PROFILES = ['CUSTOMER', 'SUPPLIER', 'ANY'] as const;
export type AnalyticalPartyProfile = (typeof ANALYTICAL_PARTY_PROFILES)[number];

export const ANALYTICAL_CIVIL_TIME_ZONE = 'America/Sao_Paulo' as const;

/** Metadata para adapters F13.8.5B — sem execução nesta fase. */
export const ANALYTICAL_EXECUTOR_KEYS = [
  'compareCashMonths',
  'realizedCashCategoryBreakdown',
  'realizedCashMovements',
  'realizedCashCounterparty',
  'realizedCashCostCenter',
  'currentSnapshot',
  'financialFactsMonth',
] as const;
export type AnalyticalExecutorKey = (typeof ANALYTICAL_EXECUTOR_KEYS)[number];

export function isAnalyticalSemanticFamily(
  value: string,
): value is AnalyticalSemanticFamily {
  return (ANALYTICAL_SEMANTIC_FAMILIES as readonly string[]).includes(value);
}

export function isAnalyticalMetricKey(value: string): value is AnalyticalMetricKey {
  return (ANALYTICAL_METRIC_KEYS as readonly string[]).includes(value);
}

export function isAnalyticalDimensionKey(
  value: string,
): value is AnalyticalDimensionKey {
  return (ANALYTICAL_DIMENSION_KEYS as readonly string[]).includes(value);
}

export function isAnalyticalDirection(value: string): value is AnalyticalDirection {
  return (ANALYTICAL_DIRECTIONS as readonly string[]).includes(value);
}

export function isAnalyticalPeriodKind(value: string): value is AnalyticalPeriodKind {
  return (ANALYTICAL_PERIOD_KINDS as readonly string[]).includes(value);
}

export function isAnalyticalOperationKey(
  value: string,
): value is AnalyticalOperationKey {
  return (ANALYTICAL_OPERATION_KEYS as readonly string[]).includes(value);
}

export function isAnalyticalFilterKey(value: string): value is AnalyticalFilterKey {
  return (ANALYTICAL_FILTER_KEYS as readonly string[]).includes(value);
}

export function isAnalyticalPartyProfile(
  value: string,
): value is AnalyticalPartyProfile {
  return (ANALYTICAL_PARTY_PROFILES as readonly string[]).includes(value);
}
