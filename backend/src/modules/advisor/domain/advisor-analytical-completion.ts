import { inferEvidenceEntityScope } from './advisor-evidence-bound-answer.js';
import type { AdvisorQuestionAnalyticalDemand } from './advisor-question-scope.js';

/**
 * Contrato de completude do caminho AGENT (Fase A.2).
 *
 * Obligations são estruturais (derivadas do demand), não de frases de homologação.
 * Satisfação vem de tool results estruturados / fatos preload compatíveis — nunca da prosa.
 *
 * Limitações:
 * - INVESTIGATION usa diversidade mínima complementar, não prova de “toda” investigação;
 * - EMPTY_RESULT conta como evidência da operação (investigou; resultado vazio);
 * - MISSING_REQUIRED_SCOPE / erros não satisfazem.
 */

export const ANALYTICAL_OBLIGATIONS = [
  'ENTITY_SCOPE',
  'VALUE',
  'COMPARISON',
  'COMPOSITION',
  'MOVEMENTS',
  'RANKING',
  'INVESTIGATION',
  'PAYABLE_TITLES',
] as const;

export type AnalyticalObligation = (typeof ANALYTICAL_OBLIGATIONS)[number];

export const ANALYTICAL_COMPLETION_DECISIONS = [
  'ANSWER',
  'CONTINUE',
  'PARTIAL_LIMITATION',
] as const;

export type AnalyticalCompletionDecision = (typeof ANALYTICAL_COMPLETION_DECISIONS)[number];

export type AnalyticalEvidenceRef = {
  readonly toolName: string;
  readonly status: string | null;
  readonly entityScope: 'TENANT' | 'COST_CENTER' | 'UNKNOWN';
  readonly satisfies: readonly AnalyticalObligation[];
};

export type AnalyticalCompletionState = {
  readonly requiredObligations: readonly AnalyticalObligation[];
  readonly satisfiedObligations: ReadonlySet<AnalyticalObligation>;
  readonly missingObligations: readonly AnalyticalObligation[];
  readonly evidenceRefs: readonly AnalyticalEvidenceRef[];
  readonly attemptedTools: readonly string[];
  readonly decision: AnalyticalCompletionDecision;
  readonly impossibleObligations: readonly AnalyticalObligation[];
};

export type AnalyticalToolEvidence = {
  readonly toolName: string;
  readonly content: string;
  readonly ok: boolean;
};

const COMPLEMENTARY_FOR_INVESTIGATION: readonly AnalyticalObligation[] = [
  'COMPARISON',
  'COMPOSITION',
  'MOVEMENTS',
  'RANKING',
];

const OBLIGATION_TOOL_PROVIDERS: Record<AnalyticalObligation, readonly string[]> = {
  ENTITY_SCOPE: [
    'cash_realized_breakdown',
    'cash_cost_center_lookup',
    'cash_result_cost_center_lookup',
    'compare_cash_cost_center',
    'cash_cost_center_movement_lines',
    'cash_cost_center_ranking',
    'payable_titles',
  ],
  VALUE: [
    'cash_realized_breakdown',
    'compare_cash_months',
    'compare_cash_cost_center',
    'cash_movement_lines',
    'cash_cost_center_movement_lines',
    'cash_cost_center_lookup',
    'cash_result_cost_center_lookup',
    'cash_nominal_lookup',
    'cash_nominal_ranking',
    'compare_cash_nominal',
    'cash_cost_center_ranking',
    'payable_titles',
  ],
  COMPARISON: ['compare_cash_months', 'compare_cash_cost_center', 'compare_cash_nominal'],
  // Composição/driver: ranking por categoria OU linhas (ambos explicam concentração).
  COMPOSITION: [
    'cash_realized_breakdown',
    'cash_movement_lines',
    'cash_cost_center_movement_lines',
  ],
  MOVEMENTS: ['cash_movement_lines', 'cash_cost_center_movement_lines', 'payable_titles'],
  RANKING: [
    'cash_realized_breakdown',
    'cash_nominal_ranking',
    'cash_cost_center_ranking',
    'payable_titles',
  ],
  INVESTIGATION: [
    'cash_realized_breakdown',
    'compare_cash_cost_center',
    'compare_cash_months',
    'cash_cost_center_movement_lines',
    'cash_movement_lines',
    'cash_cost_center_ranking',
    'payable_titles',
  ],
  /** Só payable_titles satisfaz — REALIZED_CASH não conta. */
  PAYABLE_TITLES: ['payable_titles'],
};

/**
 * Deriva obligations mínimas a partir do demand estrutural já existente.
 */
