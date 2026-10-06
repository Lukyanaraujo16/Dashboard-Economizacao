import { Prisma } from '../../../generated/prisma/client.js';
import { ADVISOR_CASH_RESULT_MEANING } from './financial-facts-text.js';
import { foldAdvisorNominalText } from './advisor-nominal-text.js';
import { listAnalyticalCapabilities } from './analytical/analytical-capability-registry.js';
import type { AnalyticalDirection, AnalyticalMetricKey } from './analytical/analytical-keys.js';
import { validateAnalyticalCapability } from './analytical/validate-analytical-capability.js';
import {
  deriveAnalyticalToolTrace,
  type AnalyticalToolTraceDraft,
} from './derive-analytical-tool-trace.js';
import type { AnalyticalTrailFacts } from './classify-analytical-outcome.js';
import {
  resolveAnalyticalEntitiesInText,
  resolveAnalyticalEntity,
  type AnalyticalEntityRecord,
  type AnalyticalEntityResolution,
} from './resolve-analytical-entity.js';

/**
 * Comparação entre centros já resolvidos, só com capability publicada.
 * Não escolhe tenant, não gera SQL e não inventa métrica.
 */
export const COST_CENTER_ENTITY_COMPARISON_FACT_KIND = 'COST_CENTER_ENTITY_COMPARISON';

const COMPARISON_CUE =
  /\b(melhor|maior|menor|compare|comparad|comparando|comparacao|versus|vs)\b/;
const SEPARATOR = /\s+(?:ou|versus|vs\.?)\s+/iu;
const MONTH_KEY = /^\d{4}-\d{2}$/;
const OUTFLOW_CUE = /\b(saidas?|gasto|gastos|gastei|pagamentos? realizados?)\b/;
const INFLOW_CUE = /\b(entradas?|recebimentos? realizados?)\b/;
const RESULT_CUE = /\bresultado\b/;
const BILLING_CUE = /\b(faturamento|faturou|faturar)\b/;

export type CostCenterComparisonStrategy = 'HIGHER_AMOUNT' | 'LOWER_AMOUNT';

export type CostCenterEntityComparisonPeriod = {
  readonly monthKey: string;
  readonly comparison: boolean;
};

export type CostCenterEntityRef = {
  readonly id: string;
  readonly name: string;
  readonly mention: string;
};

export type CostCenterEntityLookupRequest = {
  readonly costCenterId: string;
  readonly toolName: string;
  readonly monthKey: string;
  readonly direction: 'INFLOW' | 'OUTFLOW' | 'NET';
  readonly costCenterQuery: string;
};

export type CostCenterEntityLookupResponse = {
  readonly ok: boolean;
  readonly name: string;
  readonly content: string;
  readonly resultCardinality?: number;
};

type PlanBase = {
  readonly operation: 'COMPARE_ENTITIES';
  readonly dimension: 'COST_CENTER';
  readonly entities: readonly CostCenterEntityRef[];
  readonly metric: AnalyticalMetricKey | null;
  readonly direction: AnalyticalDirection | null;
  readonly period: { readonly kind: 'MONTH'; readonly monthKey: string } | null;
  readonly capabilityKey: string | null;
  readonly toolName: string | null;
  readonly comparisonStrategy: CostCenterComparisonStrategy | null;
  readonly unresolvedMention: string | null;
  readonly lookups: readonly CostCenterEntityLookupRequest[];
};

export type CostCenterEntityComparisonPlan = PlanBase &
  (
    | { readonly status: 'READY' }
    | {
        readonly status: 'UNSUPPORTED' | 'CLARIFICATION_REQUIRED' | 'NOT_FOUND' | 'AMBIGUOUS';
        readonly reason: string;
      }
  );

export type CostCenterEntityComparisonAnswer = {
  readonly plan: CostCenterEntityComparisonPlan;
  readonly facts: Record<string, unknown>;
  readonly trail: Omit<AnalyticalTrailFacts, 'traces'>;
  readonly traces: readonly AnalyticalToolTraceDraft[];
};

