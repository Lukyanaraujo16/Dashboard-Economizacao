import type { AdvisorCashDirection } from '../advisor-cash-realized-breakdown.js';
import type { AdvisorCashMovementSort } from '../advisor-cash-movement-lines.js';
import type { AdvisorCivilRangeKind } from '../resolve-advisor-civil-range.js';
import { ANALYTICAL_CIVIL_TIME_ZONE } from './analytical-keys.js';
import type { AnalyticalQuery } from './analytical-query.js';

export function buildCompareCashMonthsQuery(input: {
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
}): AnalyticalQuery {
  return {
    semanticFamily: 'BILLING',
    metric: 'BILLING',
    period: {
      kind: 'COMPARISON',
      left: { kind: 'MONTH', monthKey: input.comparisonMonthKey },
      right: { kind: 'MONTH', monthKey: input.monthKey },
    },
    operation: 'COMPARE',
  };
}

export function buildCashRealizedBreakdownQuery(input: {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly limit?: number;
}): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: input.direction,
    period: { kind: 'MONTH', monthKey: input.monthKey },
    dimension: 'CATEGORY',
    operation: 'BREAKDOWN',
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  };
}

export function buildCashMovementLinesQuery(input: {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly limit?: number;
}): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: input.direction,
    period: { kind: 'MONTH', monthKey: input.monthKey },
    operation: 'MOVEMENTS',
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  };
}

export function buildNominalRankingQuery(input: {
  readonly monthKey?: string;
  readonly periodKind?: AdvisorCivilRangeKind;
  readonly year?: number;
  readonly categoryReference: string;
  readonly limit?: number;
}): AnalyticalQuery {
  const limit = input.limit;
  const operation = limit === 1 ? 'RANKING_WINNER' : 'RANKING_TOPN';
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: 'INFLOW',
    period: buildCivilPeriod(input),
    dimension: 'COUNTERPARTY',
    operation,
    filters: { categoryReference: input.categoryReference },
    ...(limit !== undefined ? { limit } : {}),
  };
}

export function buildNominalLookupQuery(input: {
  readonly monthKey?: string;
  readonly periodKind?: AdvisorCivilRangeKind;
  readonly year?: number;
  readonly categoryReference?: string;
  readonly entityQuery: string;
}): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: 'INFLOW',
    period: buildCivilPeriod(input),
    dimension: 'COUNTERPARTY',
    operation: 'LOOKUP',
    ...(input.categoryReference !== undefined
      ? { filters: { categoryReference: input.categoryReference } }
      : {}),
    identity: { kind: 'QUERY', query: input.entityQuery },
  };
}

export function buildNominalCompareQuery(input: {
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
  readonly categoryReference?: string;
  readonly entityQuery?: string;
  readonly limit?: number;
}): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: 'INFLOW',
    period: {
      kind: 'COMPARISON',
      left: { kind: 'MONTH', monthKey: input.comparisonMonthKey },
      right: { kind: 'MONTH', monthKey: input.monthKey },
    },
    dimension: 'COUNTERPARTY',
    operation: 'COMPARE',
    ...(input.categoryReference !== undefined || input.entityQuery !== undefined
      ? {
          filters:
            input.categoryReference !== undefined
              ? { categoryReference: input.categoryReference }
              : undefined,
        }
      : {}),
    ...(input.entityQuery !== undefined
      ? { identity: { kind: 'QUERY' as const, query: input.entityQuery } }
      : {}),
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  };
}

export function buildCostCenterRankingQuery(input: {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly limit?: number;
}): AnalyticalQuery {
  const limit = input.limit;
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: input.direction,
    period: { kind: 'MONTH', monthKey: input.monthKey },
    dimension: 'COST_CENTER',
    operation: limit === 1 ? 'RANKING_WINNER' : 'RANKING_TOPN',
    ...(limit !== undefined ? { limit } : {}),
  };
}

