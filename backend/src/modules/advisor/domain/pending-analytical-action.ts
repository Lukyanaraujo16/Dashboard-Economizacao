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

/**
 * SINGLE = uma ação.
 * COMPOUND = A+B (todos os steps na mesma execução).
 * ALTERNATIVES = A OU B (usuário escolhe; não executar ambos por acidente).
 */
export const PENDING_OFFER_KINDS = ['SINGLE', 'COMPOUND', 'ALTERNATIVES'] as const;
export type PendingOfferKind = (typeof PENDING_OFFER_KINDS)[number];

/** Uma opção em oferta A OU B — mesmo contrato allowlisted de uma ação. */
export type PendingAnalyticalAlternative = {
  readonly id: string;
  readonly label: string;
  readonly domain: PendingAnalyticalDomain;
  readonly operation: PendingAnalyticalOperation;
  readonly steps: readonly PendingAnalyticalStep[];
  readonly objective: string;
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
  /** Default SINGLE/COMPOUND inferido de steps quando ausente (bags legados). */
  readonly offerKind: PendingOfferKind;
  /** Preenchido só quando offerKind=ALTERNATIVES (2..3 opções). */
  readonly alternatives: readonly PendingAnalyticalAlternative[] | null;
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
  /** Aceite genérico sem escolher A/B em oferta ALTERNATIVES. */
  'AMBIGUOUS_ACCEPT',
  /** Usuário escolheu uma alternativa explícita. */
  'SELECT_ALTERNATIVE',
] as const;
export type PendingResolutionDecision = (typeof PENDING_RESOLUTION_DECISIONS)[number];

export type PendingResolutionResult = {
  readonly decision: PendingResolutionDecision;
  readonly patch: PendingAnalyticalPatch | null;
  /** Obrigatório quando decision=SELECT_ALTERNATIVE. */
  readonly alternativeId: string | null;
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

  const offerKind = resolveOfferKind(value.offerKind, steps.length);
  if (offerKind === null) {
    return null;
  }

  let alternatives: readonly PendingAnalyticalAlternative[] | null = null;
  if (offerKind === 'ALTERNATIVES') {
    alternatives = parseAlternativesList(value.alternatives);
    if (alternatives === null) {
      return null;
    }
  } else if (value.alternatives !== undefined && value.alternatives !== null) {
    // SINGLE/COMPOUND não carregam alternatives.
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
    offerKind,
    alternatives,
  };
}

function resolveOfferKind(raw: unknown, stepCount: number): PendingOfferKind | null {
  if (raw === undefined || raw === null) {
    // Bags legados: 1 step = SINGLE; 2+ = COMPOUND (AND).
    return stepCount > 1 ? 'COMPOUND' : 'SINGLE';
  }
  if (typeof raw !== 'string' || !(PENDING_OFFER_KINDS as readonly string[]).includes(raw)) {
    return null;
  }
  return raw as PendingOfferKind;
}

function parseAlternativesList(value: unknown): readonly PendingAnalyticalAlternative[] | null {
  if (!Array.isArray(value) || value.length < 2 || value.length > 3) {
    return null;
  }
  const out: PendingAnalyticalAlternative[] = [];
  const seenIds = new Set<string>();
  for (const raw of value) {
    const alt = parseAlternative(raw);
    if (alt === null) {
      // Integridade: uma inválida invalida a oferta inteira.
      return null;
    }
    if (seenIds.has(alt.id)) {
      return null;
    }
    seenIds.add(alt.id);
    out.push(alt);
  }
  return out;
}

function parseAlternative(value: unknown): PendingAnalyticalAlternative | null {
  if (!isRecord(value)) {
    return null;
  }
  if (
    'tenantId' in value ||
    'costCenterId' in value ||
    'userId' in value ||
    'sql' in value
  ) {
    return null;
  }
  if (typeof value.id !== 'string' || value.id.trim() === '' || value.id.length > 40) {
    return null;
  }
  if (typeof value.label !== 'string') {
    return null;
  }
  const label = value.label.trim();
  if (label === '' || label.length > 160) {
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
  if (typeof value.objective !== 'string') {
    return null;
  }
  const objective = value.objective.trim();
  if (objective === '' || objective.length > 200) {
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
    id: value.id.trim(),
    label,
    domain: value.domain,
    operation: value.operation,
    steps,
    objective,
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
  readonly offerKind?: PendingOfferKind;
  readonly alternatives?: readonly PendingAnalyticalAlternative[] | null;
  readonly now?: Date;
  readonly ttlMs?: number;
}): PendingAnalyticalAction | null {
  const now = input.now ?? new Date();
  const ttl = input.ttlMs ?? PENDING_ANALYTICAL_ACTION_TTL_MS;
  const inferredKind: PendingOfferKind =
    input.offerKind ?? (input.steps.length > 1 ? 'COMPOUND' : 'SINGLE');
  const draft = {
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
    status: 'PENDING' as const,
    offerKind: inferredKind,
    alternatives: input.alternatives ?? null,
  };
  return parsePendingAnalyticalAction(draft);
}

/**
 * Materializa a alternativa escolhida como ação SINGLE executável (mesma pending id).
 */
export function materializePendingAlternative(
  pending: PendingAnalyticalAction,
  alternativeId: string,
): PendingAnalyticalAction | null {
  if (pending.offerKind !== 'ALTERNATIVES' || pending.alternatives === null) {
    return null;
  }
  const selected = pending.alternatives.find((row) => row.id === alternativeId);
  if (selected === undefined) {
    return null;
  }
  return parsePendingAnalyticalAction({
    ...pending,
    domain: selected.domain,
    operation: selected.operation,
    steps: selected.steps,
    objective: selected.objective,
    offerSnippet: selected.label.slice(0, 400),
    offerKind: 'SINGLE',
    alternatives: null,
    status: 'PENDING',
  });
}

/** Clarificação curta a partir do contrato (não reinventar opções). */
export function buildPendingAlternativesClarification(
  pending: PendingAnalyticalAction,
): string {
  const alts = pending.alternatives;
  if (pending.offerKind !== 'ALTERNATIVES' || alts === null || alts.length < 2) {
    return 'Claro. Qual dos caminhos você prefere que eu siga?';
  }
  const lines = alts.map((alt, index) => `${index + 1}. ${alt.label}`);
  return ['Claro. Você prefere que eu:', ...lines].join('\n');
}

export function isPendingAlternativesOffer(action: PendingAnalyticalAction): boolean {
  return action.offerKind === 'ALTERNATIVES' && (action.alternatives?.length ?? 0) >= 2;
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
    return { decision: 'MODIFY', patch, alternativeId: null };
  }
  if (value.decision === 'SELECT_ALTERNATIVE') {
    if (typeof value.alternativeId !== 'string' || value.alternativeId.trim() === '') {
      return null;
    }
    if (value.alternativeId.length > 40) {
      return null;
    }
    if (value.patch !== undefined && value.patch !== null) {
      return null;
    }
    return {
      decision: 'SELECT_ALTERNATIVE',
      patch: null,
      alternativeId: value.alternativeId.trim(),
    };
  }
  if (value.patch !== undefined && value.patch !== null) {
    return null;
  }
  if (value.alternativeId !== undefined && value.alternativeId !== null) {
    return null;
  }
  return {
    decision: value.decision as Exclude<
      PendingResolutionDecision,
      'MODIFY' | 'SELECT_ALTERNATIVE'
    >,
    patch: null,
    alternativeId: null,
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