export function isCostCenterEntityComparisonQuestion(content: string): boolean {
  const folded = foldAdvisorNominalText(content);
  return COMPARISON_CUE.test(folded) && content.split(SEPARATOR).length === 2;
}

export function planCostCenterEntityComparison(input: {
  readonly content: string;
  readonly period: CostCenterEntityComparisonPeriod;
  readonly catalog: readonly AnalyticalEntityRecord[];
}): CostCenterEntityComparisonPlan | null {
  if (!isCostCenterEntityComparisonQuestion(input.content)) {
    return null;
  }
  const sides = input.content.split(SEPARATOR);
  const left = sides[0];
  const right = sides[1];
  if (left === undefined || right === undefined) {
    return null;
  }
  const centers = input.catalog.filter((row) => row.dimension === 'COST_CENTER');
  const first = resolveOperand(left, centers, 'end');
  const second = resolveOperand(right, centers, 'start');
  if (first === null || second === null) {
    return null;
  }
  const operands: readonly AnalyticalEntityResolution[] = [first, second];
  if (first.status === 'NOT_FOUND' && second.status === 'NOT_FOUND') {
    return null;
  }
  const entities = operands.flatMap((item) =>
    item.status === 'RESOLVED'
      ? [{ id: item.entity.id, name: item.entity.name, mention: item.mention }]
      : [],
  );
  if (
    entities.length === 2 &&
    entities[0] !== undefined &&
    entities[1] !== undefined &&
    entities[0].id === entities[1].id
  ) {
    return null;
  }

  const folded = foldAdvisorNominalText(input.content);
  const metricChoice = resolveMetric(folded);
  const strategy = resolveStrategy(folded);
  const monthKey = MONTH_KEY.test(input.period.monthKey) ? input.period.monthKey : null;
  const period = monthKey === null ? null : { kind: 'MONTH' as const, monthKey };

  const unresolvedMention =
    operands.find((item) => item.status !== 'RESOLVED')?.mention ?? null;
  const blocked = (
    status: 'UNSUPPORTED' | 'CLARIFICATION_REQUIRED' | 'NOT_FOUND' | 'AMBIGUOUS',
    reason: string,
    capabilityKey: string | null = null,
    toolName: string | null = null,
  ): CostCenterEntityComparisonPlan => ({
    status,
    reason,
    operation: 'COMPARE_ENTITIES',
    dimension: 'COST_CENTER',
    entities,
    metric: metricChoice.metric,
    direction: metricChoice.direction,
    period,
    capabilityKey,
    toolName,
    comparisonStrategy: strategy,
    unresolvedMention: status === 'NOT_FOUND' || status === 'AMBIGUOUS' ? unresolvedMention : null,
    lookups: [],
  });

  if (input.period.comparison) {
    return blocked('UNSUPPORTED', 'PERIOD_COMPARISON_UNSUPPORTED');
  }
  const failure = operands.find((item) => item.status !== 'RESOLVED');
  if (failure?.status === 'NOT_FOUND') {
    return blocked('NOT_FOUND', 'ENTITY_NOT_FOUND');
  }
  if (failure?.status === 'AMBIGUOUS') {
    return blocked('AMBIGUOUS', 'ENTITY_AMBIGUOUS');
  }
  if (monthKey === null) {
    return blocked('CLARIFICATION_REQUIRED', 'PERIOD_REQUIRED');
  }
  if (strategy === null) {
    return blocked('CLARIFICATION_REQUIRED', 'COMPARISON_STRATEGY_REQUIRED');
  }
  if (metricChoice.kind === 'UNSPECIFIED') {
    return blocked('CLARIFICATION_REQUIRED', 'METRIC_UNSPECIFIED');
  }
  if (metricChoice.kind === 'BILLING') {
    return blocked('UNSUPPORTED', 'CAPABILITY_NOT_PUBLISHED');
  }

  const capability = findLookupCapability(metricChoice.metric, metricChoice.direction);
  if (capability === null) {
    return blocked('UNSUPPORTED', 'CAPABILITY_NOT_PUBLISHED');
  }
  const lookups = entities.map((entity) => {
    const request: CostCenterEntityLookupRequest = {
      costCenterId: entity.id,
      toolName: capability.sourceToolOrSurface,
      monthKey,
      direction: metricChoice.direction,
      costCenterQuery: entity.name,
    };
    return request;
  });
  for (const lookup of lookups) {
    const validation = validateAnalyticalCapability({
      semanticFamily: capability.semanticFamily,
      metric: capability.metric,
      direction: lookup.direction,
      period: { kind: 'MONTH', monthKey: lookup.monthKey },
      dimension: 'COST_CENTER',
      operation: 'LOOKUP',
      filters: { costCenterQuery: lookup.costCenterQuery },
    });
    if (!validation.ok || validation.capability.key !== capability.key) {
      return blocked('UNSUPPORTED', 'CAPABILITY_NOT_PUBLISHED', capability.key, capability.sourceToolOrSurface);
    }
  }

  return {
    status: 'READY',
    operation: 'COMPARE_ENTITIES',
    dimension: 'COST_CENTER',
    entities,
    metric: capability.metric,
    direction: metricChoice.direction,
    period,
    capabilityKey: capability.key,
    toolName: capability.sourceToolOrSurface,
    comparisonStrategy: strategy,
    unresolvedMention: null,
    lookups,
  };
}