export function buildCashResultCostCenterLookupQuery(input: {
  readonly monthKey: string;
  readonly costCenterQuery: string;
}): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'CASH_RESULT',
    direction: 'NET',
    period: { kind: 'MONTH', monthKey: input.monthKey },
    dimension: 'COST_CENTER',
    operation: 'LOOKUP',
    filters: { costCenterQuery: input.costCenterQuery },
  };
}

export function buildCostCenterLookupQuery(input: {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly costCenterQuery: string;
}): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: input.direction,
    period: { kind: 'MONTH', monthKey: input.monthKey },
    dimension: 'COST_CENTER',
    operation: 'LOOKUP',
    filters: { costCenterQuery: input.costCenterQuery },
  };
}

export function buildCostCenterCompareQuery(input: {
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly costCenterQuery: string;
}): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: input.direction,
    period: {
      kind: 'COMPARISON',
      left: { kind: 'MONTH', monthKey: input.comparisonMonthKey },
      right: { kind: 'MONTH', monthKey: input.monthKey },
    },
    dimension: 'COST_CENTER',
    operation: 'COMPARE',
    filters: { costCenterQuery: input.costCenterQuery },
  };
}

export function buildCostCenterMovementsQuery(input: {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly costCenterQuery: string;
  readonly limit?: number;
}): AnalyticalQuery {
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: input.direction,
    period: { kind: 'MONTH', monthKey: input.monthKey },
    dimension: 'COST_CENTER',
    operation: 'MOVEMENTS',
    filters: { costCenterQuery: input.costCenterQuery },
    ...(input.limit !== undefined ? { limit: input.limit } : {}),
  };
}

export function buildCurrentSnapshotQuery(): AnalyticalQuery {
  return {
    semanticFamily: 'STOCK',
    metric: 'RECEIVABLE_STOCK',
    period: {
      kind: 'CURRENT',
      asOf: new Date(),
      timeZone: ANALYTICAL_CIVIL_TIME_ZONE,
    },
    operation: 'VALUE',
  };
}

export function buildFinancialFactsMonthQuery(input: {
  readonly monthKey: string;
  readonly metric?: 'BILLING' | 'REALIZED_CASH' | 'CASH_RESULT';
  readonly direction?: 'INFLOW' | 'OUTFLOW' | 'NET';
}): AnalyticalQuery {
  const metric = input.metric ?? 'BILLING';
  if (metric === 'BILLING') {
    return {
      semanticFamily: 'BILLING',
      metric: 'BILLING',
      period: { kind: 'MONTH', monthKey: input.monthKey },
      operation: 'VALUE',
    };
  }
  if (metric === 'CASH_RESULT') {
    return {
      semanticFamily: 'FLOW',
      metric: 'CASH_RESULT',
      direction: 'NET',
      period: { kind: 'MONTH', monthKey: input.monthKey },
      operation: 'VALUE',
    };
  }
  return {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: input.direction === 'OUTFLOW' ? 'OUTFLOW' : 'INFLOW',
    period: { kind: 'MONTH', monthKey: input.monthKey },
    operation: 'VALUE',
  };
}

/** Exported for movement tool facade hints. */
export type MovementSortHint = AdvisorCashMovementSort;

function buildCivilPeriod(input: {
  readonly monthKey?: string;
  readonly periodKind?: AdvisorCivilRangeKind;
  readonly year?: number;
}): AnalyticalQuery['period'] {
  if (input.monthKey !== undefined) {
    return { kind: 'MONTH', monthKey: input.monthKey };
  }
  if (input.periodKind === 'YTD' && input.year !== undefined) {
    return { kind: 'YTD', year: input.year, rangeKey: `${input.year}-YTD` };
  }
  if (input.periodKind === 'YEAR' && input.year !== undefined) {
    return {
      kind: 'YEAR',
      year: input.year,
      rangeKey: String(input.year),
      isPartialYear: false,
    };
  }
  throw new Error('Período nominal inválido para AnalyticalQuery.');
}
