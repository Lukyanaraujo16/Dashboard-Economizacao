import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
} from '../advisor-cash-realized-breakdown.js';
import type {
  AnalyticalDimensionKey,
  AnalyticalDirection,
  AnalyticalExecutorKey,
  AnalyticalFilterKey,
  AnalyticalMetricKey,
  AnalyticalOperationKey,
  AnalyticalPeriodKind,
  AnalyticalSemanticFamily,
} from './analytical-keys.js';

/**
 * Capability Registry = capacidades PUBLICADAS/homologadas hoje.
 * Deny by default: engine teórico ≠ capability publicada.
 * Não publicar OUTFLOW×COUNTERPARTY YEAR, YTD/YEAR CC, bank, forecast, competence.
 */
export type AnalyticalCapability = {
  readonly key: string;
  readonly metric: AnalyticalMetricKey;
  readonly semanticFamily: AnalyticalSemanticFamily;
  /**
   * null = direction deve estar ausente.
   * Array = direction obrigatória e ∈ lista.
   */
  readonly directions: readonly AnalyticalDirection[] | null;
  /**
   * Inclui `null` quando a capability é agregação sem dimensão.
   */
  readonly dimensions: readonly (AnalyticalDimensionKey | null)[];
  readonly periodKinds: readonly AnalyticalPeriodKind[];
  /** Para COMPARISON: kinds permitidos em left/right. */
  readonly comparisonChildKinds: readonly AnalyticalPeriodKind[] | null;
  readonly operations: readonly AnalyticalOperationKey[];
  readonly allowedFilters: readonly AnalyticalFilterKey[];
  /** Filters que devem estar presentes (não vazios). */
  readonly requiredFilters: readonly AnalyticalFilterKey[];
  readonly identityRequired: boolean;
  readonly maxLimit: number | null;
  readonly defaultLimit: number | null;
  readonly executorKey: AnalyticalExecutorKey;
  readonly sourceToolOrSurface: string;
};

const DRILL_MAX = ADVISOR_DRILLDOWN_MAX_LIMIT;
const DRILL_DEFAULT = ADVISOR_DRILLDOWN_DEFAULT_LIMIT;

