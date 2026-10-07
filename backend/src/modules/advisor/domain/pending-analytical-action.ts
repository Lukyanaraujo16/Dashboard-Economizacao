/**
 * Ação analítica pendente oferecida pelo assistant (Fase B.1).
 * Contrato operacional allowlisted — não é prosa, CoT nem SQL.
 */

export const PENDING_ANALYTICAL_ACTION_KIND = 'PENDING_ANALYTICAL_ACTION' as const;
export const PENDING_ANALYTICAL_ACTION_VERSION = 1 as const;

/** Validade curta: evita stale após mudança de assunto. */
export const PENDING_ANALYTICAL_ACTION_TTL_MS = 30 * 60 * 1000;

export const PENDING_ANALYTICAL_DOMAINS = ['PAYABLE', 'REALIZED_CASH', 'SNAPSHOT'] as const;
export type PendingAnalyticalDomain = (typeof PENDING_ANALYTICAL_DOMAINS)[number];

export const PENDING_ANALYTICAL_OPERATIONS = [
  'RANKING_TOPN',
  'MOVEMENTS',
  'VALUE',
  'LOOKUP',
  'CURRENT_POSITION',
] as const;
export type PendingAnalyticalOperation = (typeof PENDING_ANALYTICAL_OPERATIONS)[number];

export const PENDING_ANALYTICAL_STATUSES = [
  'PENDING',
  'CONSUMED',
  'REJECTED',
  'EXPIRED',
] as const;
export type PendingAnalyticalStatus = (typeof PENDING_ANALYTICAL_STATUSES)[number];

export const PENDING_ALLOWED_TOOLS = [
  'payable_titles',
  'cash_movement_lines',
  'cash_realized_breakdown',
  'cash_cost_center_movement_lines',
] as const;
export type PendingAllowedTool = (typeof PENDING_ALLOWED_TOOLS)[number];

export const PENDING_PAYABLE_STATUSES = ['OPEN', 'PAID', 'OVERDUE', 'ALL'] as const;
export const PENDING_ORDERINGS = ['VALUE_DESC', 'DUE_DATE_ASC'] as const;
export const PENDING_DIRECTIONS = ['INFLOW', 'OUTFLOW'] as const;

export type PendingAnalyticalFilters = {
  readonly monthKey?: string;
  readonly status?: (typeof PENDING_PAYABLE_STATUSES)[number];
  readonly ordering?: (typeof PENDING_ORDERINGS)[number];
  readonly limit?: number;
  readonly costCenterQuery?: string;
  readonly direction?: (typeof PENDING_DIRECTIONS)[number];
};

export type PendingAnalyticalStep = {
  readonly toolName: PendingAllowedTool | null;
  readonly filters: PendingAnalyticalFilters;
};

export type PendingAnalyticalAction = {
  readonly version: typeof PENDING_ANALYTICAL_ACTION_VERSION;
  readonly kind: typeof PENDING_ANALYTICAL_ACTION_KIND;
  readonly id: string;
  readonly createdAt: string;
  readonly expiresAt: string;
  readonly createdFromMessageId: string;
  readonly domain: PendingAnalyticalDomain;
  readonly operation: PendingAnalyticalOperation;
  readonly steps: readonly PendingAnalyticalStep[];
  readonly objective: string;
  readonly offerSnippet: string;
  readonly status: PendingAnalyticalStatus;
};

export type PendingAnalyticalPatch = {
  readonly monthKey?: string;
  readonly status?: (typeof PENDING_PAYABLE_STATUSES)[number];
  readonly ordering?: (typeof PENDING_ORDERINGS)[number];
  readonly limit?: number;
  readonly costCenterQuery?: string;
  readonly direction?: (typeof PENDING_DIRECTIONS)[number];
};

export const PENDING_RESOLUTION_DECISIONS = [
  'ACCEPT',
  'REJECT',
  'MODIFY',
  'UNRELATED',
] as const;
export type PendingResolutionDecision = (typeof PENDING_RESOLUTION_DECISIONS)[number];

