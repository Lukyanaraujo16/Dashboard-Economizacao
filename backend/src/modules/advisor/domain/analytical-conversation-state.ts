import type { AnalyticalOperationKey } from './analytical/analytical-keys.js';
import type { AnalyticalPeriod } from './analytical/analytical-period.js';
import type { CounterpartyProfileRole } from './counterparty-identity-quality.js';
import type { CounterpartyQualityDecision } from './counterparty-identity-quality.js';
import type { CounterpartyPeriodCoverageStatus } from './counterparty-identity-quality.js';
import type { CounterpartyResultRow } from './counterparty-identity-quality.js';

export const ANALYTICAL_CONVERSATION_STATE_VERSION = 1;

export type AnalyticalConversationState = {
  readonly version: typeof ANALYTICAL_CONVERSATION_STATE_VERSION;
  readonly semanticFamily: 'FLOW';
  readonly metric: 'REALIZED_CASH';
  readonly direction: 'INFLOW' | 'OUTFLOW';
  readonly period: AnalyticalPeriod;
  readonly dimension: 'COUNTERPARTY';
  readonly operation: AnalyticalOperationKey;
  readonly partyProfile: CounterpartyProfileRole;
  readonly limit: number | null;
  readonly rows: readonly CounterpartyResultRow[];
  readonly focusDisplayName: string | null;
  readonly decision: CounterpartyQualityDecision;
  readonly periodCoverage: CounterpartyPeriodCoverageStatus;
  readonly reasonCode: string;
};

export function parseAnalyticalConversationState(value: unknown): AnalyticalConversationState | null {
  if (value === null || value === undefined || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (record.version !== ANALYTICAL_CONVERSATION_STATE_VERSION) {
    return null;
  }
  if (record.semanticFamily !== 'FLOW' || record.metric !== 'REALIZED_CASH') {
    return null;
  }
  if (record.direction !== 'INFLOW' && record.direction !== 'OUTFLOW') {
    return null;
  }
  if (record.dimension !== 'COUNTERPARTY') {
    return null;
  }
  if (record.partyProfile !== 'CUSTOMER' && record.partyProfile !== 'SUPPLIER') {
    return null;
  }
  if (typeof record.operation !== 'string' || typeof record.reasonCode !== 'string') {
    return null;
  }
  if (record.decision !== 'AVAILABLE' && record.decision !== 'PARTIAL' && record.decision !== 'UNAVAILABLE') {
    return null;
  }
  if (
    record.periodCoverage !== 'COMPLETE' &&
    record.periodCoverage !== 'PARTIAL' &&
    record.periodCoverage !== 'UNKNOWN'
  ) {
    return null;
  }
  const period = parsePeriod(record.period);
  if (period === null) {
    return null;
  }
  if (!Array.isArray(record.rows) || record.rows.some((row) => !isRow(row))) {
    return null;
  }
  return {
    version: ANALYTICAL_CONVERSATION_STATE_VERSION,
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: record.direction,
    period,
    dimension: 'COUNTERPARTY',
    operation: record.operation as AnalyticalOperationKey,
    partyProfile: record.partyProfile,
    limit: typeof record.limit === 'number' ? record.limit : null,
    rows: record.rows as CounterpartyResultRow[],
    focusDisplayName: typeof record.focusDisplayName === 'string' ? record.focusDisplayName : null,
    decision: record.decision,
    periodCoverage: record.periodCoverage,
    reasonCode: record.reasonCode,
  };
}

export function serializeAnalyticalConversationState(
  state: AnalyticalConversationState,
): AnalyticalConversationState {
  return state;
}

function isRow(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const row = value as Record<string, unknown>;
  return (
    typeof row.rank === 'number' &&
    typeof row.displayName === 'string' &&
    typeof row.amount === 'string' &&
    typeof row.movementCount === 'number'
  );
}

function parsePeriod(value: unknown): AnalyticalPeriod | null {
  if (value === null || typeof value !== 'object') {
    return null;
  }
  const period = value as Record<string, unknown>;
  if (period.kind === 'MONTH' && typeof period.monthKey === 'string') {
    return { kind: 'MONTH', monthKey: period.monthKey };
  }
  if (period.kind === 'YEAR' && typeof period.year === 'number' && typeof period.rangeKey === 'string') {
    return {
      kind: 'YEAR',
      year: period.year,
      rangeKey: period.rangeKey,
      isPartialYear: false,
    };
  }
  if (period.kind === 'YTD' && typeof period.year === 'number' && typeof period.rangeKey === 'string') {
    const asOf = typeof period.asOf === 'string' ? new Date(period.asOf) : undefined;
    return {
      kind: 'YTD',
      year: period.year,
      rangeKey: period.rangeKey,
      ...(asOf !== undefined && !Number.isNaN(asOf.getTime()) ? { asOf } : {}),
    };
  }
  return null;
}
