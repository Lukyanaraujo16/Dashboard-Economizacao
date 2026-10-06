/**
 * Resultado analítico para o usuário.
 * Independente do status técnico do provedor em ai_runs.
 * A prosa final não entra nesta classificação.
 */
export const ANALYTICAL_OUTCOMES = [
  'ANSWERED',
  'PARTIAL',
  'CLARIFICATION_REQUIRED',
  'UNSUPPORTED',
  'NO_DATA',
  'TOOL_ERROR',
  'PROVIDER_ERROR',
] as const;

export type AnalyticalOutcome = (typeof ANALYTICAL_OUTCOMES)[number];

export const ANALYTICAL_ANSWER_SOURCES = [
  'BILLING',
  'BILLING_SERIES',
  'PLANNING',
  'DAILY_CASH_MOVEMENT',
  'COUNTERPARTY',
  'COST_CENTER',
  'NOMINAL',
  'COMPARISON',
  'SNAPSHOT',
  'CATEGORY_BREAKDOWN',
  'MOVEMENT_LINES',
  'CAPABILITY_DENIED',
  'PROVIDER',
] as const;

export type AnalyticalAnswerSource = (typeof ANALYTICAL_ANSWER_SOURCES)[number];

export const ANALYTICAL_UNRESOLVED_DIMENSIONS = ['CATEGORY', 'COST_CENTER', 'COUNTERPARTY'] as const;

export type AnalyticalUnresolvedDimension = (typeof ANALYTICAL_UNRESOLVED_DIMENSIONS)[number];

export const ANALYTICAL_TOOL_TRACE_STATUSES = [
  'SUCCESS',
  'EMPTY',
  'NOT_FOUND',
  'AMBIGUOUS',
  'UNAVAILABLE',
] as const;

export type AnalyticalToolTraceStatus = (typeof ANALYTICAL_TOOL_TRACE_STATUSES)[number];

export const ANALYTICAL_TOOL_FAILURE_REASONS = [
  'UNKNOWN_TOOL',
  'INVALID_ARGUMENTS',
  'CAPABILITY_DENIED',
  'ENTITY_NOT_FOUND',
  'ENTITY_AMBIGUOUS',
  'NO_DATA',
  'TOOL_TIMEOUT',
  'TOOL_EXECUTION_ERROR',
  'UNSUPPORTED_OPERATION',
  'UNKNOWN',
] as const;

export type AnalyticalToolFailureReason = (typeof ANALYTICAL_TOOL_FAILURE_REASONS)[number];

export type AnalyticalTraceSignal = {
  readonly status: AnalyticalToolTraceStatus;
  readonly reason: AnalyticalToolFailureReason | null;
  readonly contentStatus?: string | null;
  readonly unresolvedDimension?: AnalyticalUnresolvedDimension | null;
  readonly unresolvedEntity?: string | null;
};

export type AnalyticalTrailFacts = {
  readonly providerFailed: boolean;
  readonly capabilityDenied: boolean;
  readonly clarificationRequired: boolean;
  readonly factualClosed: boolean;
  readonly factualPartial: boolean;
  readonly structuredStatus: string | null;
  readonly traces: readonly AnalyticalTraceSignal[];
};

const POSITIVE_STATUSES = new Set(['OK', 'COMPLETE', 'AVAILABLE']);

function isToolErrorReason(reason: AnalyticalToolFailureReason | null): boolean {
  return (
    reason === 'TOOL_TIMEOUT' ||
    reason === 'TOOL_EXECUTION_ERROR' ||
    reason === 'UNKNOWN_TOOL' ||
    reason === 'INVALID_ARGUMENTS' ||
    reason === 'UNKNOWN'
  );
}

/**
 * Classifica só com sinais estruturados do pipeline.
 * Texto da resposta não é argumento e não pode ser consultado aqui.
 */
