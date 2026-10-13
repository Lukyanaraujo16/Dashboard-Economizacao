/**
 * C.2.4 / C.2.7 — Classificação determinística CONTINUE | NEW_QUERY | CLARIFY.
 * Não interpreta toda pergunta curta como continuação.
 */
import {
  extractCostCenterEntityFollowUp,
  isCostCenterOutflowMovementsPeriodFollowUp,
} from './assemble-cost-center-outflow-movements-plan.js';
import type { AnalyticalDimensionPatch } from './analytical-dimension-patch.js';
import { patchPeriodMonthKey } from './analytical-dimension-patch.js';
import type { AnalyticalDirection, AnalyticalMetricKey } from './analytical/analytical-keys.js';
import type { LastAnalyticalQuery } from './last-analytical-query.js';
import { extractExplicitAdvisorTopNLimit } from './resolve-advisor-drilldown-intent.js';
import type { AdvisorConversationalPeriod } from './resolve-advisor-conversational-period.js';
import { isAdvisorCostCenterPeriodFollowUp } from './resolve-advisor-conversational-cost-center.js';

export const ANALYTICAL_CONTINUITY_DECISIONS = [
  'CONTINUE',
  'NEW_QUERY',
  'CLARIFY',
] as const;
export type AnalyticalContinuityDecision =
  (typeof ANALYTICAL_CONTINUITY_DECISIONS)[number];

export type ClassifyAnalyticalContinuityResult =
  | {
      readonly decision: 'CONTINUE';
      readonly patch: AnalyticalDimensionPatch;
      readonly inherited: true;
    }
  | { readonly decision: 'NEW_QUERY'; readonly reason: string }
  | { readonly decision: 'CLARIFY'; readonly reason: string; readonly message: string };

const MONTH_NAME =
  '(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';

export function classifyAnalyticalContinuity(input: {
  readonly content: string;
  readonly period: AdvisorConversationalPeriod;
  readonly prior: LastAnalyticalQuery | null;
}): ClassifyAnalyticalContinuityResult {
  const folded = foldPt(input.content).replace(/[?.!]+$/g, '').trim();
  if (folded === '') {
    return { decision: 'NEW_QUERY', reason: 'EMPTY' };
  }

  // G1 — investigação completa explícita (métrica/op/entidade/período) → NEW_QUERY.
  if (isExplicitFullOutflowInvestigation(folded)) {
    return { decision: 'NEW_QUERY', reason: 'FULL_OUTFLOW_INVESTIGATION' };
  }

  const strongContinuation = hasStrongContinuationShape(folded, input.content);
  if (!strongContinuation && !looksLikeStructuralContinuation(folded, input.content)) {
    return { decision: 'NEW_QUERY', reason: 'INDEPENDENT_QUESTION' };
  }

  if (input.prior === null) {
    if (!strongContinuation) {
      return { decision: 'NEW_QUERY', reason: 'NO_PRIOR_WEAK_CONTINUATION' };
    }
    return {
      decision: 'CLARIFY',
      reason: 'FOLLOW_UP_WITHOUT_CONTEXT',
      message:
        'Não tenho uma consulta analítica anterior nesta conversa para continuar. Reformule a pergunta completa.',
    };
  }

  // G2 / D — continuidade composta na família MOVEMENTS×OUTFLOW.
  if (isMovementsFamilyPrior(input.prior)) {
    const composite = extractCompositeMovementsContinuation(folded, input.period, input.prior);
    if (composite !== null) {
      return { decision: 'CONTINUE', patch: composite, inherited: true };
    }
  }

  const limitPatch = extractLimitOnlyFollowUp(folded);
  const entityPatch = extractContinuityEntityFollowUp(folded, input.content);
  const periodOnly =
    isCostCenterOutflowMovementsPeriodFollowUp(input.content) ||
    isAdvisorCostCenterPeriodFollowUp(input.content) ||
    isBarePeriodContinuation(folded);
  const metricPatch = extractExplicitMetricPatch(folded);
  const directionPatch = extractDirectionForMetricPatch(folded, metricPatch);

  // F — mudança explícita de métrica (ex.: BILLING → entradas de caixa).
  if (
    metricPatch !== null &&
    metricPatch !== input.prior.query.metric &&
    entityPatch === null &&
    limitPatch === null &&
    !periodOnly
  ) {
    // Frase curta de continuação métrica: CONTINUE com reshape no apply.
    // Frase longa independente: NEW_QUERY.
    if (hasIndependentQuestionShape(folded) && !/^(?:e|agora)\b/.test(folded)) {
      return { decision: 'NEW_QUERY', reason: 'EXPLICIT_METRIC_INDEPENDENT' };
    }
    return {
      decision: 'CONTINUE',
      patch: {
        metric: metricPatch,
        ...(directionPatch !== undefined ? { direction: directionPatch } : {}),
      },
      inherited: true,
    };
  }

  const patch: AnalyticalDimensionPatch = {
    ...(limitPatch !== null ? { limit: limitPatch } : {}),
    ...(entityPatch !== null ? { costCenterQuery: entityPatch } : {}),
    ...(periodOnly && entityPatch === null
      ? {
          period: patchPeriodMonthKey(input.prior.query.period, input.period.monthKey),
        }
      : {}),
    ...(metricPatch !== null ? { metric: metricPatch } : {}),
    ...(directionPatch !== undefined ? { direction: directionPatch } : {}),
  };

  if (Object.keys(patch).length === 0) {
    return {
      decision: 'CLARIFY',
      reason: 'AMBIGUOUS_CONTINUATION',
      message:
        'Não consegui identificar o que alterar na consulta anterior. Especifique período, centro, limite ou métrica.',
    };
  }

  if (
    metricPatch !== null &&
    entityPatch === null &&
    limitPatch === null &&
    !periodOnly &&
    hasIndependentQuestionShape(folded) &&
    !/^(?:e|agora)\b/.test(folded)
  ) {
    return { decision: 'NEW_QUERY', reason: 'EXPLICIT_METRIC_INDEPENDENT' };
  }

  return { decision: 'CONTINUE', patch, inherited: true };
}