export function deriveAnalyticalObligations(
  demand: AdvisorQuestionAnalyticalDemand,
): AnalyticalObligation[] {
  const financial =
    demand.wantsOutflow ||
    demand.wantsInflow ||
    demand.wantsComparison ||
    demand.wantsCompositionOrDriver ||
    demand.wantsOpenInvestigation ||
    demand.wantsPayableObligation ||
    demand.wantsPayableTitleDetail ||
    demand.explicitCostCenter.status !== 'ABSENT';

  if (!financial) {
    return [];
  }

  const obligations: AnalyticalObligation[] = [];

  if (
    demand.explicitCostCenter.status === 'FOUND' ||
    demand.explicitCostCenter.status === 'AMBIGUOUS'
  ) {
    obligations.push('ENTITY_SCOPE');
  }

  obligations.push('VALUE');

  // PAYABLE agregado (estoque) → VALUE via payable_stock / FINANCIAL_FACTS.
  // PAYABLE detalhe/ranking/listagem → exige payable_titles.
  if (demand.wantsPayableTitleDetail) {
    obligations.push('PAYABLE_TITLES');
  }

  if (demand.wantsComparison) {
    obligations.push('COMPARISON');
  }
  if (demand.wantsCompositionOrDriver) {
    obligations.push('COMPOSITION');
  }
  if (demand.wantsOpenInvestigation) {
    obligations.push('INVESTIGATION');
  }

  return [...new Set(obligations)];
}

export function evaluateAnalyticalCompletion(input: {
  readonly demand: AdvisorQuestionAnalyticalDemand;
  readonly requiredObligations: readonly AnalyticalObligation[];
  readonly toolEvidence: readonly AnalyticalToolEvidence[];
  /** Fatos de bloco (ex.: FINANCIAL_FACTS) — só satisfazem escopo TENANT. */
  readonly preloadFactScopes?: readonly ('TENANT' | 'COST_CENTER' | 'UNKNOWN')[];
  readonly availableToolNames: readonly string[];
  readonly roundsRemaining: number;
}): AnalyticalCompletionState {
  const required = input.requiredObligations;
  if (required.length === 0) {
    return {
      requiredObligations: [],
      satisfiedObligations: new Set(),
      missingObligations: [],
      evidenceRefs: [],
      attemptedTools: input.toolEvidence.map((row) => row.toolName),
      decision: 'ANSWER',
      impossibleObligations: [],
    };
  }

  const requiresEntity =
    input.demand.explicitCostCenter.status === 'FOUND' ||
    input.demand.explicitCostCenter.status === 'AMBIGUOUS';

  const evidenceRefs: AnalyticalEvidenceRef[] = [];
  const satisfied = new Set<AnalyticalObligation>();

  // FINANCIAL_FACTS / fatos preload tenant-wide: VALUE sem ENTITY_SCOPE.
  // UNKNOWN trata-se como TENANT (marcação ausente = escopo empresa).
  // Agregado payable_stock / FINANCIAL_FACTS NÃO satisfaz PAYABLE_TITLES.
  if (
    !requiresEntity &&
    required.includes('VALUE') &&
    !required.includes('PAYABLE_TITLES') &&
    (input.preloadFactScopes ?? []).some(
      (scope) => scope === 'TENANT' || scope === 'UNKNOWN',
    )
  ) {
    satisfied.add('VALUE');
  }

  for (const evidence of input.toolEvidence) {
    const ref = analyzeToolEvidence(evidence, requiresEntity);
    evidenceRefs.push(ref);
    for (const obligation of ref.satisfies) {
      satisfied.add(obligation);
    }
  }

  if (required.includes('INVESTIGATION') && investigationSatisfied(satisfied)) {
    satisfied.add('INVESTIGATION');
  }

  const missing = required.filter((obligation) => !satisfied.has(obligation));
  const available = new Set(input.availableToolNames);
  const impossible = missing.filter(
    (obligation) => !catalogCanSatisfyObligation(obligation, available, requiresEntity),
  );
  const actionableMissing = missing.filter((obligation) => !impossible.includes(obligation));

  let decision: AnalyticalCompletionDecision;
  if (missing.length === 0) {
    decision = 'ANSWER';
  } else if (actionableMissing.length > 0 && input.roundsRemaining > 0) {
    decision = 'CONTINUE';
  } else {
    decision = 'PARTIAL_LIMITATION';
  }

  return {
    requiredObligations: required,
    satisfiedObligations: satisfied,
    missingObligations: missing,
    evidenceRefs,
    attemptedTools: input.toolEvidence.map((row) => row.toolName),
    decision,
    impossibleObligations: impossible,
  };
}

export function buildAnalyticalCompletionFeedback(input: {
  readonly state: AnalyticalCompletionState;
  readonly zeroToolAttempt: boolean;
}): Record<string, unknown> {
  const status = input.zeroToolAttempt
    ? 'INSUFFICIENT_ANALYTICAL_EVIDENCE'
    : 'INCOMPLETE_ANALYTICAL_ANSWER';
  return {
    status,
    code: status,
    completionDecision: 'CONTINUE',
    requiredObligations: [...input.state.requiredObligations],
    satisfiedObligations: [...input.state.satisfiedObligations],
    missingObligations: [...input.state.missingObligations],
    attemptedTools: [...input.state.attemptedTools],
    message:
      'Additional analytical evidence is required before answering. Use available tools capable of satisfying the missing obligation(s). Do not repeat an identical call. Do not invent values.',
  };
}

