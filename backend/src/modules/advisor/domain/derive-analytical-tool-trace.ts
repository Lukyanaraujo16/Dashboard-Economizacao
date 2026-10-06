import type {
  AnalyticalToolFailureReason,
  AnalyticalToolTraceStatus,
  AnalyticalUnresolvedDimension,
} from './classify-analytical-outcome.js';

const ENTITY_ARGUMENT_KEYS = ['costCenterQuery', 'entityQuery', 'categoryReference', 'partyQuery'] as const;
const CARDINALITY_KEYS = ['returnedCount', 'resultCardinality', 'count'] as const;
const MAX_ENTITY_CHARS = 80;
const MAX_TOOL_NAME_CHARS = 80;

export type AnalyticalToolTraceDraft = {
  readonly round: number;
  readonly toolName: string;
  readonly known: boolean;
  readonly status: AnalyticalToolTraceStatus;
  readonly reason: AnalyticalToolFailureReason | null;
  readonly durationMs: number | null;
  readonly resultCardinality: number | null;
  readonly contentStatus: string | null;
  readonly unresolvedDimension: AnalyticalUnresolvedDimension | null;
  readonly unresolvedEntity: string | null;
};

function readRecord(content: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(content) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return null;
    }
    return parsed as Record<string, unknown>;
  } catch {
    return null;
  }
}

function clipEntity(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  return trimmed.slice(0, MAX_ENTITY_CHARS);
}

function dimensionFromTool(name: string): AnalyticalUnresolvedDimension | null {
  if (name.includes('cost_center')) {
    return 'COST_CENTER';
  }
  if (name.includes('nominal')) {
    return 'COUNTERPARTY';
  }
  if (name.includes('breakdown') || name.includes('category')) {
    return 'CATEGORY';
  }
  return null;
}

function entityFromArguments(args: Record<string, unknown> | undefined): string | null {
  if (args === undefined) {
    return null;
  }
  for (const key of ENTITY_ARGUMENT_KEYS) {
    const clipped = clipEntity(args[key]);
    if (clipped !== null) {
      return clipped;
    }
  }
  return null;
}

function readCardinality(
  parsed: Record<string, unknown> | null,
  fallback: number | undefined,
): number | null {
  if (typeof fallback === 'number' && Number.isInteger(fallback) && fallback >= 0 && fallback < 1_000_000) {
    return fallback;
  }
  if (parsed === null) {
    return null;
  }
  for (const key of CARDINALITY_KEYS) {
    const value = parsed[key];
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < 1_000_000) {
      return value;
    }
  }
  if (Array.isArray(parsed.rows)) {
    return parsed.rows.length;
  }
  if (Array.isArray(parsed.lines)) {
    return parsed.lines.length;
  }
  return null;
}

function reasonFromUnavailable(
  code: string | null,
  message: string,
): AnalyticalToolFailureReason {
  if (message.toLowerCase().includes('tempo limite')) {
    return 'TOOL_TIMEOUT';
  }
  if (code === 'ANALYTICAL_TOOL_UNKNOWN') {
    return 'UNKNOWN_TOOL';
  }
  if (code === 'ANALYTICAL_TOOL_INVALID_INPUT' && /capability/i.test(message)) {
    return 'CAPABILITY_DENIED';
  }
  if (code === 'ANALYTICAL_TOOL_INVALID_INPUT') {
    return 'INVALID_ARGUMENTS';
  }
  if (code === 'ANALYTICAL_TOOL_FAILED') {
    return 'TOOL_EXECUTION_ERROR';
  }
  return 'UNKNOWN';
}

function mapContentStatus(status: string | null, code: string | null, message: string): {
  readonly status: AnalyticalToolTraceStatus;
  readonly reason: AnalyticalToolFailureReason | null;
} {
  if (status === 'OK' || status === 'COMPLETE' || status === 'AVAILABLE' || status === 'PARTIAL') {
    return { status: 'SUCCESS', reason: null };
  }
  if (status === 'EMPTY_RESULT' || status === 'ABSENT') {
    return { status: 'EMPTY', reason: 'NO_DATA' };
  }
  if (status === 'NOT_FOUND') {
    return { status: 'NOT_FOUND', reason: 'ENTITY_NOT_FOUND' };
  }
  if (status === 'AMBIGUOUS') {
    return { status: 'AMBIGUOUS', reason: 'ENTITY_AMBIGUOUS' };
  }
  if (status === 'UNRESOLVED' || status === 'INSUFFICIENT') {
    return { status: 'UNAVAILABLE', reason: 'UNSUPPORTED_OPERATION' };
  }
  if (status === 'REPEATED_IDENTICAL_CALL' || code === 'IDENTICAL_TOOL_CALL') {
    return { status: 'UNAVAILABLE', reason: 'UNSUPPORTED_OPERATION' };
  }
  if (status === 'MISSING_REQUIRED_SCOPE' || code === 'IDENTICAL_SCOPE_OMITTED' || code === 'SCOPE_REQUIRES_ENTITY_TOOL') {
    return { status: 'UNAVAILABLE', reason: 'INVALID_ARGUMENTS' };
  }
  return { status: 'UNAVAILABLE', reason: reasonFromUnavailable(code, message) };
}

/**
 * Lê o JSON que a tool já devolve ao modelo e produz um rastro sem o payload.
 * O conteúdo enviado ao modelo permanece o mesmo.
 */
export function deriveAnalyticalToolTrace(input: {
  readonly name: string;
  readonly content: string;
  readonly durationMs?: number | null;
  readonly round: number;
  readonly resultCardinality?: number;
  readonly arguments?: Record<string, unknown>;
}): AnalyticalToolTraceDraft {
  const parsed = readRecord(input.content);
  const contentStatus = typeof parsed?.status === 'string' ? parsed.status : null;
  const code = typeof parsed?.code === 'string' ? parsed.code : null;
  const message = typeof parsed?.message === 'string' ? parsed.message : '';
  const mapped = mapContentStatus(contentStatus, code, message);
  const entityReason = mapped.reason === 'ENTITY_NOT_FOUND' || mapped.reason === 'ENTITY_AMBIGUOUS';
  const duration =
    typeof input.durationMs === 'number' && Number.isFinite(input.durationMs) && input.durationMs >= 0
      ? Math.round(input.durationMs)
      : null;
  return {
    round: input.round,
    toolName: input.name.trim().slice(0, MAX_TOOL_NAME_CHARS),
    known: code !== 'ANALYTICAL_TOOL_UNKNOWN',
    status: mapped.status,
    reason: mapped.reason,
    durationMs: duration,
    resultCardinality: readCardinality(parsed, input.resultCardinality),
    contentStatus,
    unresolvedDimension: entityReason ? dimensionFromTool(input.name) : null,
    unresolvedEntity: entityReason ? entityFromArguments(input.arguments) : null,
  };
}

export function readStructuredStatus(content: string | null): string | null {
  if (content === null) {
    return null;
  }
  const parsed = readRecord(content);
  return typeof parsed?.status === 'string' ? parsed.status : null;
}