export function classifyAnalyticalOutcome(input: AnalyticalTrailFacts): AnalyticalOutcome {
  const status = input.structuredStatus;
  const traces = input.traces;
  const hasSuccess =
    traces.some((trace) => trace.status === 'SUCCESS') ||
    (status !== null && POSITIVE_STATUSES.has(status));
  const toolError = traces.some((trace) => isToolErrorReason(trace.reason));
  const ambiguous =
    input.clarificationRequired ||
    status === 'AMBIGUOUS' ||
    traces.some(
      (trace) => trace.reason === 'ENTITY_AMBIGUOUS' || trace.contentStatus === 'AMBIGUOUS',
    );
  const noData =
    status === 'EMPTY_RESULT' ||
    status === 'ABSENT' ||
    status === 'NOT_FOUND' ||
    traces.some(
      (trace) =>
        trace.reason === 'NO_DATA' ||
        trace.reason === 'ENTITY_NOT_FOUND' ||
        trace.contentStatus === 'EMPTY_RESULT' ||
        trace.contentStatus === 'ABSENT' ||
        trace.contentStatus === 'NOT_FOUND',
    );
  const unsupported =
    status === 'UNRESOLVED' ||
    status === 'INSUFFICIENT' ||
    traces.some(
      (trace) =>
        trace.reason === 'CAPABILITY_DENIED' ||
        trace.reason === 'UNSUPPORTED_OPERATION' ||
        trace.contentStatus === 'UNRESOLVED' ||
        trace.contentStatus === 'INSUFFICIENT',
    );
  const partial =
    input.factualPartial ||
    status === 'PARTIAL' ||
    traces.some((trace) => trace.contentStatus === 'PARTIAL');

  if (input.providerFailed) {
    return 'PROVIDER_ERROR';
  }
  if (input.capabilityDenied) {
    return 'UNSUPPORTED';
  }
  if (ambiguous && !hasSuccess) {
    return 'CLARIFICATION_REQUIRED';
  }
  if (toolError && hasSuccess) {
    return 'PARTIAL';
  }
  if (toolError || (status === 'UNAVAILABLE' && !hasSuccess)) {
    return 'TOOL_ERROR';
  }
  if (partial) {
    return 'PARTIAL';
  }
  if (ambiguous && hasSuccess) {
    return 'PARTIAL';
  }
  if (noData && !hasSuccess) {
    return 'NO_DATA';
  }
  if (noData && hasSuccess) {
    return 'PARTIAL';
  }
  if (unsupported && !hasSuccess) {
    return 'UNSUPPORTED';
  }
  if (
    input.factualClosed &&
    (status === null || status === 'OK' || status === 'COMPLETE' || status === 'AVAILABLE')
  ) {
    return 'ANSWERED';
  }
  if (hasSuccess) {
    return 'ANSWERED';
  }
  return 'UNSUPPORTED';
}

export function answerSourceFromIntent(
  intentKind: string | null,
  toolName: string | null,
): AnalyticalAnswerSource {
  if (intentKind === 'BILLING_MONTH') {
    return 'BILLING';
  }
  if (intentKind === 'BILLING_SERIES') {
    return 'BILLING_SERIES';
  }
  if (intentKind === 'MONTHLY_PLANNING') {
    return 'PLANNING';
  }
  if (intentKind === 'DAILY_CASH_MOVEMENT') {
    return 'DAILY_CASH_MOVEMENT';
  }
  if (intentKind === 'CATEGORY_BREAKDOWN' || toolName === 'cash_realized_breakdown') {
    return 'CATEGORY_BREAKDOWN';
  }
  if (intentKind === 'CASH_MOVEMENT_LINES' || toolName === 'cash_movement_lines') {
    return 'MOVEMENT_LINES';
  }
  if (
    intentKind === 'MONTHLY_COMPARISON' ||
    intentKind === 'MONTHLY_BILLING_WINNER' ||
    intentKind === 'COMPARISON' ||
    toolName === 'compare_cash_months'
  ) {
    return 'COMPARISON';
  }
  if (intentKind !== null && intentKind.startsWith('SNAPSHOT')) {
    return 'SNAPSHOT';
  }
  if (
    (intentKind !== null && intentKind.startsWith('COST_CENTER')) ||
    (toolName !== null && toolName.includes('cost_center'))
  ) {
    return 'COST_CENTER';
  }
  if (
    intentKind === 'RANKING_WINNER' ||
    intentKind === 'RANKING_TOPN' ||
    intentKind === 'RANKING_SHARE' ||
    intentKind === 'LOOKUP' ||
    intentKind === 'IDENTITY_AMBIGUITY' ||
    (toolName !== null && toolName.includes('nominal'))
  ) {
    return 'NOMINAL';
  }
  return 'PROVIDER';
}