function isMovementsFamilyPrior(prior: LastAnalyticalQuery): boolean {
  return (
    prior.capabilityKey === 'realized_cash.cost_center.month.movements' ||
    (prior.query.metric === 'REALIZED_CASH' &&
      prior.query.operation === 'MOVEMENTS' &&
      prior.query.dimension === 'COST_CENTER')
  );
}

/**
 * "E os dez maiores de Jacaraípe em setembro?" — mesma família MOVEMENTS.
 */
function extractCompositeMovementsContinuation(
  folded: string,
  period: AdvisorConversationalPeriod,
  prior: LastAnalyticalQuery,
): AnalyticalDimensionPatch | null {
  if (!/^(?:e|agora)\b/.test(folded)) {
    return null;
  }
  if (!/\b(?:maior(?:es)?|top\s+\d+)/.test(folded)) {
    return null;
  }
  // Com noun de gasto explícito + centro + mês → preferir NEW_QUERY (G1).
  if (isExplicitFullOutflowInvestigation(folded)) {
    return null;
  }

  const limit =
    extractExplicitAdvisorTopNLimit(folded) ??
    (/\bdez\b/.test(folded)
      ? 10
      : /\bcinco\b/.test(folded)
        ? 5
        : null);
  const entity =
    /(?:maior(?:es)?|top\s+\d+)\s+(?:gastos?|despesas?|saidas?)?\s*(?:de|em)\s+(.+?)(?:\s+em\s+|$)/i.exec(
      folded,
    )?.[1] ??
    /\bde\s+(.+?)(?:\s+em\s+|$)/i.exec(folded)?.[1] ??
    null;
  const cleanedEntity =
    entity === null ? null : cleanEntityToken(entity);
  const hasMonthCue = new RegExp(`\\bem\\s+${MONTH_NAME}\\b`).test(folded);

  if (limit === null && cleanedEntity === null && !hasMonthCue) {
    return null;
  }

  return {
    ...(limit !== null ? { limit } : {}),
    ...(cleanedEntity !== null ? { costCenterQuery: cleanedEntity } : {}),
    ...(hasMonthCue
      ? { period: { kind: 'MONTH' as const, monthKey: period.monthKey } }
      : {}),
    direction: prior.query.direction ?? 'OUTFLOW',
    operation: 'MOVEMENTS',
  };
}