export const ANALYTICAL_CAPABILITY_REGISTRY: readonly AnalyticalCapability[] = [
  // --- compare_cash_months ---
  {
    key: 'billing.compare.month_pair',
    metric: 'BILLING',
    semanticFamily: 'BILLING',
    directions: null,
    dimensions: [null],
    periodKinds: ['COMPARISON'],
    comparisonChildKinds: ['MONTH'],
    operations: ['COMPARE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'compareCashMonths',
    sourceToolOrSurface: 'compare_cash_months',
  },
  {
    key: 'realized_cash.compare.month_pair.totals',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: [null],
    periodKinds: ['COMPARISON'],
    comparisonChildKinds: ['MONTH'],
    operations: ['COMPARE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'compareCashMonths',
    sourceToolOrSurface: 'compare_cash_months',
  },
  {
    key: 'cash_result.compare.month_pair',
    metric: 'CASH_RESULT',
    semanticFamily: 'FLOW',
    directions: ['NET'],
    dimensions: [null],
    periodKinds: ['COMPARISON'],
    comparisonChildKinds: ['MONTH'],
    operations: ['COMPARE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'compareCashMonths',
    sourceToolOrSurface: 'compare_cash_months',
  },
  {
    key: 'realized_cash.compare.month_pair.category',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: ['CATEGORY'],
    periodKinds: ['COMPARISON'],
    comparisonChildKinds: ['MONTH'],
    operations: ['COMPARE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'compareCashMonths',
    sourceToolOrSurface: 'compare_cash_months',
  },

  // --- FINANCIAL_FACTS preload (mês civil) ---
  {
    key: 'billing.value.month',
    metric: 'BILLING',
    semanticFamily: 'BILLING',
    directions: null,
    dimensions: [null],
    periodKinds: ['MONTH'],
    comparisonChildKinds: null,
    operations: ['VALUE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'financialFactsMonth',
    sourceToolOrSurface: 'FINANCIAL_FACTS',
  },
  {
    key: 'realized_cash.value.month',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: [null],
    periodKinds: ['MONTH'],
    comparisonChildKinds: null,
    operations: ['VALUE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'financialFactsMonth',
    sourceToolOrSurface: 'FINANCIAL_FACTS',
  },
  {
    key: 'cash_result.value.month',
    metric: 'CASH_RESULT',
    semanticFamily: 'FLOW',
    directions: ['NET'],
    dimensions: [null],
    periodKinds: ['MONTH'],
    comparisonChildKinds: null,
    operations: ['VALUE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'financialFactsMonth',
    sourceToolOrSurface: 'FINANCIAL_FACTS',
  },

  // --- cash_realized_breakdown ---
  {
    key: 'realized_cash.category.month.breakdown',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: ['CATEGORY'],
    periodKinds: ['MONTH'],
    comparisonChildKinds: null,
    operations: ['BREAKDOWN'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: DRILL_MAX,
    defaultLimit: DRILL_DEFAULT,
    executorKey: 'realizedCashCategoryBreakdown',
    sourceToolOrSurface: 'cash_realized_breakdown',
  },

  // --- cash_movement_lines ---
  {
    key: 'realized_cash.movements.month',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: [null],
    periodKinds: ['MONTH'],
    comparisonChildKinds: null,
    operations: ['MOVEMENTS'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: DRILL_MAX,
    defaultLimit: DRILL_DEFAULT,
    executorKey: 'realizedCashMovements',
    sourceToolOrSurface: 'cash_movement_lines',
  },

  // --- cash_nominal_dimension_* (INFLOW only, published) ---
  {
    key: 'realized_cash.counterparty.inflow.ranking_winner',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW'],
    dimensions: ['COUNTERPARTY'],
    periodKinds: ['MONTH', 'YTD', 'YEAR'],
    comparisonChildKinds: null,
    operations: ['RANKING_WINNER'],
    allowedFilters: ['categoryReference'],
    requiredFilters: ['categoryReference'],
    identityRequired: false,
    maxLimit: 1,
    defaultLimit: 1,
    executorKey: 'realizedCashCounterparty',
    sourceToolOrSurface: 'cash_nominal_dimension_ranking',
  },
  {
    key: 'realized_cash.counterparty.inflow.ranking_topn',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW'],
    dimensions: ['COUNTERPARTY'],
    periodKinds: ['MONTH', 'YTD', 'YEAR'],
    comparisonChildKinds: null,
    operations: ['RANKING_TOPN'],
    allowedFilters: ['categoryReference'],
    requiredFilters: ['categoryReference'],
    identityRequired: false,
    maxLimit: DRILL_MAX,
    defaultLimit: DRILL_DEFAULT,
    executorKey: 'realizedCashCounterparty',
    sourceToolOrSurface: 'cash_nominal_dimension_ranking',
  },
  {
    key: 'realized_cash.counterparty.inflow.lookup',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW'],
    dimensions: ['COUNTERPARTY'],
    periodKinds: ['MONTH', 'YTD', 'YEAR'],
    comparisonChildKinds: null,
    operations: ['LOOKUP'],
    allowedFilters: ['categoryReference'],
    requiredFilters: [],
    identityRequired: true,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'realizedCashCounterparty',
    sourceToolOrSurface: 'cash_nominal_dimension_lookup',
  },
  {
    key: 'realized_cash.counterparty.inflow.compare.month_pair',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW'],
    dimensions: ['COUNTERPARTY'],
    periodKinds: ['COMPARISON'],
    comparisonChildKinds: ['MONTH'],
    operations: ['COMPARE'],
    allowedFilters: ['categoryReference'],
    requiredFilters: [],
    identityRequired: true,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'realizedCashCounterparty',
    sourceToolOrSurface: 'compare_cash_nominal_dimension',
  },

  // --- cash_cost_center_* (MONTH only hoje) ---
  {
    key: 'realized_cash.cost_center.month.ranking_winner',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: ['COST_CENTER'],
    periodKinds: ['MONTH'],
    comparisonChildKinds: null,
    operations: ['RANKING_WINNER'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: 1,
    defaultLimit: 1,
    executorKey: 'realizedCashCostCenter',
    sourceToolOrSurface: 'cash_cost_center_ranking',
  },
  {
    key: 'realized_cash.cost_center.month.ranking_topn',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: ['COST_CENTER'],
    periodKinds: ['MONTH'],
    comparisonChildKinds: null,
    operations: ['RANKING_TOPN'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: DRILL_MAX,
    defaultLimit: DRILL_DEFAULT,
    executorKey: 'realizedCashCostCenter',
    sourceToolOrSurface: 'cash_cost_center_ranking',
  },
  {
    key: 'realized_cash.cost_center.month.lookup',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: ['COST_CENTER'],
    periodKinds: ['MONTH'],
    comparisonChildKinds: null,
    operations: ['LOOKUP'],
    allowedFilters: ['costCenterQuery'],
    requiredFilters: ['costCenterQuery'],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'realizedCashCostCenter',
    sourceToolOrSurface: 'cash_cost_center_lookup',
  },
  {
    key: 'realized_cash.cost_center.compare.month_pair',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: ['COST_CENTER'],
    periodKinds: ['COMPARISON'],
    comparisonChildKinds: ['MONTH'],
    operations: ['COMPARE'],
    allowedFilters: ['costCenterQuery'],
    requiredFilters: ['costCenterQuery'],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'realizedCashCostCenter',
    sourceToolOrSurface: 'compare_cash_cost_center',
  },
  {
    key: 'realized_cash.cost_center.month.movements',
    metric: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    directions: ['INFLOW', 'OUTFLOW'],
    dimensions: ['COST_CENTER'],
    periodKinds: ['MONTH'],
    comparisonChildKinds: null,
    operations: ['MOVEMENTS'],
    allowedFilters: ['costCenterQuery'],
    requiredFilters: ['costCenterQuery'],
    identityRequired: false,
    maxLimit: DRILL_MAX,
    defaultLimit: DRILL_DEFAULT,
    executorKey: 'realizedCashCostCenter',
    sourceToolOrSurface: 'cash_cost_center_movement_lines',
  },

  // --- current_financial_snapshot (preload) ---
  {
    key: 'receivable_stock.current.value',
    metric: 'RECEIVABLE_STOCK',
    semanticFamily: 'STOCK',
    directions: null,
    dimensions: [null],
    periodKinds: ['CURRENT'],
    comparisonChildKinds: null,
    operations: ['VALUE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'currentSnapshot',
    sourceToolOrSurface: 'current_financial_snapshot',
  },
  {
    key: 'payable_stock.current.value',
    metric: 'PAYABLE_STOCK',
    semanticFamily: 'STOCK',
    directions: null,
    dimensions: [null],
    periodKinds: ['CURRENT'],
    comparisonChildKinds: null,
    operations: ['VALUE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'currentSnapshot',
    sourceToolOrSurface: 'current_financial_snapshot',
  },
  {
    key: 'delinquency.current.value',
    metric: 'DELINQUENCY',
    semanticFamily: 'STOCK',
    directions: null,
    dimensions: [null],
    periodKinds: ['CURRENT'],
    comparisonChildKinds: null,
    operations: ['VALUE'],
    allowedFilters: [],
    requiredFilters: [],
    identityRequired: false,
    maxLimit: null,
    defaultLimit: null,
    executorKey: 'currentSnapshot',
    sourceToolOrSurface: 'current_financial_snapshot',
  },
] as const;

const BY_KEY = new Map(
  ANALYTICAL_CAPABILITY_REGISTRY.map((capability) => [capability.key, capability] as const),
);

export function listAnalyticalCapabilities(): readonly AnalyticalCapability[] {
  return ANALYTICAL_CAPABILITY_REGISTRY;
}

export function getAnalyticalCapability(
  key: string,
): AnalyticalCapability | undefined {
  return BY_KEY.get(key);
}