export async function answerCostCenterEntityComparison(input: {
  readonly content: string;
  readonly period: CostCenterEntityComparisonPeriod;
  readonly catalog: readonly AnalyticalEntityRecord[];
  readonly lookup: (request: CostCenterEntityLookupRequest) => Promise<CostCenterEntityLookupResponse>;
}): Promise<CostCenterEntityComparisonAnswer | null> {
  const plan = planCostCenterEntityComparison(input);
  if (plan === null) {
    return null;
  }
  if (plan.status !== 'READY') {
    return {
      plan,
      facts: factsFromPlan(plan, [], plan.status === 'NOT_FOUND' ? 'NOT_FOUND' : plan.status),
      trail: trailForBlocked(plan),
      traces: tracesForBlocked(plan),
    };
  }

  const rows: Array<{ costCenterId: string; name: string; amount: string }> = [];
  const traces: AnalyticalToolTraceDraft[] = [];
  let missing = 0;
  let failed = 0;
  for (const request of plan.lookups) {
    const response = await input.lookup(request);
    traces.push(
      deriveAnalyticalToolTrace({
        name: response.name,
        content: response.content,
        round: traces.length + 1,
        resultCardinality: response.resultCardinality,
        arguments: { costCenterQuery: request.costCenterQuery },
      }),
    );
    const row = response.ok ? readMatchedRow(response.content, request) : null;
    if (row === null) {
      if (!response.ok) {
        failed += 1;
      } else {
        missing += 1;
      }
      continue;
    }
    rows.push(row);
  }

  const status = comparisonStatus(plan.lookups.length, rows.length, missing, failed);
  const ranked = status === 'OK' ? rankRows(rows, plan.comparisonStrategy) : null;
  return {
    plan,
    facts: {
      ...factsFromPlan(plan, rows, status),
      winnerCostCenterId: ranked?.winnerCostCenterId ?? null,
      tie: ranked?.tie === true,
    },
    trail: trailForExecution(status),
    traces,
  };
}

export const COST_CENTER_ENTITY_COMPARISON_MEANING = ADVISOR_CASH_RESULT_MEANING;

