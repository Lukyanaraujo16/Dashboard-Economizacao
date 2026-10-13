/**
 * C.2.4 / C.2.7 — Dimension patch tipado sobre LastAnalyticalQuery.
 * Sem reconstruir a consulta a partir de prosa do histórico.
 */
import type { AnalyticalDirection, AnalyticalMetricKey, AnalyticalOperationKey } from './analytical/analytical-keys.js';
import type { AnalyticalPeriod } from './analytical/analytical-period.js';
import type { AnalyticalQuery } from './analytical/analytical-query.js';
import { validateAnalyticalCapability } from './analytical/validate-analytical-capability.js';
import type { LastAnalyticalQuery } from './last-analytical-query.js';
import { buildLastAnalyticalQuery } from './last-analytical-query.js';

export type AnalyticalDimensionPatch = {
  readonly period?: AnalyticalPeriod;
  readonly costCenterQuery?: string;
  readonly limit?: number;
  readonly direction?: AnalyticalDirection;
  readonly metric?: AnalyticalMetricKey;
  /** Só em continuidade composta da mesma família (ex.: MOVEMENTS). */
  readonly operation?: AnalyticalOperationKey;
};

export type ApplyAnalyticalDimensionPatchResult =
  | {
      readonly ok: true;
      readonly query: AnalyticalQuery;
      readonly capabilityKey: string;
      readonly next: LastAnalyticalQuery;
    }
  | { readonly ok: false; readonly reason: string; readonly message: string };

/**
 * Aplica patch allowlisted e revalida capability.
 * Troca de métrica só quando explícita no patch — nunca silenciosa.
 */
export function applyAnalyticalDimensionPatch(input: {
  readonly prior: LastAnalyticalQuery;
  readonly patch: AnalyticalDimensionPatch;
}): ApplyAnalyticalDimensionPatchResult {
  const patchKeys = Object.keys(input.patch).filter(
    (key) => input.patch[key as keyof AnalyticalDimensionPatch] !== undefined,
  );
  if (patchKeys.length === 0) {
    return {
      ok: false,
      reason: 'EMPTY_PATCH',
      message: 'Patch sem dimensões alteráveis.',
    };
  }

  const prior = input.prior.query;
  const metric = input.patch.metric ?? prior.metric;
  const metricChanged = input.patch.metric !== undefined && input.patch.metric !== prior.metric;

  if (metricChanged && input.patch.metric === undefined) {
    return {
      ok: false,
      reason: 'METRIC_CHANGE_FORBIDDEN',
      message: 'Troca de métrica exige solicitação explícita.',
    };
  }

  let semanticFamily = prior.semanticFamily;
  if (metric === 'BILLING') {
    semanticFamily = 'BILLING';
  } else if (metric === 'REALIZED_CASH' || metric === 'CASH_RESULT') {
    semanticFamily = 'FLOW';
  } else if (metric === 'RECEIVABLE_STOCK' || metric === 'PAYABLE_STOCK') {
    semanticFamily = 'STOCK';
  }

  let period = input.patch.period ?? prior.period;
  let direction = input.patch.direction ?? prior.direction;
  let limit = input.patch.limit ?? prior.limit;
  let operation = input.patch.operation ?? prior.operation;
  let dimension = prior.dimension;
  let filters = prior.filters;

  if (input.patch.costCenterQuery !== undefined) {
    const costCenterQuery = input.patch.costCenterQuery.trim();
    if (costCenterQuery === '' || costCenterQuery.length > 120) {
      return {
        ok: false,
        reason: 'INVALID_COST_CENTER_QUERY',
        message: 'Menção de centro de custo inválida.',
      };
    }
    filters = {
      ...(filters ?? {}),
      costCenterQuery,
    };
    if (dimension === undefined && (operation === 'LOOKUP' || operation === 'MOVEMENTS')) {
      dimension = 'COST_CENTER';
    }
  }

  // C.2.7 F — BILLING → REALIZED_CASH INFLOW via capability oficial existente.
  if (metricChanged && prior.metric === 'BILLING' && metric === 'REALIZED_CASH') {
    direction = input.patch.direction ?? 'INFLOW';
    period = toMonthPeriod(period);
    const costCenterQuery = filters?.costCenterQuery?.trim() ?? '';
    if (costCenterQuery !== '') {
      // Lookup oficial por centro (não inventa VALUE×CC).
      operation = 'LOOKUP';
      dimension = 'COST_CENTER';
      filters = { costCenterQuery };
      limit = undefined;
    } else {
      operation = 'VALUE';
      dimension = undefined;
      filters = undefined;
      limit = undefined;
    }
  }

  if (metricChanged && metric === 'CASH_RESULT') {
    direction = undefined;
    period = toMonthPeriod(period);
    operation = 'VALUE';
    dimension = undefined;
    filters = undefined;
    limit = undefined;
  }

  const nextQuery: AnalyticalQuery = {
    semanticFamily,
    metric,
    ...(direction !== undefined ? { direction } : {}),
    period,
    ...(dimension !== undefined ? { dimension } : {}),
    operation,
    ...(filters !== undefined ? { filters } : {}),
    ...(prior.identity !== undefined && !metricChanged ? { identity: prior.identity } : {}),
    ...(limit !== undefined ? { limit } : {}),
  };

  const validation = validateAnalyticalCapability(nextQuery);
  if (!validation.ok) {
    return {
      ok: false,
      reason: validation.reason,
      message: validation.message,
    };
  }

  const built = buildLastAnalyticalQuery({
    query: nextQuery,
    capabilityKey: validation.capability.key,
    executionStatus: 'OK',
  });
  if (built === null) {
    return {
      ok: false,
      reason: 'CAPABILITY_OUT_OF_COVERAGE',
      message: `Capability ${validation.capability.key} não está coberta pela continuidade.`,
    };
  }

  return {
    ok: true,
    query: nextQuery,
    capabilityKey: built.capabilityKey,
    next: built,
  };
}

/**
 * Preserva MONTH_WINDOW: ao patchar só o mês-fim, mantém `count`.
 */
export function patchPeriodMonthKey(
  prior: AnalyticalPeriod,
  monthKey: string,
): AnalyticalPeriod {
  if (prior.kind === 'MONTH_WINDOW') {
    return {
      kind: 'MONTH_WINDOW',
      endMonthKey: monthKey,
      count: prior.count,
    };
  }
  if (prior.kind === 'MONTH') {
    return { kind: 'MONTH', monthKey };
  }
  return { kind: 'MONTH', monthKey };
}

function toMonthPeriod(period: AnalyticalPeriod): AnalyticalPeriod {
  if (period.kind === 'MONTH') {
    return period;
  }
  if (period.kind === 'MONTH_WINDOW') {
    return { kind: 'MONTH', monthKey: period.endMonthKey };
  }
  return period;
}
