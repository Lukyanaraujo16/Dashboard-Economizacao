/**
 * Constrói LastAnalyticalQuery a partir de respostas determinísticas cobertas.
 */
import {
  buildBillingCostCenterMonthQuery,
  buildBillingCostCenterSeriesQuery,
  buildCostCenterMovementsQuery,
  buildCostCenterMovementsWindowQuery,
} from './analytical/build-analytical-query-from-tool.js';
import type { AnalyticalQuery } from './analytical/analytical-query.js';
import {
  buildLastAnalyticalQuery,
  type LastAnalyticalQuery,
} from './last-analytical-query.js';

export function lastAnalyticalQueryFromBilling(input: {
  readonly capabilityKey: string;
  readonly monthKey: string;
  readonly count?: number;
  readonly costCenterQuery?: string;
  readonly structuredStatus?: string;
}): LastAnalyticalQuery | null {
  const status = input.structuredStatus ?? 'OK';
  let query: AnalyticalQuery;
  if (input.capabilityKey === 'billing.value.month') {
    query = {
      semanticFamily: 'BILLING',
      metric: 'BILLING',
      period: { kind: 'MONTH', monthKey: input.monthKey },
      operation: 'VALUE',
    };
  } else if (input.capabilityKey === 'billing.series.months') {
    query = {
      semanticFamily: 'BILLING',
      metric: 'BILLING',
      period: {
        kind: 'MONTH_WINDOW',
        endMonthKey: input.monthKey,
        count: input.count ?? 3,
      },
      operation: 'VALUE',
    };
  } else if (
    input.capabilityKey === 'billing.cost_center.month' &&
    input.costCenterQuery !== undefined
  ) {
    query = buildBillingCostCenterMonthQuery({
      monthKey: input.monthKey,
      costCenterQuery: input.costCenterQuery,
    });
  } else if (
    input.capabilityKey === 'billing.cost_center.series.months' &&
    input.costCenterQuery !== undefined
  ) {
    query = buildBillingCostCenterSeriesQuery({
      endMonthKey: input.monthKey,
      count: input.count ?? 3,
      costCenterQuery: input.costCenterQuery,
    });
  } else {
    return null;
  }
  return buildLastAnalyticalQuery({
    query,
    capabilityKey: input.capabilityKey,
    executionStatus: status,
  });
}

export function lastAnalyticalQueryFromCostCenterMovements(input: {
  readonly monthKey: string;
  readonly costCenterQuery: string;
  readonly limit: number;
  readonly direction?: 'INFLOW' | 'OUTFLOW';
  readonly structuredStatus?: string;
  /** Janela de meses terminando em `monthKey` (capability window.movements). */
  readonly windowMonths?: number;
}): LastAnalyticalQuery | null {
  if (input.windowMonths !== undefined) {
    return buildLastAnalyticalQuery({
      query: buildCostCenterMovementsWindowQuery({
        endMonthKey: input.monthKey,
        count: input.windowMonths,
        costCenterQuery: input.costCenterQuery,
        limit: input.limit,
      }),
      capabilityKey: 'realized_cash.cost_center.window.movements',
      executionStatus: input.structuredStatus ?? 'OK',
    });
  }
  const query = buildCostCenterMovementsQuery({
    monthKey: input.monthKey,
    direction: input.direction ?? 'OUTFLOW',
    costCenterQuery: input.costCenterQuery,
    limit: input.limit,
  });
  return buildLastAnalyticalQuery({
    query,
    capabilityKey: 'realized_cash.cost_center.month.movements',
    executionStatus: input.structuredStatus ?? 'OK',
  });
}
