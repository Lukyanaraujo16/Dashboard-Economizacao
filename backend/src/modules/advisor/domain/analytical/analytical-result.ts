import type { AnalyticalCoverage } from './analytical-coverage.js';
import type {
  AnalyticalDimensionKey,
  AnalyticalDirection,
  AnalyticalMetricKey,
  AnalyticalOperationKey,
  AnalyticalSemanticFamily,
} from './analytical-keys.js';
import type { AnalyticalPeriod } from './analytical-period.js';

export const ANALYTICAL_RESULT_STATUSES = [
  'AVAILABLE',
  'PARTIAL',
  'AMBIGUOUS',
  'UNAVAILABLE',
  'DENIED',
] as const;
export type AnalyticalResultStatus = (typeof ANALYTICAL_RESULT_STATUSES)[number];

export type AnalyticalResultMeta = {
  readonly metric: AnalyticalMetricKey;
  readonly semanticFamily: AnalyticalSemanticFamily;
  readonly period: AnalyticalPeriod;
  readonly direction?: AnalyticalDirection;
  readonly dimension?: AnalyticalDimensionKey;
  readonly operation: AnalyticalOperationKey;
};

export type AnalyticalValuePayload = {
  readonly operation: 'VALUE';
  readonly value: string | null;
  readonly meaning: string;
};

export type AnalyticalRankingRow = {
  readonly rank: number;
  readonly identityKey: string;
  readonly displayName: string;
  readonly amount: string | null;
  readonly shareOfPopulation: string | null;
  readonly shareOfIdentified: string | null;
};

export type AnalyticalRankingPayload = {
  readonly operation: 'RANKING_WINNER' | 'RANKING_TOPN' | 'BREAKDOWN';
  readonly requestedLimit: number;
  readonly returnedCount: number;
  readonly rows: readonly AnalyticalRankingRow[];
  readonly coverage?: AnalyticalCoverage;
  readonly total: string | null;
};

export type AnalyticalLookupPayload = {
  readonly operation: 'LOOKUP';
  readonly status: 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS';
  readonly identityKey: string | null;
  readonly displayName: string | null;
  readonly amount: string | null;
  readonly shareOfPopulation: string | null;
  readonly shareOfIdentified: string | null;
  readonly coverage?: AnalyticalCoverage;
  readonly candidates?: readonly AnalyticalRankingRow[];
};

export type AnalyticalMovementRow = {
  readonly occurredOn: string | null;
  readonly amount: string | null;
  readonly description: string | null;
  readonly identityKey: string | null;
  readonly displayName: string | null;
};

export type AnalyticalMovementsPayload = {
  readonly operation: 'MOVEMENTS';
  readonly requestedLimit: number;
  readonly returnedCount: number;
  readonly rows: readonly AnalyticalMovementRow[];
  readonly coverage?: AnalyticalCoverage;
};

export type AnalyticalCompareSide = {
  readonly period: AnalyticalPeriod;
  readonly value: string | null;
};

export type AnalyticalComparePayload = {
  readonly operation: 'COMPARE';
  readonly left: AnalyticalCompareSide;
  readonly right: AnalyticalCompareSide;
  readonly deltaAmount: string | null;
  readonly deltaPercent: string | null;
};

export type AnalyticalResultPayload =
  | AnalyticalValuePayload
  | AnalyticalRankingPayload
  | AnalyticalLookupPayload
  | AnalyticalMovementsPayload
  | AnalyticalComparePayload;

export type AnalyticalAvailableResult = AnalyticalResultMeta & {
  readonly status: 'AVAILABLE' | 'PARTIAL';
  readonly payload: AnalyticalResultPayload;
  readonly coverage?: AnalyticalCoverage;
};

export type AnalyticalAmbiguousResult = AnalyticalResultMeta & {
  readonly status: 'AMBIGUOUS';
  readonly reasonCode: string;
  readonly candidates: readonly AnalyticalRankingRow[];
};

export type AnalyticalUnavailableResult = AnalyticalResultMeta & {
  readonly status: 'UNAVAILABLE';
  readonly reasonCode: string;
  readonly messageSafe: string;
};

export type AnalyticalDeniedResult = {
  readonly status: 'DENIED';
  readonly reasonCode: string;
  readonly messageSafe: string;
  readonly capabilityKey?: string;
};

export type AnalyticalResult =
  | AnalyticalAvailableResult
  | AnalyticalAmbiguousResult
  | AnalyticalUnavailableResult
  | AnalyticalDeniedResult;
