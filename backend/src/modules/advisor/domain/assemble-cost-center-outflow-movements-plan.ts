import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
} from './advisor-cash-realized-breakdown.js';
import { buildCostCenterMovementsQuery } from './analytical/build-analytical-query-from-tool.js';
import type { AnalyticalQuery } from './analytical/analytical-query.js';
import {
  validateAnalyticalCapability,
  type AnalyticalCapabilityValidation,
} from './analytical/validate-analytical-capability.js';
import type { CostCenterOutflowMovementsConversationState } from './cost-center-outflow-movements-conversation-state.js';
import { isCostCenterEntityComparisonQuestion } from './plan-cost-center-entity-comparison.js';
import { hasAdvisorCostCenterCue } from './resolve-advisor-cost-center-intent.js';
import { extractAdvisorCostCenterMention } from './resolve-advisor-conversational-cost-center.js';
import type { AdvisorConversationalPeriod } from './resolve-advisor-conversational-period.js';
import { extractExplicitAdvisorTopNLimit } from './resolve-advisor-drilldown-intent.js';

/**
 * Assembler determinístico da família:
 * REALIZED_CASH + OUTFLOW + MOVEMENTS + COST_CENTER + MONTH + limit.
 * Produz menção textual; IDs só após entity resolution na execução.
 */

export type CostCenterOutflowMovementsPlanSlots = {
  readonly semanticFamily: 'FLOW';
  readonly metric: 'REALIZED_CASH';
  readonly direction: 'OUTFLOW';
  readonly regime: 'REALIZED';
  readonly operation: 'MOVEMENTS';
  readonly dimension: 'COST_CENTER';
  readonly monthKey: string;
  readonly periodSource: AdvisorConversationalPeriod['source'];
  readonly limit: number;
  /** Menção textual do centro — nunca id interno. */
  readonly costCenterMention: string;
  readonly inherited: boolean;
};

export type AssembleCostCenterOutflowMovementsPlanResult =
  | { readonly kind: 'UNMATCHED' }
  | { readonly kind: 'FOLLOW_UP_WITHOUT_CONTEXT' }
  | { readonly kind: 'MISSING_ENTITY' }
  | {
      readonly kind: 'CAPABILITY_DENIED';
      readonly slots: CostCenterOutflowMovementsPlanSlots;
      readonly query: AnalyticalQuery;
      readonly validation: Extract<AnalyticalCapabilityValidation, { ok: false }>;
    }
  | {
      readonly kind: 'ASSEMBLED';
      readonly slots: CostCenterOutflowMovementsPlanSlots;
      readonly query: AnalyticalQuery;
    };

const MONTH_NAME =
  '(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';

const OUTFLOW_NOUN = '(?:gastos?|despesas?|saidas?)';
const RANKING_CUE = new RegExp(
  `\\b(?:maior(?:es)?|top\\s+\\d{1,4}|\\d{1,4}\\s+maior(?:es)?)\\s+${OUTFLOW_NOUN}\\b`,
);
const PLURAL_WITHOUT_N = new RegExp(`\\bmaiores?\\s+${OUTFLOW_NOUN}\\b`);
const SINGULAR_WINNER = new RegExp(`\\bmaior\\s+${OUTFLOW_NOUN}\\b`);