export type PendingResolutionResult = {
  readonly decision: PendingResolutionDecision;
  readonly patch: PendingAnalyticalPatch | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function isPendingAllowedTool(value: string): value is PendingAllowedTool {
  return (PENDING_ALLOWED_TOOLS as readonly string[]).includes(value);
}

export function isPendingAnalyticalDomain(value: string): value is PendingAnalyticalDomain {
  return (PENDING_ANALYTICAL_DOMAINS as readonly string[]).includes(value);
}

export function isPendingAnalyticalOperation(value: string): value is PendingAnalyticalOperation {
  return (PENDING_ANALYTICAL_OPERATIONS as readonly string[]).includes(value);
}

export function parsePendingAnalyticalAction(value: unknown): PendingAnalyticalAction | null {
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
    value.version !== PENDING_ANALYTICAL_ACTION_VERSION ||
    value.kind !== PENDING_ANALYTICAL_ACTION_KIND
  ) {
    return null;
  }
  if (typeof value.id !== 'string' || value.id.trim() === '' || value.id.length > 80) {
    return null;
  }
  if (typeof value.createdAt !== 'string' || typeof value.expiresAt !== 'string') {
    return null;
  }
  if (
    typeof value.createdFromMessageId !== 'string' ||
    value.createdFromMessageId.trim() === ''
  ) {
    return null;
  }
  if (
    typeof value.domain !== 'string' ||
    !isPendingAnalyticalDomain(value.domain) ||
    typeof value.operation !== 'string' ||
    !isPendingAnalyticalOperation(value.operation)
  ) {
    return null;
  }
  if (typeof value.objective !== 'string' || value.objective.trim() === '') {
    return null;
  }
  if (value.objective.length > 200) {
    return null;
  }
  if (typeof value.offerSnippet !== 'string' || value.offerSnippet.length > 400) {
    return null;
  }
  if (
    typeof value.status !== 'string' ||
    !(PENDING_ANALYTICAL_STATUSES as readonly string[]).includes(value.status)
  ) {
    return null;
  }
  if (!Array.isArray(value.steps) || value.steps.length === 0 || value.steps.length > 3) {
    return null;
  }
  const steps: PendingAnalyticalStep[] = [];
  for (const raw of value.steps) {
    const step = parseStep(raw);
    if (step === null) {
      return null;
    }
    steps.push(step);
  }
  if (!isCapabilityCompatible(value.domain, value.operation, steps)) {
    return null;
  }
  return {
    version: PENDING_ANALYTICAL_ACTION_VERSION,
    kind: PENDING_ANALYTICAL_ACTION_KIND,
    id: value.id.trim(),
    createdAt: value.createdAt,
    expiresAt: value.expiresAt,
    createdFromMessageId: value.createdFromMessageId.trim(),
    domain: value.domain,
    operation: value.operation,
    steps,
    objective: value.objective.trim(),
    offerSnippet: value.offerSnippet.trim(),
    status: value.status as PendingAnalyticalStatus,
  };
}

function parseStep(value: unknown): PendingAnalyticalStep | null {
  if (!isRecord(value)) {
    return null;
  }
  let toolName: PendingAllowedTool | null;
  if (value.toolName === null) {
    toolName = null;
  } else if (typeof value.toolName === 'string' && isPendingAllowedTool(value.toolName)) {
    toolName = value.toolName;
  } else {
    return null;
  }
  const filters = parseFilters(value.filters);
  if (filters === null) {
    return null;
  }
  return { toolName, filters };
}

function parseFilters(value: unknown): PendingAnalyticalFilters | null {
  if (value === undefined) {
    return {};
  }
  if (!isRecord(value)) {
    return null;
  }
  if (
    'tenantId' in value ||
    'costCenterId' in value ||
    'userId' in value ||
    'toolName' in value ||
    'capability' in value
  ) {
    return null;
  }
  const filters: {
    monthKey?: string;
    status?: (typeof PENDING_PAYABLE_STATUSES)[number];
    ordering?: (typeof PENDING_ORDERINGS)[number];
    limit?: number;
    costCenterQuery?: string;
    direction?: (typeof PENDING_DIRECTIONS)[number];
  } = {};
  if (value.monthKey !== undefined) {
    if (typeof value.monthKey !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value.monthKey)) {
      return null;
    }
    filters.monthKey = value.monthKey;
  }
  if (value.status !== undefined) {
    if (
      typeof value.status !== 'string' ||
      !(PENDING_PAYABLE_STATUSES as readonly string[]).includes(value.status)
    ) {
      return null;
    }
    filters.status = value.status as (typeof PENDING_PAYABLE_STATUSES)[number];
  }
  if (value.ordering !== undefined) {
    if (
      typeof value.ordering !== 'string' ||
      !(PENDING_ORDERINGS as readonly string[]).includes(value.ordering)
    ) {
      return null;
    }
    filters.ordering = value.ordering as (typeof PENDING_ORDERINGS)[number];
  }
  if (value.limit !== undefined) {
    if (typeof value.limit !== 'number' || !Number.isInteger(value.limit) || value.limit < 1 || value.limit > 20) {
      return null;
    }
    filters.limit = value.limit;
  }
  if (value.costCenterQuery !== undefined) {
    if (typeof value.costCenterQuery !== 'string') {
      return null;
    }
    const trimmed = value.costCenterQuery.trim();
    if (trimmed === '' || trimmed.length > 80) {
      return null;
    }
    filters.costCenterQuery = trimmed;
  }
  if (value.direction !== undefined) {
    if (
      typeof value.direction !== 'string' ||
      !(PENDING_DIRECTIONS as readonly string[]).includes(value.direction)
    ) {
      return null;
    }
    filters.direction = value.direction as (typeof PENDING_DIRECTIONS)[number];
  }
  return filters;
}

