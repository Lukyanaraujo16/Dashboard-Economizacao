import type { AdvisorConversationalPeriodSource } from './resolve-advisor-conversational-period.js';

/**
 * Estado factual herdável da família REALIZED_CASH + OUTFLOW + MOVEMENTS + COST_CENTER.
 * Não guarda tenant, conversationId nem costCenterId interno.
 */
export const COST_CENTER_OUTFLOW_MOVEMENTS_STATE_KIND = 'COST_CENTER_OUTFLOW_MOVEMENTS' as const;
export const COST_CENTER_OUTFLOW_MOVEMENTS_STATE_VERSION = 1 as const;

export type CostCenterOutflowMovementsConversationState = {
  readonly version: typeof COST_CENTER_OUTFLOW_MOVEMENTS_STATE_VERSION;
  readonly kind: typeof COST_CENTER_OUTFLOW_MOVEMENTS_STATE_KIND;
  readonly semanticFamily: 'FLOW';
  readonly metric: 'REALIZED_CASH';
  readonly direction: 'OUTFLOW';
  readonly regime: 'REALIZED';
  readonly operation: 'MOVEMENTS';
  readonly dimension: 'COST_CENTER';
  readonly monthKey: string;
  readonly periodSource: AdvisorConversationalPeriodSource;
  readonly limit: number;
  /** Nome oficial resolvido do centro — menção textual, nunca id interno. */
  readonly costCenterQuery: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function parseCostCenterOutflowMovementsConversationState(
  value: unknown,
): CostCenterOutflowMovementsConversationState | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    'tenantId' in value ||
    'conversationId' in value ||
    'costCenterId' in value ||
    'userId' in value
  ) {
    return null;
  }
  if (
    value.version !== COST_CENTER_OUTFLOW_MOVEMENTS_STATE_VERSION ||
    value.kind !== COST_CENTER_OUTFLOW_MOVEMENTS_STATE_KIND
  ) {
    return null;
  }
  if (
    value.semanticFamily !== 'FLOW' ||
    value.metric !== 'REALIZED_CASH' ||
    value.direction !== 'OUTFLOW' ||
    value.regime !== 'REALIZED' ||
    value.operation !== 'MOVEMENTS' ||
    value.dimension !== 'COST_CENTER'
  ) {
    return null;
  }
  if (typeof value.monthKey !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.monthKey)) {
    return null;
  }
  if (typeof value.periodSource !== 'string' || value.periodSource.trim() === '') {
    return null;
  }
  if (typeof value.limit !== 'number' || !Number.isInteger(value.limit) || value.limit < 1) {
    return null;
  }
  if (typeof value.costCenterQuery !== 'string') {
    return null;
  }
  const costCenterQuery = value.costCenterQuery.trim();
  if (costCenterQuery === '' || costCenterQuery.length > 120) {
    return null;
  }
  return {
    version: COST_CENTER_OUTFLOW_MOVEMENTS_STATE_VERSION,
    kind: COST_CENTER_OUTFLOW_MOVEMENTS_STATE_KIND,
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: 'OUTFLOW',
    regime: 'REALIZED',
    operation: 'MOVEMENTS',
    dimension: 'COST_CENTER',
    monthKey: value.monthKey,
    periodSource: value.periodSource as AdvisorConversationalPeriodSource,
    limit: value.limit,
    costCenterQuery,
  };
}

export function costCenterOutflowMovementsState(input: {
  readonly monthKey: string;
  readonly periodSource: AdvisorConversationalPeriodSource;
  readonly limit: number;
  readonly costCenterQuery: string;
}): CostCenterOutflowMovementsConversationState {
  return {
    version: COST_CENTER_OUTFLOW_MOVEMENTS_STATE_VERSION,
    kind: COST_CENTER_OUTFLOW_MOVEMENTS_STATE_KIND,
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: 'OUTFLOW',
    regime: 'REALIZED',
    operation: 'MOVEMENTS',
    dimension: 'COST_CENTER',
    monthKey: input.monthKey,
    periodSource: input.periodSource,
    limit: input.limit,
    costCenterQuery: input.costCenterQuery.trim(),
  };
}