export function assembleCostCenterOutflowMovementsPlan(input: {
  readonly content: string;
  readonly period: AdvisorConversationalPeriod;
  readonly priorState: CostCenterOutflowMovementsConversationState | null;
}): AssembleCostCenterOutflowMovementsPlanResult {
  const folded = foldPt(input.content);
  if (isCostCenterEntityComparisonQuestion(input.content)) {
    return { kind: 'UNMATCHED' };
  }
  if (input.period.comparison) {
    return { kind: 'UNMATCHED' };
  }
  if (isAdvisorInterpretiveish(folded)) {
    return { kind: 'UNMATCHED' };
  }

  const entityFollowUp = extractCostCenterEntityFollowUp(folded);
  if (entityFollowUp !== null) {
    if (input.priorState === null) {
      return { kind: 'FOLLOW_UP_WITHOUT_CONTEXT' };
    }
    return finalizeSlots({
      monthKey: input.priorState.monthKey,
      periodSource: input.priorState.periodSource,
      limit: input.priorState.limit,
      costCenterMention: entityFollowUp,
      inherited: true,
    });
  }

  if (!matchesOutflowMovementsFamily(folded)) {
    return { kind: 'UNMATCHED' };
  }
  // Ranking entre centros ("qual centro teve maior saída") não é esta família.
  if (hasAdvisorCostCenterCue(input.content) && isCrossCenterRanking(folded)) {
    return { kind: 'UNMATCHED' };
  }
  // Dois centros na mesma frase ("em A e em B") — ainda não compostável nesta fase.
  if (/\bem\s+.+\s+e\s+em\s+/i.test(folded)) {
    return { kind: 'MISSING_ENTITY' };
  }

  const mention = extractOutflowMovementsCostCenterMention(input.content);
  if (mention === 'AMBIGUOUS') {
    return { kind: 'MISSING_ENTITY' };
  }
  if (mention === null) {
    // Sem menção de centro: deixa drilldown tenant-wide / anáfora legada seguirem.
    return { kind: 'UNMATCHED' };
  }

  const limit = resolveOutflowMovementsLimit(folded);
  return finalizeSlots({
    monthKey: input.period.monthKey,
    periodSource: input.period.source,
    limit,
    costCenterMention: mention,
    inherited: false,
  });
}

export function matchesCostCenterOutflowMovementsFamily(content: string): boolean {
  const folded = foldPt(content);
  if (isCostCenterEntityComparisonQuestion(content)) {
    return false;
  }
  if (extractCostCenterEntityFollowUp(folded) !== null) {
    return true;
  }
  return matchesOutflowMovementsFamily(folded);
}

function finalizeSlots(input: {
  readonly monthKey: string;
  readonly periodSource: AdvisorConversationalPeriod['source'];
  readonly limit: number;
  readonly costCenterMention: string;
  readonly inherited: boolean;
}): AssembleCostCenterOutflowMovementsPlanResult {
  const slots: CostCenterOutflowMovementsPlanSlots = {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction: 'OUTFLOW',
    regime: 'REALIZED',
    operation: 'MOVEMENTS',
    dimension: 'COST_CENTER',
    monthKey: input.monthKey,
    periodSource: input.periodSource,
    limit: clampLimit(input.limit),
    costCenterMention: input.costCenterMention,
    inherited: input.inherited,
  };
  const query = buildCostCenterMovementsQuery({
    monthKey: slots.monthKey,
    direction: 'OUTFLOW',
    costCenterQuery: slots.costCenterMention,
    limit: slots.limit,
  });
  const validation = validateAnalyticalCapability(query);
  if (!validation.ok) {
    return {
      kind: 'CAPABILITY_DENIED',
      slots,
      query,
      validation,
    };
  }
  return { kind: 'ASSEMBLED', slots, query };
}

function matchesOutflowMovementsFamily(folded: string): boolean {
  if (!hasOutflowNoun(folded)) {
    return false;
  }
  return RANKING_CUE.test(folded) || PLURAL_WITHOUT_N.test(folded);
}

function hasOutflowNoun(folded: string): boolean {
  return /\b(?:gastos?|despesas?|saidas?)\b/.test(folded);
}

function isCrossCenterRanking(folded: string): boolean {
  return (
    /\bcentros?(?:\s+de\s+custo)?\b/.test(folded) &&
    (/\bqual\s+centro\b/.test(folded) ||
      /\bquais\s+(?:foram\s+)?(?:os\s+)?\d*\s*centros?\b/.test(folded) ||
      /\btop\s+\d+\s+centros?\b/.test(folded) ||
      /\bcom\s+maior\b/.test(folded))
  );
}

function resolveOutflowMovementsLimit(folded: string): number {
  const explicit = extractExplicitAdvisorTopNLimit(folded);
  if (explicit !== null) {
    return explicit;
  }
  if (SINGULAR_WINNER.test(folded) && !/\bmaiores\b/.test(folded)) {
    return 1;
  }
  return ADVISOR_DRILLDOWN_DEFAULT_LIMIT;
}