/** Investigação completa: ranking + noun outflow + entidade + (opcional) mês. */
function isExplicitFullOutflowInvestigation(folded: string): boolean {
  const hasOutflow = /\b(?:gastos?|despesas?|saidas?)\b/.test(folded);
  const hasRanking = /\b(?:maior(?:es)?|top\s+\d+|\d+\s+maior(?:es)?)\b/.test(folded);
  const hasEntity = /\b(?:de|em)\s+(?!(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\b).{3,}/.test(
    folded,
  );
  return hasOutflow && hasRanking && hasEntity;
}

function hasStrongContinuationShape(folded: string, raw: string): boolean {
  if (isCostCenterOutflowMovementsPeriodFollowUp(raw) || isAdvisorCostCenterPeriodFollowUp(raw)) {
    return true;
  }
  if (extractContinuityEntityFollowUp(folded, raw) !== null) {
    return true;
  }
  if (extractLimitOnlyFollowUp(folded) !== null) {
    return true;
  }
  if (/^(?:e|agora)\b/.test(folded) && extractExplicitMetricPatch(folded) !== null) {
    return true;
  }
  return false;
}

function looksLikeStructuralContinuation(folded: string, raw: string): boolean {
  if (hasStrongContinuationShape(folded, raw)) {
    return true;
  }
  return /^(?:e|agora)\b/.test(folded);
}

function isBarePeriodContinuation(folded: string): boolean {
  return (
    /^(?:e|agora)\s+em\s+/.test(folded) ||
    /^(?:e no mes|e nesse mes|e neste mes)$/.test(folded)
  );
}

export function extractContinuityEntityFollowUp(
  folded: string,
  raw: string,
): string | null {
  const fromEm = extractCostCenterEntityFollowUp(folded);
  if (fromEm !== null) {
    return fromEm;
  }
  const normalized = folded.replace(/[?.!]+$/g, '').trim();
  const deMatch = /^(?:e|agora)\s+de\s+(.+)$/i.exec(normalized);
  if (deMatch?.[1] !== undefined) {
    const cleaned = cleanEntityToken(deMatch[1]);
    if (cleaned !== null) {
      return cleaned;
    }
  }
  void raw;
  return null;
}

function extractLimitOnlyFollowUp(folded: string): number | null {
  if (
    !/^(?:e|agora)\s+(?:os\s+)?(?:\d{1,4}|dez|cinco|tres|três|vinte)?\s*maior/.test(
      folded,
    ) &&
    !/^(?:e|agora)\s+os\s+dez\s+maior/.test(folded) &&
    !/^(?:e|agora)\s+top\s+\d{1,4}\b/.test(folded)
  ) {
    if (!/^(?:e|agora)\b/.test(folded)) {
      return null;
    }
    if (!/\b(?:maior(?:es)?|top\s+\d+)/.test(folded)) {
      return null;
    }
    // Com entidade/mês no meio → não é "só limite".
    if (/\b(?:de|em)\s+\S+/.test(folded.replace(/^(?:e|agora)\s+/, ''))) {
      return null;
    }
  }
  const explicit = extractExplicitAdvisorTopNLimit(folded);
  if (explicit !== null) {
    return explicit;
  }
  if (/\bdez\b/.test(folded)) {
    return 10;
  }
  if (/\bcinco\b/.test(folded)) {
    return 5;
  }
  if (/\btr[eê]s\b/.test(folded)) {
    return 3;
  }
  if (/\bvinte\b/.test(folded)) {
    return 20;
  }
  return null;
}

function extractExplicitMetricPatch(folded: string): AnalyticalMetricKey | null {
  if (!/^(?:e|agora)\b/.test(folded) && !hasIndependentQuestionShape(folded)) {
    return null;
  }
  if (/\bfaturament/.test(folded) || /\b(faturei|faturado)\b/.test(folded)) {
    return 'BILLING';
  }
  if (
    /\b(entrou|entrar|entradas?|recebimentos?)\b/.test(folded) &&
    /\bcaixa\b/.test(folded)
  ) {
    return 'REALIZED_CASH';
  }
  if (/\bresultado\s+de\s+caixa\b/.test(folded)) {
    return 'CASH_RESULT';
  }
  return null;
}

function extractDirectionForMetricPatch(
  folded: string,
  metric: AnalyticalMetricKey | null,
): AnalyticalDirection | undefined {
  if (metric !== 'REALIZED_CASH') {
    return undefined;
  }
  if (/\b(entrou|entrar|entradas?|recebimentos?)\b/.test(folded)) {
    return 'INFLOW';
  }
  if (/\b(saiu|saidas?|gastos?|despesas?)\b/.test(folded)) {
    return 'OUTFLOW';
  }
  return undefined;
}

function hasIndependentQuestionShape(folded: string): boolean {
  return (
    /^(?:qual|quanto|quais|como|me diga|mostre)\b/.test(folded) ||
    folded.split(/\s+/).length >= 6
  );
}

function cleanEntityToken(value: string): string | null {
  const cleaned = value
    .replace(new RegExp(`\\s+em\\s+${MONTH_NAME}.*$`, 'i'), '')
    .replace(/\s+de\s+\d{4}.*$/i, '')
    .replace(/[?.!].*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '' || isMonthToken(cleaned) || isNoise(cleaned)) {
    return null;
  }
  return cleaned;
}

function isMonthToken(value: string): boolean {
  return new RegExp(`^${MONTH_NAME}(?:\\s+de\\s+\\d{4})?$`, 'i').test(foldPt(value));
}

function isNoise(value: string): boolean {
  return /^(?:caixa|mes|esse|este|gasto|gastos|saida|saidas|maior|maiores)$/.test(
    foldPt(value),
  );
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}
