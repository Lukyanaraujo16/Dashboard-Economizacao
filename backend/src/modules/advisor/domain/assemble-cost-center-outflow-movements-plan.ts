import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
} from './advisor-cash-realized-breakdown.js';
import {
  buildCostCenterMovementsQuery,
  buildCostCenterMovementsWindowQuery,
} from './analytical/build-analytical-query-from-tool.js';
import type {
  AdvisorPeriodExpression,
  AdvisorQuestionInterpretation,
} from './advisor-question-interpretation.js';
import type { AnalyticalQuery } from './analytical/analytical-query.js';
import {
  validateAnalyticalCapability,
  type AnalyticalCapabilityValidation,
} from './analytical/validate-analytical-capability.js';
import type { CostCenterOutflowMovementsConversationState } from './cost-center-outflow-movements-conversation-state.js';
import { isCostCenterEntityComparisonQuestion } from './plan-cost-center-entity-comparison.js';
import { hasAdvisorCostCenterCue } from './resolve-advisor-cost-center-intent.js';
import {
  extractAdvisorCostCenterMention,
  isAdvisorCostCenterPeriodFollowUp,
} from './resolve-advisor-conversational-cost-center.js';
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
  /** Mês da consulta; em janela, o mês final (inclusivo). */
  readonly monthKey: string;
  readonly periodSource: AdvisorConversationalPeriod['source'];
  /** Janela de meses terminando em `monthKey` (Marco A2). Ausente = mês único. */
  readonly windowMonths?: number;
  readonly limit: number;
  /** Menção textual do centro — nunca id interno. */
  readonly costCenterMention: string;
  /** CATALOG = nome oficial já resolvido no catálogo do tenant (não reinterpretar). */
  readonly entitySource: 'CATALOG' | 'TEXT' | 'INHERITED';
  readonly inherited: boolean;
};

export type AssembleCostCenterOutflowMovementsPlanResult =
  | { readonly kind: 'UNMATCHED' }
  | { readonly kind: 'FOLLOW_UP_WITHOUT_CONTEXT' }
  | { readonly kind: 'MISSING_ENTITY' }
  | {
      readonly kind: 'AMBIGUOUS_ENTITY';
      readonly candidates: readonly { readonly name: string; readonly code: string | null }[];
    }
  | {
      readonly kind: 'UNSUPPORTED_PERIOD';
      readonly reason: Extract<AdvisorPeriodExpression, { kind: 'UNSUPPORTED' }>['reason'];
    }
  | { readonly kind: 'PERIOD_WITHOUT_CONTEXT' }
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
  `\\b(?:maior(?:es)?|top\\s+\\d{1,4}|\\d{1,4}\\s+maior(?:es)?)\\s+${OUTFLOW_NOUN}\\b|\\b${OUTFLOW_NOUN}\\s+mais\\s+(?:alt[oa]s?|car[oa]s?)\\b`,
);
const PLURAL_WITHOUT_N = new RegExp(`\\bmaiores?\\s+${OUTFLOW_NOUN}\\b`);
const SINGULAR_WINNER = new RegExp(`\\bmaior\\s+${OUTFLOW_NOUN}\\b`);

