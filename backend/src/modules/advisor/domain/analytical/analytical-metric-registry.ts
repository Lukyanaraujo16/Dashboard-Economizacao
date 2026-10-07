import type {
  AnalyticalDirection,
  AnalyticalMetricKey,
  AnalyticalSemanticFamily,
} from './analytical-keys.js';

/**
 * Metric Registry: o que a métrica significa (metadata estática).
 * Capability Registry decide quais combinações estão publicadas.
 * CASH ≠ BILLING.
 */
export type AnalyticalTemporalSemantics =
  | 'occurredOn'
  | 'asOf'
  | 'civilMonth'
  | 'balanceDate'
  | 'dueDateHorizon';

export type AnalyticalMetricDefinition = {
  readonly key: AnalyticalMetricKey;
  readonly semanticFamily: AnalyticalSemanticFamily;
  /** Meaning factual seguro; não é label de UI livre. */
  readonly factualMeaning: string;
  readonly temporalSemantics: AnalyticalTemporalSemantics;
  readonly possibleDirections: readonly AnalyticalDirection[];
  /** Vocabulário conhecido; publicação real = Capability Registry. */
  readonly publicationStatus: 'VOCABULARY_ONLY' | 'HAS_PUBLISHED_CAPABILITIES';
};

export const ANALYTICAL_METRIC_REGISTRY: readonly AnalyticalMetricDefinition[] = [
  {
    key: 'REALIZED_CASH',
    semanticFamily: 'FLOW',
    factualMeaning: 'ENTRADAS_OU_SAIDAS_REALIZADAS_DE_CAIXA',
    temporalSemantics: 'occurredOn',
    possibleDirections: ['INFLOW', 'OUTFLOW'],
    publicationStatus: 'HAS_PUBLISHED_CAPABILITIES',
  },
  {
    key: 'CASH_RESULT',
    semanticFamily: 'FLOW',
    factualMeaning: 'RESULTADO_DE_CAIXA',
    temporalSemantics: 'occurredOn',
    possibleDirections: ['NET'],
    publicationStatus: 'HAS_PUBLISHED_CAPABILITIES',
  },
  {
    key: 'BILLING',
    semanticFamily: 'BILLING',
    factualMeaning: 'MONTHLY_BILLING_INFLOW_PLUS_EXPECTED_RECEIVABLES',
    temporalSemantics: 'civilMonth',
    possibleDirections: [],
    publicationStatus: 'HAS_PUBLISHED_CAPABILITIES',
  },
  {
    key: 'REVENUE_GOAL',
    semanticFamily: 'PLANNING',
    factualMeaning: 'COMPANY_MONTHLY_REVENUE_GOAL_VERSUS_BILLING',
    temporalSemantics: 'civilMonth',
    possibleDirections: [],
    publicationStatus: 'HAS_PUBLISHED_CAPABILITIES',
  },
  {
    key: 'EXPENSE_CEILING',
    semanticFamily: 'PLANNING',
    factualMeaning: 'COMPANY_MONTHLY_EXPENSE_CEILING_VERSUS_MONTHLY_EXPENSES',
    temporalSemantics: 'civilMonth',
    possibleDirections: [],
    publicationStatus: 'HAS_PUBLISHED_CAPABILITIES',
  },
  {
    key: 'RECEIVABLE_STOCK',
    semanticFamily: 'STOCK',
    factualMeaning: 'RECEIVABLE_OPEN_STOCK',
    temporalSemantics: 'asOf',
    possibleDirections: [],
    publicationStatus: 'HAS_PUBLISHED_CAPABILITIES',
  },
  {
    key: 'PAYABLE_STOCK',
    semanticFamily: 'STOCK',
    factualMeaning: 'PAYABLE_OPEN_STOCK',
    temporalSemantics: 'asOf',
    possibleDirections: [],
    publicationStatus: 'HAS_PUBLISHED_CAPABILITIES',
  },
  {
    key: 'PAYABLE_TITLE',
    semanticFamily: 'STOCK',
    factualMeaning: 'ACCOUNTS_PAYABLE_TITLES_BY_DUE_DATE',
    temporalSemantics: 'civilMonth',
    possibleDirections: [],
    publicationStatus: 'HAS_PUBLISHED_CAPABILITIES',
  },
  {
    key: 'DELINQUENCY',
    semanticFamily: 'STOCK',
    factualMeaning: 'RECEIVABLE_DELINQUENCY_RATE',
    temporalSemantics: 'asOf',
    possibleDirections: [],
    publicationStatus: 'HAS_PUBLISHED_CAPABILITIES',
  },
  {
    key: 'BANK_BALANCE',
    semanticFamily: 'BANK_BALANCE',
    factualMeaning: 'OFFICIAL_BANK_BALANCE_SNAPSHOT',
    temporalSemantics: 'balanceDate',
    possibleDirections: [],
    publicationStatus: 'VOCABULARY_ONLY',
  },
  {
    key: 'FORECAST_CASH',
    semanticFamily: 'FORECAST',
    factualMeaning: 'EXPECTED_CASH_HORIZON',
    temporalSemantics: 'dueDateHorizon',
    possibleDirections: ['INFLOW', 'OUTFLOW', 'NET'],
    publicationStatus: 'VOCABULARY_ONLY',
  },
] as const;

const BY_KEY = new Map(
  ANALYTICAL_METRIC_REGISTRY.map((metric) => [metric.key, metric] as const),
);

export function getAnalyticalMetric(
  key: AnalyticalMetricKey,
): AnalyticalMetricDefinition | undefined {
  return BY_KEY.get(key);
}

export function listAnalyticalMetrics(): readonly AnalyticalMetricDefinition[] {
  return ANALYTICAL_METRIC_REGISTRY;
}