function resolveOperand(
  side: string,
  catalog: readonly AnalyticalEntityRecord[],
  edge: 'start' | 'end',
): AnalyticalEntityResolution | null {
  const inText = resolveAnalyticalEntitiesInText(side, catalog);
  const resolved = inText.filter((item) => item.status === 'RESOLVED');
  const ambiguous = inText.filter((item) => item.status === 'AMBIGUOUS');
  if (resolved.length > 1 || (resolved.length === 1 && ambiguous.length > 0)) {
    return {
      status: 'AMBIGUOUS',
      mention: side.trim().slice(0, 80),
      candidates: [
        ...resolved.map((item) => item.entity),
        ...ambiguous.flatMap((item) => item.candidates),
      ],
    };
  }
  if (ambiguous.length === 1 && resolved.length === 0) {
    return ambiguous[0] ?? null;
  }
  if (resolved.length === 1) {
    return resolved[0] ?? null;
  }
  const tokens = foldAdvisorNominalText(side).split(' ').filter((token) => token.length > 0);
  const boundary = edge === 'end' ? tokens[tokens.length - 1] : tokens[0];
  if (boundary !== undefined) {
    const fromBoundary = resolveAnalyticalEntity(boundary, catalog);
    if (fromBoundary.status !== 'NOT_FOUND') {
      return fromBoundary;
    }
  }
  const direct = resolveAnalyticalEntity(side.trim(), catalog);
  return side.trim() === '' ? null : direct;
}

function resolveMetric(folded: string):
  | { readonly kind: 'FLOW'; readonly metric: 'REALIZED_CASH'; readonly direction: 'INFLOW' | 'OUTFLOW' }
  | { readonly kind: 'CASH_RESULT'; readonly metric: 'CASH_RESULT'; readonly direction: 'NET' }
  | { readonly kind: 'BILLING'; readonly metric: 'BILLING'; readonly direction: null }
  | { readonly kind: 'UNSPECIFIED'; readonly metric: null; readonly direction: null } {
  const result = RESULT_CUE.test(folded);
  const billing = BILLING_CUE.test(folded);
  const outflow = OUTFLOW_CUE.test(folded);
  const inflow = INFLOW_CUE.test(folded);
  const selected = [result, billing, outflow, inflow].filter(Boolean).length;
  if (selected !== 1) {
    return { kind: 'UNSPECIFIED', metric: null, direction: null };
  }
  if (result) {
    return { kind: 'CASH_RESULT', metric: 'CASH_RESULT', direction: 'NET' };
  }
  if (billing) {
    return { kind: 'BILLING', metric: 'BILLING', direction: null };
  }
  if (outflow) {
    return { kind: 'FLOW', metric: 'REALIZED_CASH', direction: 'OUTFLOW' };
  }
  return { kind: 'FLOW', metric: 'REALIZED_CASH', direction: 'INFLOW' };
}

function resolveStrategy(folded: string): CostCenterComparisonStrategy | null {
  const higher = /\b(melhor|maior|mais)\b/.test(folded);
  const lower = /\b(menor|menos)\b/.test(folded);
  if (higher === lower) {
    return null;
  }
  return higher ? 'HIGHER_AMOUNT' : 'LOWER_AMOUNT';
}

function findLookupCapability(
  metric: 'REALIZED_CASH' | 'CASH_RESULT',
  direction: 'INFLOW' | 'OUTFLOW' | 'NET',
) {
  const matches = listAnalyticalCapabilities().filter(
    (item) =>
      item.metric === metric &&
      item.dimensions.includes('COST_CENTER') &&
      item.operations.includes('LOOKUP') &&
      item.periodKinds.includes('MONTH') &&
      item.requiredFilters.includes('costCenterQuery') &&
      item.directions?.includes(direction) === true,
  );
  return matches.length === 1 ? (matches[0] ?? null) : null;
}

function factsFromPlan(
  plan: CostCenterEntityComparisonPlan,
  rows: readonly { costCenterId: string; name: string; amount: string }[],
  status: string,
): Record<string, unknown> {
  return {
    factKind: COST_CENTER_ENTITY_COMPARISON_FACT_KIND,
    status,
    reason: plan.status === 'READY' ? null : plan.reason,
    operation: plan.operation,
    dimension: plan.dimension,
    metric: plan.metric,
    direction: plan.direction,
    monthKey: plan.period?.monthKey ?? null,
    comparisonStrategy: plan.comparisonStrategy,
    capabilityKey: plan.capabilityKey,
    rows,
    winnerCostCenterId: null,
    tie: false,
  };
}