export function buildAnalyticalPartialLimitationText(state: AnalyticalCompletionState): string {
  const satisfied = [...state.satisfiedObligations];
  const missing = [...state.missingObligations];
  const parts = [
    'Não consegui completar toda a análise solicitada com as evidências oficiais disponíveis nesta consulta.',
  ];
  if (satisfied.length > 0) {
    parts.push(`Parte coberta por evidência oficial: ${satisfied.join(', ')}.`);
  }
  if (missing.length > 0) {
    parts.push(`Parte não determinada com as tools/fatos disponíveis: ${missing.join(', ')}.`);
  }
  parts.push('Não inventei valores para a parte faltante.');
  return parts.join(' ');
}

export function analyzeToolEvidence(
  evidence: AnalyticalToolEvidence,
  requiresEntityScope: boolean,
): AnalyticalEvidenceRef {
  const status = readStatus(evidence.content);
  const entityScope = inferEvidenceEntityScope(evidence.content);
  if (!isSuccessfulAnalyticalStatus(status)) {
    return {
      toolName: evidence.toolName,
      status,
      entityScope,
      satisfies: [],
    };
  }

  if (requiresEntityScope && entityScope !== 'COST_CENTER') {
    return {
      toolName: evidence.toolName,
      status,
      entityScope,
      satisfies: [],
    };
  }

  const satisfies = new Set<AnalyticalObligation>();
  if (requiresEntityScope && entityScope === 'COST_CENTER') {
    satisfies.add('ENTITY_SCOPE');
  }

  const name = evidence.toolName.trim();
  if (
    name === 'cash_realized_breakdown' ||
    name === 'cash_nominal_ranking' ||
    name === 'cash_cost_center_ranking'
  ) {
    satisfies.add('VALUE');
    satisfies.add('RANKING');
    if (name === 'cash_realized_breakdown') {
      satisfies.add('COMPOSITION');
    }
  } else if (
    name === 'compare_cash_months' ||
    name === 'compare_cash_cost_center' ||
    name === 'compare_cash_nominal'
  ) {
    satisfies.add('VALUE');
    satisfies.add('COMPARISON');
  } else if (name === 'cash_movement_lines' || name === 'cash_cost_center_movement_lines') {
    satisfies.add('VALUE');
    satisfies.add('MOVEMENTS');
    satisfies.add('COMPOSITION');
  } else if (
    name === 'cash_cost_center_lookup' ||
    name === 'cash_result_cost_center_lookup' ||
    name === 'cash_nominal_lookup'
  ) {
    satisfies.add('VALUE');
  } else if (name === 'payable_titles') {
    satisfies.add('VALUE');
    satisfies.add('PAYABLE_TITLES');
    satisfies.add('MOVEMENTS');
    satisfies.add('RANKING');
  }

  return {
    toolName: evidence.toolName,
    status,
    entityScope,
    satisfies: [...satisfies],
  };
}

function investigationSatisfied(satisfied: ReadonlySet<AnalyticalObligation>): boolean {
  const hits = COMPLEMENTARY_FOR_INVESTIGATION.filter((item) => satisfied.has(item));
  return hits.length >= 2;
}

function catalogCanSatisfyObligation(
  obligation: AnalyticalObligation,
  available: ReadonlySet<string>,
  requiresEntityScope: boolean,
): boolean {
  const providers = OBLIGATION_TOOL_PROVIDERS[obligation] ?? [];
  if (obligation === 'INVESTIGATION') {
    // Precisa de pelo menos duas famílias distintas disponíveis no catálogo.
    const families = COMPLEMENTARY_FOR_INVESTIGATION.filter((family) =>
      catalogCanSatisfyObligation(family, available, requiresEntityScope),
    );
    return families.length >= 2;
  }
  if (requiresEntityScope && obligation !== 'ENTITY_SCOPE') {
    const entityCapable = new Set(OBLIGATION_TOOL_PROVIDERS.ENTITY_SCOPE);
    return providers.some((tool) => available.has(tool) && entityCapable.has(tool));
  }
  return providers.some((tool) => available.has(tool));
}

function isSuccessfulAnalyticalStatus(status: string | null): boolean {
  if (status === null) {
    return false;
  }
  return (
    status === 'OK' ||
    status === 'COMPLETE' ||
    status === 'AVAILABLE' ||
    status === 'PARTIAL' ||
    status === 'EMPTY_RESULT'
  );
}

function readStatus(content: string): string | null {
  try {
    const parsed = JSON.parse(content) as { status?: unknown };
    return typeof parsed.status === 'string' ? parsed.status : null;
  } catch {
    return null;
  }
}