export function unresolvedFromTraces(traces: readonly AnalyticalTraceSignal[]): {
  readonly dimension: AnalyticalUnresolvedDimension | null;
  readonly entity: string | null;
} | null {
  const match = traces.find(
    (trace) =>
      (trace.reason === 'ENTITY_NOT_FOUND' || trace.reason === 'ENTITY_AMBIGUOUS') &&
      (trace.unresolvedDimension != null || (trace.unresolvedEntity != null && trace.unresolvedEntity !== '')),
  );
  if (match === undefined) {
    return null;
  }
  return {
    dimension: match.unresolvedDimension ?? null,
    entity: match.unresolvedEntity ?? null,
  };
}

export function signalFromDailyStatus(status: string): Pick<
  AnalyticalTrailFacts,
  'clarificationRequired' | 'factualClosed' | 'factualPartial' | 'structuredStatus'
> {
  if (status === 'COMPLETE') {
    return {
      clarificationRequired: false,
      factualClosed: true,
      factualPartial: false,
      structuredStatus: 'OK',
    };
  }
  if (status === 'PARTIAL') {
    return {
      clarificationRequired: false,
      factualClosed: true,
      factualPartial: true,
      structuredStatus: 'PARTIAL',
    };
  }
  if (status === 'NOT_FOUND') {
    return {
      clarificationRequired: false,
      factualClosed: true,
      factualPartial: false,
      structuredStatus: 'NOT_FOUND',
    };
  }
  if (status === 'AMBIGUOUS' || status === 'CLARIFICATION') {
    return {
      clarificationRequired: true,
      factualClosed: true,
      factualPartial: false,
      structuredStatus: 'AMBIGUOUS',
    };
  }
  if (status === 'UNAVAILABLE') {
    return {
      clarificationRequired: false,
      factualClosed: true,
      factualPartial: false,
      structuredStatus: 'UNAVAILABLE',
    };
  }
  return {
    clarificationRequired: false,
    factualClosed: true,
    factualPartial: false,
    structuredStatus: 'UNRESOLVED',
  };
}

const COUNTERPARTY_ABSENCE = new Set(['EMPTY_PERIOD', 'EMPTY_TOTAL']);
const COUNTERPARTY_MISSING_ENTITY = new Set(['IDENTITY_ABSENT', 'IDENTITY_NOT_FOUND']);
const COUNTERPARTY_AMBIGUOUS = new Set(['IDENTITY_AMBIGUOUS']);
const COUNTERPARTY_UNSUPPORTED = new Set(['AMOUNT_SIGN_UNSUPPORTED']);

export function signalFromCounterparty(
  decision: string,
  reasonCode: string | null,
): Pick<
  AnalyticalTrailFacts,
  'clarificationRequired' | 'factualClosed' | 'factualPartial' | 'structuredStatus'
> {
  if (decision === 'AVAILABLE') {
    return {
      clarificationRequired: false,
      factualClosed: true,
      factualPartial: false,
      structuredStatus: 'OK',
    };
  }
  if (decision === 'PARTIAL') {
    return {
      clarificationRequired: false,
      factualClosed: true,
      factualPartial: true,
      structuredStatus: 'PARTIAL',
    };
  }
  if (reasonCode !== null && COUNTERPARTY_AMBIGUOUS.has(reasonCode)) {
    return {
      clarificationRequired: true,
      factualClosed: true,
      factualPartial: false,
      structuredStatus: 'AMBIGUOUS',
    };
  }
  if (reasonCode !== null && COUNTERPARTY_ABSENCE.has(reasonCode)) {
    return {
      clarificationRequired: false,
      factualClosed: true,
      factualPartial: false,
      structuredStatus: 'EMPTY_RESULT',
    };
  }
  if (reasonCode !== null && COUNTERPARTY_MISSING_ENTITY.has(reasonCode)) {
    return {
      clarificationRequired: false,
      factualClosed: true,
      factualPartial: false,
      structuredStatus: 'NOT_FOUND',
    };
  }
  if (reasonCode !== null && COUNTERPARTY_UNSUPPORTED.has(reasonCode)) {
    return {
      clarificationRequired: false,
      factualClosed: true,
      factualPartial: false,
      structuredStatus: 'UNRESOLVED',
    };
  }
  return {
    clarificationRequired: false,
    factualClosed: true,
    factualPartial: false,
    structuredStatus: 'UNAVAILABLE',
  };
}