export function assembleCostCenterOutflowMovementsPlan(input: {
  readonly content: string;
  readonly period: AdvisorConversationalPeriod;
  readonly priorState: CostCenterOutflowMovementsConversationState | null;
  /**
   * Interpretação canônica (Marco A2). Quando presente: período estruturado,
   * cardinalidade sem números de período e centro já resolvido no catálogo.
   */
  readonly interpretation?: AdvisorQuestionInterpretation;
}): AssembleCostCenterOutflowMovementsPlanResult {
  const interpretation = input.interpretation;
  // Extratores de menção trabalham sobre o texto sem expressões de período.
  const folded =
    interpretation === undefined
      ? foldPt(input.content)
      : interpretation.maskedContent.replace(/\s+/g, ' ').trim();
  if (isCostCenterEntityComparisonQuestion(input.content)) {
    return { kind: 'UNMATCHED' };
  }
  if (input.period.comparison) {
    return { kind: 'UNMATCHED' };
  }
  if (isAdvisorInterpretiveish(folded)) {
    return { kind: 'UNMATCHED' };
  }

  // Precedência: pergunta completa → entidade → período → UNMATCHED.
  // Sem estado C.1: UNMATCHED (não FOLLOW_UP_WITHOUT_CONTEXT).
  // "E em <centro>?" após BILLING→INFLOW lookup deve cair em LastAnalyticalQuery,
  // não no caminho de maiores gastos.
  const entityFollowUp = extractCostCenterEntityFollowUp(folded);
  if (entityFollowUp !== null) {
    if (input.priorState === null) {
      return { kind: 'UNMATCHED' };
    }
    const entity = entityFromInterpretation(interpretation, entityFollowUp);
    if (entity.kind !== 'MENTION') {
      return entity.result;
    }
    const period = planPeriod(interpretation, input, { inheritWhenSilent: true });
    if (period.kind !== 'PERIOD') {
      return period.result;
    }
    return finalizeSlots({
      ...period.value,
      limit: input.priorState.limit,
      costCenterMention: entity.mention,
      entitySource: entity.source,
      inherited: true,
    });
  }

  if (isCostCenterOutflowMovementsPeriodFollowUp(input.content)) {
    // Sem estado desta família: UNMATCHED (não inventa ranking).
    // Deixa anáfora/período legados de outras famílias seguirem.
    if (input.priorState === null) {
      return { kind: 'UNMATCHED' };
    }
    return finalizeSlots({
      monthKey: input.period.monthKey,
      periodSource: input.period.source,
      limit: input.priorState.limit,
      costCenterMention: input.priorState.costCenterQuery,
      entitySource: 'INHERITED',
      inherited: true,
    });
  }

  // C.2.7 G2/D — continuidade composta na mesma família com prior:
  // "E os dez maiores de Jacaraípe em setembro?" / "E os dez maiores?"
  if (input.priorState !== null) {
    const priorState = input.priorState;
    const composite = extractCompositeOutflowMovementsFollowUp(folded, {
      content: input.content,
      period: input.period,
      priorState,
      interpretation,
    });
    if (composite !== null) {
      const entity =
        composite.costCenterMention === priorState.costCenterQuery
          ? ({ kind: 'MENTION', mention: composite.costCenterMention, source: 'INHERITED' } as const)
          : entityFromInterpretation(interpretation, composite.costCenterMention);
      if (entity.kind !== 'MENTION') {
        return entity.result;
      }
      const period =
        interpretation === undefined
          ? ({
              kind: 'PERIOD',
              value: { monthKey: composite.monthKey, periodSource: composite.periodSource },
            } as const)
          : planPeriod(interpretation, input, { inheritWhenSilent: true });
      if (period.kind !== 'PERIOD') {
        return period.result;
      }
      return finalizeSlots({
        ...period.value,
        limit: composite.limit,
        costCenterMention: entity.mention,
        entitySource: entity.source,
        inherited: true,
      });
    }
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

  const textMention = extractOutflowMovementsCostCenterMention(folded);
  let mention: string;
  let entitySource: CostCenterOutflowMovementsPlanSlots['entitySource'];
  if (interpretation !== undefined && interpretation.entity.status !== 'ABSENT') {
    // Centro decidido pelo catálogo do tenant: não reinterpretar por regex.
    const entity = entityFromInterpretation(
      interpretation,
      typeof textMention === 'string' ? textMention : '',
    );
    if (entity.kind !== 'MENTION') {
      return entity.result;
    }
    mention = entity.mention;
    entitySource = entity.source;
  } else {
    if (textMention === 'AMBIGUOUS') {
      return { kind: 'MISSING_ENTITY' };
    }
    if (textMention === null) {
      // Sem menção de centro: deixa drilldown tenant-wide / anáfora legada seguirem.
      return { kind: 'UNMATCHED' };
    }
    mention = textMention;
    entitySource = 'TEXT';
  }

  // "E qual foi o maior gasto de <outro centro>?" após janela da mesma família herda a janela.
  const period = planPeriod(interpretation, input, {
    inheritWhenSilent: input.priorState !== null && /^(?:e|agora)\b/.test(folded),
  });
  if (period.kind !== 'PERIOD') {
    return period.result;
  }
  const limit =
    interpretation === undefined
      ? resolveOutflowMovementsLimit(folded)
      : interpretation.cardinality.kind === 'NONE'
        ? resolveOutflowMovementsLimit(folded)
        : interpretation.cardinality.limit;
  return finalizeSlots({
    ...period.value,
    limit,
    costCenterMention: mention,
    entitySource,
    inherited: false,
  });
}

/** Candidato cujo nome ou código é exatamente a menção (dobrada). */
function exactCatalogCandidate(
  mention: string,
  candidates: readonly { readonly name: string; readonly code: string | null }[],
): string | null {
  const folded = foldPt(mention).replace(/\s+/g, ' ').trim();
  const hits = candidates.filter(
    (row) =>
      foldPt(row.name).replace(/\s+/g, ' ').trim() === folded ||
      (row.code !== null && foldPt(row.code).trim() === folded),
  );
  return hits.length === 1 ? hits[0]!.name : null;
}

type PlannedPeriod = {
  readonly monthKey: string;
  readonly periodSource: AdvisorConversationalPeriod['source'];
  readonly windowMonths?: number;
};

/**
 * Período do plano a partir da interpretação canônica.
 * Sem interpretação: comportamento legado (mês conversacional).
 */
function planPeriod(
  interpretation: AdvisorQuestionInterpretation | undefined,
  input: {
    readonly period: AdvisorConversationalPeriod;
    readonly priorState: CostCenterOutflowMovementsConversationState | null;
  },
  options: { readonly inheritWhenSilent: boolean },
):
  | { readonly kind: 'PERIOD'; readonly value: PlannedPeriod }
  | { readonly kind: 'RESULT'; readonly result: AssembleCostCenterOutflowMovementsPlanResult } {
  const fromPrior = (): PlannedPeriod | null =>
    input.priorState === null
      ? null
      : {
          monthKey: input.priorState.monthKey,
          periodSource: input.priorState.periodSource,
          ...(input.priorState.windowMonths !== undefined
            ? { windowMonths: input.priorState.windowMonths }
            : {}),
        };
  if (interpretation === undefined) {
    const prior = options.inheritWhenSilent ? fromPrior() : null;
    return {
      kind: 'PERIOD',
      value: prior ?? { monthKey: input.period.monthKey, periodSource: input.period.source },
    };
  }
  const expression = interpretation.periodExpression;
  if (expression.kind === 'UNSUPPORTED') {
    return { kind: 'RESULT', result: { kind: 'UNSUPPORTED_PERIOD', reason: expression.reason } };
  }
  const resolved = interpretation.period;
  if (resolved === null) {
    return { kind: 'RESULT', result: { kind: 'PERIOD_WITHOUT_CONTEXT' } };
  }
  if (resolved.origin === 'CONVERSATION_DEFAULT' && options.inheritWhenSilent) {
    const prior = fromPrior();
    if (prior !== null) {
      return { kind: 'PERIOD', value: prior };
    }
  }
  if (resolved.kind === 'MONTH_WINDOW') {
    return {
      kind: 'PERIOD',
      value: {
        monthKey: resolved.endMonthKey,
        periodSource:
          resolved.origin === 'INHERITED' ? 'CONVERSATION_CONTEXT' : input.period.source,
        windowMonths: resolved.count,
      },
    };
  }
  return {
    kind: 'PERIOD',
    value: {
      monthKey: resolved.monthKey,
      periodSource: resolved.origin === 'INHERITED' ? 'CONVERSATION_CONTEXT' : input.period.source,
    },
  };
}

/**
 * Entidade: catálogo do tenant primeiro; menção textual só quando o catálogo não decidiu.
 */
function entityFromInterpretation(
  interpretation: AdvisorQuestionInterpretation | undefined,
  textMention: string,
):
  | {
      readonly kind: 'MENTION';
      readonly mention: string;
      readonly source: CostCenterOutflowMovementsPlanSlots['entitySource'];
    }
  | { readonly kind: 'RESULT'; readonly result: AssembleCostCenterOutflowMovementsPlanResult } {
  if (interpretation?.entity.status === 'RESOLVED') {
    return { kind: 'MENTION', mention: interpretation.entity.officialName, source: 'CATALOG' };
  }
  if (interpretation?.entity.status === 'AMBIGUOUS') {
    // Nome/código exato de um candidato desfaz a ambiguidade de token
    // ("Unidade Serra" × "Unidade Serra Sul"), como a resolução exata da tool.
    const exact = exactCatalogCandidate(textMention, interpretation.entity.candidates);
    if (exact !== null) {
      return { kind: 'MENTION', mention: exact, source: 'CATALOG' };
    }
    return {
      kind: 'RESULT',
      result: { kind: 'AMBIGUOUS_ENTITY', candidates: interpretation.entity.candidates },
    };
  }
  return { kind: 'MENTION', mention: textMention, source: 'TEXT' };
}

export function matchesCostCenterOutflowMovementsFamily(content: string): boolean {
  const folded = foldPt(content);
  if (isCostCenterEntityComparisonQuestion(content)) {
    return false;
  }
  if (extractCostCenterEntityFollowUp(folded) !== null) {
    return true;
  }
  if (isCostCenterOutflowMovementsPeriodFollowUp(content)) {
    return true;
  }
  return matchesOutflowMovementsFamily(folded);
}

/**
 * Continuação estrutural só de período ("E em setembro?", "agora em agosto").
 * Reusa o detector de família cost-center e exige que o restante seja
 * exclusivamente um token de mês — não qualquer menção de mês em pergunta nova.
 */
export function isCostCenterOutflowMovementsPeriodFollowUp(content: string): boolean {
  if (!isAdvisorCostCenterPeriodFollowUp(content)) {
    return false;
  }
  const folded = foldPt(content).replace(/[?.!]+$/g, '').trim();
  if (/^(?:e no mes|e nesse mes|e neste mes)$/.test(folded)) {
    return true;
  }
  const match = /^(?:e|agora)\s+em\s+(.+)$/i.exec(folded);
  if (match?.[1] === undefined) {
    return false;
  }
  const rest = match[1].trim();
  return isMonthToken(rest) || /^(?:esse|este|desse|deste)\s+mes$/.test(rest);
}

function finalizeSlots(input: {
  readonly monthKey: string;
  readonly periodSource: AdvisorConversationalPeriod['source'];
  readonly windowMonths?: number;
  readonly limit: number;
  readonly costCenterMention: string;
  readonly entitySource: CostCenterOutflowMovementsPlanSlots['entitySource'];
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
    ...(input.windowMonths !== undefined ? { windowMonths: input.windowMonths } : {}),
    limit: clampLimit(input.limit),
    costCenterMention: input.costCenterMention,
    entitySource: input.entitySource,
    inherited: input.inherited,
  };
  const query =
    slots.windowMonths !== undefined
      ? buildCostCenterMovementsWindowQuery({
          endMonthKey: slots.monthKey,
          count: slots.windowMonths,
          costCenterQuery: slots.costCenterMention,
          limit: slots.limit,
        })
      : buildCostCenterMovementsQuery({
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
  // "categoria com maior despesa" é agregado por categoria, não lançamento individual.
  if (/\bcategor/.test(folded)) {
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
  // Cardinalidade por extenso em continuações ("e os dez maiores?").
  const written = extractWrittenTopNLimit(folded);
  if (written !== null) {
    return written;
  }
  if (SINGULAR_WINNER.test(folded) && !/\bmaiores\b/.test(folded)) {
    return 1;
  }
  return ADVISOR_DRILLDOWN_DEFAULT_LIMIT;
}

function extractWrittenTopNLimit(folded: string): number | null {
  if (/\bdez\b/.test(folded)) return clampLimit(10);
  if (/\bcinco\b/.test(folded)) return clampLimit(5);
  if (/\btr[eê]s\b/.test(folded)) return clampLimit(3);
  if (/\bvinte\b/.test(folded)) return clampLimit(20);
  return null;
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
      `(?:quais\\s+(?:foram\\s+)?)?(?:os\\s+)?(?:\\d{1,4}\\s+)?maior(?:es)?\\s+${OUTFLOW_NOUN}\\s+d[aeo]\\s+(.+?)(?:\\s+em\\s+${MONTH_NAME}|\\s+de\\s+\\d{4}|[?.!]|$)`,
      'i',
    ),
    new RegExp(
      `(?:maiores?|top\\s+\\d{1,4})\\s+${OUTFLOW_NOUN}\\s+d[aeo]\\s+(.+?)(?:\\s+em\\s+|\\s+entre\\s+|$)`,
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

/**
 * Continuação composta herdando família OUTFLOW×MOVEMENTS×COST_CENTER.
 * Ex.: "E os dez maiores?", "E os dez maiores de Jacaraípe em setembro?"
 * Não exige repetir o noun "gastos" quando há prior factual da família.
 */
function extractCompositeOutflowMovementsFollowUp(
  folded: string,
  input: {
    readonly content: string;
    readonly period: AdvisorConversationalPeriod;
    readonly priorState: CostCenterOutflowMovementsConversationState;
    readonly interpretation?: AdvisorQuestionInterpretation;
  },
): {
  readonly monthKey: string;
  readonly periodSource: AdvisorConversationalPeriod['source'];
  readonly limit: number;
  readonly costCenterMention: string;
} | null {
  if (!/^(?:e|agora)\b/.test(folded)) {
    return null;
  }
  if (!/\b(?:maior(?:es)?|top\s+\d+)/.test(folded)) {
    return null;
  }
  // Pergunta completa com noun de gasto + entidade: deixa o caminho ASSEMBLED novo.
  const hasEntity =
    input.interpretation === undefined
      ? extractOutflowMovementsCostCenterMention(input.content) !== null
      : input.interpretation.entity.status !== 'ABSENT' ||
        extractOutflowMovementsCostCenterMention(folded) !== null;
  if (hasOutflowNoun(folded) && hasEntity) {
    return null;
  }

  const cardinality = input.interpretation?.cardinality;
  const limit =
    cardinality !== undefined && cardinality.kind !== 'NONE'
      ? cardinality.limit
      : resolveOutflowMovementsLimit(folded);
  // Com interpretação, o texto chega sem período: o mês vem da expressão estruturada.
  const hasMonthCue =
    input.interpretation === undefined
      ? new RegExp(`\\bem\\s+${MONTH_NAME}\\b`).test(folded)
      : input.interpretation.periodExpression.kind === 'MONTH';
  const entityMatch =
    /(?:maior(?:es)?|top\s+\d+)\s+(?:gastos?|despesas?|saidas?)?\s*(?:de|da|do|em)\s+(.+?)(?:\s+em\s+|$)/i.exec(
      folded,
    ) ?? /\b(?:de|da|do)\s+(.+?)(?:\s+em\s+|$)/i.exec(folded);
  let costCenterMention = input.priorState.costCenterQuery;
  if (input.interpretation?.entity.status === 'RESOLVED') {
    costCenterMention = input.interpretation.entity.officialName;
  } else if (entityMatch?.[1] !== undefined) {
    const cleaned = cleanMention(entityMatch[1]);
    if (cleaned !== null && !isNoiseMention(cleaned) && !isMonthToken(cleaned)) {
      costCenterMention = cleaned;
    }
  }

  const explicitCardinality =
    (cardinality !== undefined && cardinality.kind !== 'NONE' && cardinality.source !== 'DEFAULT_PLURAL') ||
    extractExplicitAdvisorTopNLimit(folded) !== null ||
    /\b(?:dez|cinco|top\s+\d+|\d+\s+maior)/.test(folded);
  return {
    monthKey: hasMonthCue ? input.period.monthKey : input.priorState.monthKey,
    periodSource: hasMonthCue ? input.period.source : input.priorState.periodSource,
    limit: explicitCardinality ? limit : input.priorState.limit,
    costCenterMention,
  };
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