function trailForBlocked(plan: CostCenterEntityComparisonPlan): Omit<AnalyticalTrailFacts, 'traces'> {
  return {
    providerFailed: false,
    capabilityDenied: plan.status === 'UNSUPPORTED',
    clarificationRequired: plan.status === 'CLARIFICATION_REQUIRED' || plan.status === 'AMBIGUOUS',
    factualClosed: true,
    factualPartial: false,
    structuredStatus:
      plan.status === 'NOT_FOUND'
        ? 'NOT_FOUND'
        : plan.status === 'AMBIGUOUS' || plan.status === 'CLARIFICATION_REQUIRED'
          ? 'AMBIGUOUS'
          : 'UNRESOLVED',
  };
}

function tracesForBlocked(plan: CostCenterEntityComparisonPlan): readonly AnalyticalToolTraceDraft[] {
  if (plan.status !== 'NOT_FOUND' && plan.status !== 'AMBIGUOUS') {
    return [];
  }
  return [
    {
      round: 0,
      toolName: 'cash_cost_center_lookup',
      known: true,
      status: plan.status === 'NOT_FOUND' ? 'NOT_FOUND' : 'AMBIGUOUS',
      reason: plan.status === 'NOT_FOUND' ? 'ENTITY_NOT_FOUND' : 'ENTITY_AMBIGUOUS',
      durationMs: null,
      resultCardinality: 0,
      contentStatus: plan.status,
      unresolvedDimension: 'COST_CENTER',
      unresolvedEntity: (plan.unresolvedMention ?? plan.reason).slice(0, 80),
    },
  ];
}

function trailForExecution(status: string): Omit<AnalyticalTrailFacts, 'traces'> {
  return {
    providerFailed: false,
    capabilityDenied: false,
    clarificationRequired: false,
    factualClosed: status === 'OK',
    factualPartial: status === 'PARTIAL',
    structuredStatus:
      status === 'OK' ? 'OK' : status === 'PARTIAL' ? 'PARTIAL' : status === 'UNAVAILABLE' ? 'UNAVAILABLE' : 'EMPTY_RESULT',
  };
}

function comparisonStatus(
  expected: number,
  found: number,
  missing: number,
  failed: number,
): 'OK' | 'PARTIAL' | 'EMPTY_RESULT' | 'UNAVAILABLE' {
  if (failed === expected) {
    return 'UNAVAILABLE';
  }
  if (found === expected && missing === 0 && failed === 0) {
    return 'OK';
  }
  if (found === 0) {
    return failed > 0 ? 'PARTIAL' : 'EMPTY_RESULT';
  }
  return 'PARTIAL';
}

function readMatchedRow(
  content: string,
  request: CostCenterEntityLookupRequest,
): { costCenterId: string; name: string; amount: string } | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    return null;
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return null;
  }
  const record = parsed as Record<string, unknown>;
  if (record.status !== 'OK') {
    return null;
  }
  const center = record.costCenter;
  if (center === null || typeof center !== 'object' || Array.isArray(center)) {
    return null;
  }
  const row = center as Record<string, unknown>;
  if (row.costCenterId !== request.costCenterId || typeof row.name !== 'string') {
    return null;
  }
  if (typeof row.amount !== 'string' || !isDecimal(row.amount)) {
    return null;
  }
  return { costCenterId: request.costCenterId, name: row.name, amount: row.amount };
}

function rankRows(
  rows: readonly { costCenterId: string; name: string; amount: string }[],
  strategy: CostCenterComparisonStrategy | null,
): { winnerCostCenterId: string | null; tie: boolean } | null {
  if (strategy === null || rows.length < 2) {
    return null;
  }
  const first = rows[0];
  const second = rows[1];
  if (first === undefined || second === undefined) {
    return null;
  }
  const compared = new Prisma.Decimal(first.amount).comparedTo(second.amount);
  if (compared === 0) {
    return { winnerCostCenterId: null, tie: true };
  }
  const higher = compared > 0 ? first : second;
  const lower = compared > 0 ? second : first;
  const winner = strategy === 'HIGHER_AMOUNT' ? higher : lower;
  return { winnerCostCenterId: winner.costCenterId, tie: false };
}

function isDecimal(value: string): boolean {
  return /^-?\d+(\.\d+)?$/.test(value);
}