export function isCapabilityCompatible(
  domain: PendingAnalyticalDomain,
  operation: PendingAnalyticalOperation,
  steps: readonly PendingAnalyticalStep[],
): boolean {
  if (domain === 'PAYABLE') {
    if (operation !== 'RANKING_TOPN' && operation !== 'MOVEMENTS' && operation !== 'LOOKUP') {
      return false;
    }
    return steps.every((step) => step.toolName === 'payable_titles');
  }
  if (domain === 'REALIZED_CASH') {
    if (operation !== 'MOVEMENTS' && operation !== 'VALUE' && operation !== 'RANKING_TOPN') {
      return false;
    }
    return steps.every(
      (step) =>
        step.toolName === 'cash_movement_lines' ||
        step.toolName === 'cash_realized_breakdown' ||
        step.toolName === 'cash_cost_center_movement_lines',
    );
  }
  if (domain === 'SNAPSHOT') {
    if (operation !== 'CURRENT_POSITION' && operation !== 'VALUE') {
      return false;
    }
    // SNAPSHOT: preload (toolName null) e/ou tools allowlisted (caixa+vencidos composto).
    if (steps.length === 0 || steps.length > 3) {
      return false;
    }
    return steps.every(
      (step) =>
        step.toolName === null ||
        step.toolName === 'payable_titles' ||
        step.toolName === 'cash_movement_lines' ||
        step.toolName === 'cash_realized_breakdown',
    );
  }
  return false;
}

/** True se algum step depende de FINANCIAL_FACTS / CURRENT_SNAPSHOT (toolName null). */
export function pendingActionHasSnapshotPreloadStep(
  action: PendingAnalyticalAction,
): boolean {
  return action.steps.some((step) => step.toolName === null);
}

export function createPendingAnalyticalAction(input: {
  readonly id: string;
  readonly createdFromMessageId: string;
  readonly domain: PendingAnalyticalDomain;
  readonly operation: PendingAnalyticalOperation;
  readonly steps: readonly PendingAnalyticalStep[];
  readonly objective: string;
  readonly offerSnippet: string;
  readonly now?: Date;
  readonly ttlMs?: number;
}): PendingAnalyticalAction | null {
  const now = input.now ?? new Date();
  const ttl = input.ttlMs ?? PENDING_ANALYTICAL_ACTION_TTL_MS;
  const draft: PendingAnalyticalAction = {
    version: PENDING_ANALYTICAL_ACTION_VERSION,
    kind: PENDING_ANALYTICAL_ACTION_KIND,
    id: input.id.trim(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + ttl).toISOString(),
    createdFromMessageId: input.createdFromMessageId.trim(),
    domain: input.domain,
    operation: input.operation,
    steps: input.steps,
    objective: input.objective.trim().slice(0, 200),
    offerSnippet: input.offerSnippet.trim().slice(0, 400),
    status: 'PENDING',
  };
  return parsePendingAnalyticalAction(draft);
}

export function isPendingActionExecutable(
  action: PendingAnalyticalAction,
  now: Date = new Date(),
): { readonly ok: true } | { readonly ok: false; readonly reason: 'EXPIRED' | 'NOT_PENDING' } {
  if (action.status !== 'PENDING') {
    return { ok: false, reason: 'NOT_PENDING' };
  }
  const expires = Date.parse(action.expiresAt);
  if (!Number.isFinite(expires) || expires <= now.getTime()) {
    return { ok: false, reason: 'EXPIRED' };
  }
  return { ok: true };
}