function clampLimit(limit: number): number {
  return Math.min(Math.max(1, Math.trunc(limit)), ADVISOR_DRILLDOWN_MAX_LIMIT);
}

/**
 * Extrai menção textual de centro para esta família.
 * Aceita "maior gasto em X", "maiores gastos em X", "maiores saídas de X".
 */
export function extractOutflowMovementsCostCenterMention(
  content: string,
): string | 'AMBIGUOUS' | null {
  const folded = foldPt(content);
  const patterns = [
    new RegExp(
      `(?:maior(?:es)?|top\\s+\\d{1,4}|\\d{1,4}\\s+maior(?:es)?)\\s+${OUTFLOW_NOUN}\\s+em\\s+(.+?)(?:\\s+em\\s+${MONTH_NAME}|\\s+de\\s+\\d{4}|\\s+em\\s+\\d{4}|[?.!]|$)`,
      'i',
    ),
    new RegExp(
      `(?:quais\\s+(?:foram\\s+)?)?(?:os\\s+)?(?:\\d{1,4}\\s+)?maior(?:es)?\\s+${OUTFLOW_NOUN}\\s+de\\s+(.+?)(?:\\s+em\\s+${MONTH_NAME}|\\s+de\\s+\\d{4}|[?.!]|$)`,
      'i',
    ),
    new RegExp(
      `(?:maiores?|top\\s+\\d{1,4})\\s+${OUTFLOW_NOUN}\\s+de\\s+(.+?)(?:\\s+em\\s+|\\s+entre\\s+|$)`,
      'i',
    ),
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(folded);
    if (match?.[1] === undefined) {
      continue;
    }
    const cleaned = cleanMention(match[1]);
    if (cleaned === null || isNoiseMention(cleaned) || isMonthToken(cleaned)) {
      continue;
    }
    if (!found.includes(cleaned)) {
      found.push(cleaned);
    }
  }
  if (found.length > 1) {
    return 'AMBIGUOUS';
  }
  if (found.length === 1) {
    return found[0]!;
  }
  return extractAdvisorCostCenterMention(content);
}

/**
 * Follow-up de substituição de centro: "e em <unidade>?", "e em X".
 */
export function extractCostCenterEntityFollowUp(folded: string): string | null {
  const normalized = folded.replace(/[?.!]+$/g, '').trim();
  const match =
    /^(?:e|agora)\s+em\s+(.+)$/i.exec(normalized) ??
    /^e\s+no\s+centro(?:\s+de\s+custo)?\s+(.+)$/i.exec(normalized);
  if (match?.[1] === undefined) {
    return null;
  }
  const cleaned = cleanMention(match[1]);
  if (cleaned === null || isNoiseMention(cleaned) || isMonthToken(cleaned)) {
    return null;
  }
  // "e em agosto" é follow-up de período, não de entidade.
  if (isMonthToken(cleaned) || /^(?:esse|este|desse|deste)\s+mes$/.test(cleaned)) {
    return null;
  }
  return cleaned;
}

function cleanMention(value: string): string | null {
  const cleaned = value
    .replace(/\s+do\s+centro(?:\s+de\s+custo)?\s+/i, ' ')
    .replace(/\s+em\s+.+$/i, '')
    .replace(/\s+de\s+\d{4}.*$/i, '')
    .replace(/[?.!].*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned === '' ? null : cleaned;
}

function isMonthToken(value: string): boolean {
  return new RegExp(`^${MONTH_NAME}(?:\\s+de\\s+\\d{4})?$`, 'i').test(foldPt(value));
}

function isNoiseMention(value: string): boolean {
  const folded = foldPt(value);
  return (
    /^(?:centro|centros|de custo|maior|maiores|esse|este|dele|saidas?|entradas?|gastos?|despesas?|teve|tem|gastou|quanto|meu|meus)$/.test(
      folded,
    ) || /^(?:teve|com)\s+/.test(folded)
  );
}

function isAdvisorInterpretiveish(folded: string): boolean {
  return (
    /\bo que voce acha\b/.test(folded) ||
    /\bestrategias?\b/.test(folded) ||
    /\brecomend/.test(folded) ||
    /\bpor que .{0,80}(?:gastou|cresceu)\b/.test(folded)
  );
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