export function markPendingConsumed(action: PendingAnalyticalAction): PendingAnalyticalAction {
  return { ...action, status: 'CONSUMED' };
}

export function markPendingRejected(action: PendingAnalyticalAction): PendingAnalyticalAction {
  return { ...action, status: 'REJECTED' };
}

export function markPendingExpired(action: PendingAnalyticalAction): PendingAnalyticalAction {
  return { ...action, status: 'EXPIRED' };
}

export function applyPendingPatch(
  action: PendingAnalyticalAction,
  patch: PendingAnalyticalPatch | null,
): PendingAnalyticalAction | null {
  if (patch === null) {
    return action;
  }
  const forbidden = Object.keys(patch).some(
    (key) =>
      key === 'tenantId' ||
      key === 'costCenterId' ||
      key === 'userId' ||
      key === 'toolName' ||
      key === 'domain' ||
      key === 'operation' ||
      key === 'capability',
  );
  if (forbidden) {
    return null;
  }
  const nextSteps = action.steps.map((step) => ({
    toolName: step.toolName,
    filters: {
      ...step.filters,
      ...(patch.monthKey !== undefined ? { monthKey: patch.monthKey } : {}),
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.ordering !== undefined ? { ordering: patch.ordering } : {}),
      ...(patch.limit !== undefined ? { limit: patch.limit } : {}),
      ...(patch.costCenterQuery !== undefined ? { costCenterQuery: patch.costCenterQuery } : {}),
      ...(patch.direction !== undefined ? { direction: patch.direction } : {}),
    },
  }));
  return parsePendingAnalyticalAction({
    ...action,
    steps: nextSteps,
  });
}

export function parsePendingResolutionResult(value: unknown): PendingResolutionResult | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    typeof value.decision !== 'string' ||
    !(PENDING_RESOLUTION_DECISIONS as readonly string[]).includes(value.decision)
  ) {
    return null;
  }
  if (value.decision === 'MODIFY') {
    const patch = parseFilters(value.patch ?? {});
    if (patch === null) {
      return null;
    }
    // MODIFY exige ao menos um campo de patch.
    if (Object.keys(patch).length === 0) {
      return null;
    }
    return { decision: 'MODIFY', patch };
  }
  if (value.patch !== undefined && value.patch !== null) {
    return null;
  }
  return {
    decision: value.decision as Exclude<PendingResolutionDecision, 'MODIFY'>,
    patch: null,
  };
}

export function buildToolArgumentsFromPendingStep(
  step: PendingAnalyticalStep,
  fallbackMonthKey: string,
): Record<string, unknown> | null {
  if (step.toolName === null) {
    return null;
  }
  const monthKey = step.filters.monthKey ?? fallbackMonthKey;
  if (step.toolName === 'payable_titles') {
    return {
      monthKey,
      status: step.filters.status ?? 'OPEN',
      ordering: step.filters.ordering ?? 'VALUE_DESC',
      limit: step.filters.limit ?? 5,
      ...(step.filters.costCenterQuery !== undefined
        ? { costCenterQuery: step.filters.costCenterQuery }
        : {}),
    };
  }
  if (step.toolName === 'cash_movement_lines') {
    return {
      monthKey,
      direction: step.filters.direction ?? 'OUTFLOW',
      sort: 'AMOUNT_DESC',
      limit: step.filters.limit ?? 5,
    };
  }
  if (step.toolName === 'cash_realized_breakdown') {
    return {
      monthKey,
      direction: step.filters.direction ?? 'OUTFLOW',
      limit: step.filters.limit ?? 5,
      ...(step.filters.costCenterQuery !== undefined
        ? { costCenterQuery: step.filters.costCenterQuery }
        : {}),
    };
  }
  if (step.toolName === 'cash_cost_center_movement_lines') {
    if (step.filters.costCenterQuery === undefined) {
      return null;
    }
    return {
      monthKey,
      direction: step.filters.direction ?? 'OUTFLOW',
      costCenterQuery: step.filters.costCenterQuery,
      limit: step.filters.limit ?? 5,
    };
  }
  return null;
}
