import {
  MAX_REPORT_INCLUSIVE_MONTHS,
  listForwardInclusiveMonthKeys,
  shiftCivilMonthKey,
} from '../../analytics/domain/civil-calendar.js';
import { ADVISOR_DRILLDOWN_DEFAULT_LIMIT } from './advisor-cash-realized-breakdown.js';
import type { AdvisorQuestionAnalyticalDemand, ExplicitCostCenterScope } from './advisor-question-scope.js';
import type { AnalyticalPeriod } from './analytical/analytical-period.js';
import { extractExplicitAdvisorTopNLimit } from './resolve-advisor-drilldown-intent.js';
import {
  isAdvisorComparisonQuestion,
  type AdvisorConversationalPeriod,
} from './resolve-advisor-conversational-period.js';
import { listAdvisorNamedPeriodKeys } from './resolve-advisor-period.js';

/**
 * Interpretação estruturada e compartilhada da pergunta (Marco A2).
 *
 * Um único lugar decide período, cardinalidade e entidade antes dos handlers.
 * Regras:
 * - expressão de período nunca vira parte do nome de uma entidade (spans mascarados);
 * - número de período ("três meses") nunca vira cardinalidade;
 * - centro já resolvido no catálogo do tenant não é reinterpretado por regex;
 * - "últimos N meses" tem uma semântica só: N meses civis inclusivos terminando
 *   no mês de referência da conversa (a mesma do faturamento, `billing.series.months`).
 * Sem Prisma, HTTP, provider ou LLM. Sem tenant: o catálogo chega já escopado.
 */

export const ADVISOR_INTERPRETATION_VERSION = 1 as const;

/** Teto da janela: o mesmo dos relatórios mensais e da série de faturamento. */
export const ADVISOR_MONTH_WINDOW_MAX_MONTHS = MAX_REPORT_INCLUSIVE_MONTHS;

const COUNT_TOKEN =
  '(?:\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';

const WRITTEN_COUNTS: Readonly<Record<string, number>> = {
  um: 1,
  uma: 1,
  dois: 2,
  duas: 2,
  tres: 3,
  quatro: 4,
  cinco: 5,
  seis: 6,
  sete: 7,
  oito: 8,
  nove: 9,
  dez: 10,
  onze: 11,
  doze: 12,
  quinze: 15,
  vinte: 20,
};

const MONTH_FULL_NAMES = [
  'janeiro',
  'fevereiro',
  'marco',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
] as const;

const MONTH_NAME = `(?:${MONTH_FULL_NAMES.join('|')})`;

/** Preposições que pertencem à expressão de período (removidas junto com ela). */
const PERIOD_LEAD =
  '(?:(?:\\b(?:em|de|da|do|no|na|nos|nas|dos|das|durante|ao\\s+longo\\s+d[oa]s?|para|ate|desde|entre)\\s+)?(?:o|a|os|as)?\\s*)';

/** Mesma regra de "últimos N meses" do faturamento (resolve-advisor-billing-intent). */
const LAST_MONTHS = new RegExp(`\\bultim[oa]s?\\s+(${COUNT_TOKEN})\\s+meses\\b`);
const LAST_MONTHS_SPAN = new RegExp(
  `${PERIOD_LEAD}\\bultim[oa]s?\\s+${COUNT_TOKEN}\\s+meses\\b`,
  'g',
);
const N_LAST_MONTHS = new RegExp(`\\b(${COUNT_TOKEN})\\s+ultimos\\s+meses\\b`);
const N_LAST_MONTHS_SPAN = new RegExp(`${PERIOD_LEAD}\\b${COUNT_TOKEN}\\s+ultimos\\s+meses\\b`, 'g');

const RANGE = new RegExp(
  `\\b(?:de|entre|desde)\\s+(${MONTH_NAME})(?:\\s+(?:de\\s+)?(\\d{4}))?\\s+(?:a|ate|e)\\s+(${MONTH_NAME})(?:\\s+(?:de\\s+)?(\\d{4}))?\\b`,
);
const RANGE_SPAN = new RegExp(
  `${PERIOD_LEAD}\\b(?:de|entre|desde)\\s+${MONTH_NAME}(?:\\s+(?:de\\s+)?\\d{4})?\\s+(?:a|ate|e)\\s+${MONTH_NAME}(?:\\s+(?:de\\s+)?\\d{4})?\\b`,
  'g',
);

const ANAPHORA_SPAN = new RegExp(
  `${PERIOD_LEAD}\\b(?:nesse|neste|naquele|desse|deste|daquele|mesmo|nesses|nestes|desses|destes)\\s+(?:mesmo\\s+)?(?:periodo|intervalo|recorte|janela|(?:${COUNT_TOKEN}\\s+)?meses)\\b`,
  'g',
);

const QUARTER_SPAN = new RegExp(
  `${PERIOD_LEAD}\\b(?:(?:ultimo|este|neste|nesse|deste|desse|proximo|primeiro|segundo|terceiro|quarto)\\s+)?trimestre(?:\\s+(?:passado|atual|anterior))?\\b`,
  'g',
);
const SEMESTER_SPAN = new RegExp(
  `${PERIOD_LEAD}\\b(?:(?:ultimo|este|neste|nesse|deste|desse|primeiro|segundo)\\s+)?semestre(?:\\s+(?:passado|atual|anterior))?\\b`,
  'g',
);
const YEAR_SPAN = new RegExp(
  `${PERIOD_LEAD}\\b(?:(?:este|neste|nesse|deste|desse|ultimo)\\s+ano|ano\\s+(?:passado|atual|anterior))\\b`,
  'g',
);
/** "último mês" sem número: não há regra oficial (mês passado × mês corrente). */
const BARE_LAST_MONTH_SPAN = new RegExp(`${PERIOD_LEAD}\\bultimo\\s+mes\\b`, 'g');

const MONTH_SPANS: readonly RegExp[] = [
  new RegExp(`${PERIOD_LEAD}\\b(?:mes\\s+de\\s+)?${MONTH_NAME}(?:\\s*(?:de\\s*)?\\d{4}|\\s*/\\s*\\d{4})?\\b`, 'g'),
  new RegExp(`${PERIOD_LEAD}\\b\\d{4}-(?:0[1-9]|1[0-2])\\b`, 'g'),
  new RegExp(`${PERIOD_LEAD}\\b(?:0?[1-9]|1[0-2])/\\d{4}\\b`, 'g'),
  new RegExp(`${PERIOD_LEAD}\\b(?:este|neste|nesse|deste|desse)\\s+mes\\b`, 'g'),
  new RegExp(`${PERIOD_LEAD}\\bmes\\s+(?:passado|anterior|atual|corrente)\\b`, 'g'),
];

export type AdvisorTextSpan = { readonly start: number; readonly end: number };

export type AdvisorPeriodExpression =
  /** A pergunta não menciona período: vale o período conversacional (default oficial). */
  | { readonly kind: 'NONE' }
  /**
   * Um mês: explícito ("em setembro"), relativo ("mês passado") ou corrente ("este mês").
   * O mês em si é decidido pelo resolvedor oficial (`resolveAdvisorConversationalPeriod`).
   */
  | { readonly kind: 'MONTH' }
  | {
      readonly kind: 'MONTH_WINDOW';
      readonly endMonthKey: string;
      readonly count: number;
      readonly form: 'LAST_N_MONTHS' | 'EXPLICIT_RANGE';
    }
  /** "nesse período", "no mesmo período": herda o período da investigação anterior. */
  | { readonly kind: 'ANAPHORA' }
  /** Granularidade sem regra oficial para esta interpretação (não vira mês silenciosamente). */
  | {
      readonly kind: 'UNSUPPORTED';
      readonly reason:
        | 'QUARTER'
        | 'SEMESTER'
        | 'YEAR'
        | 'AMBIGUOUS_LAST_MONTH'
        | 'WINDOW_TOO_LARGE'
        | 'INVALID_RANGE';
    };

export type AdvisorParsedPeriod = {
  readonly expression: AdvisorPeriodExpression;
  /** Spans no texto dobrado (`foldAdvisorInterpretationText`). */
  readonly spans: readonly AdvisorTextSpan[];
};

export type AdvisorRankingCardinality =
  | { readonly kind: 'NONE' }
  | { readonly kind: 'TOP_1'; readonly limit: 1; readonly source: 'SINGULAR' }
  | {
      readonly kind: 'TOP_N';
      readonly limit: number;
      readonly source: 'EXPLICIT_NUMBER' | 'WRITTEN_NUMBER' | 'DEFAULT_PLURAL';
    };

export type AdvisorEntityInterpretation =
  | { readonly status: 'ABSENT' }
  /** Resolvido no catálogo do tenant: handlers usam o nome oficial, sem reextrair. */
  | {
      readonly status: 'RESOLVED';
      readonly dimension: 'COST_CENTER';
      readonly source: 'CATALOG';
      readonly mention: string;
      readonly officialName: string;
    }
  | {
      readonly status: 'AMBIGUOUS';
      readonly dimension: 'COST_CENTER';
      readonly source: 'CATALOG';
      readonly mention: string;
      readonly candidates: readonly { readonly name: string; readonly code: string | null }[];
    };

export type AdvisorResolvedPeriod =
  | { readonly kind: 'MONTH'; readonly monthKey: string; readonly origin: AdvisorPeriodOrigin }
  | {
      readonly kind: 'MONTH_WINDOW';
      readonly endMonthKey: string;
      readonly count: number;
      readonly origin: AdvisorPeriodOrigin;
    };

export type AdvisorPeriodOrigin = 'QUESTION' | 'INHERITED' | 'CONVERSATION_DEFAULT';

export type AdvisorQuestionInterpretation = {
  readonly version: typeof ADVISOR_INTERPRETATION_VERSION;
  /** Métrica pedida (nunca inferida por herança). null = não determinada aqui. */
  readonly metric: 'BILLING' | 'REALIZED_CASH' | null;
  readonly direction: 'INFLOW' | 'OUTFLOW' | null;
  readonly cardinality: AdvisorRankingCardinality;
  readonly entity: AdvisorEntityInterpretation;
  readonly periodExpression: AdvisorPeriodExpression;
  /** Período efetivo; null quando a expressão é UNSUPPORTED ou ANAPHORA sem herança. */
  readonly period: AdvisorResolvedPeriod | null;
  readonly status: 'COMPLETE' | 'NEEDS_CLARIFICATION' | 'UNSUPPORTED_PERIOD';
  readonly ambiguities: readonly ('ENTITY' | 'PERIOD_ANAPHORA_WITHOUT_CONTEXT')[];
  /** Texto dobrado com as expressões de período mascaradas (para extratores legados). */
  readonly maskedContent: string;
};

/** Mesma dobra dos extratores de família: sem acento, minúsculo, pontuação preservada. */
export function foldAdvisorInterpretationText(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/**
 * Quantidade de "últimos N meses". Fonte única para faturamento e demais famílias.
 */
export function parseAdvisorLastMonthsCount(folded: string): number | null {
  const match = LAST_MONTHS.exec(folded) ?? N_LAST_MONTHS.exec(folded);
  if (match?.[1] === undefined) {
    return null;
  }
  return parseCountToken(match[1]);
}

/**
 * Meses civis inclusivos terminando em `endMonthKey`, do mais antigo ao mais recente.
 * `count` 3 e fim 2026-10 → 2026-08, 2026-09, 2026-10.
 */
export function listAdvisorMonthWindowKeys(endMonthKey: string, count: number): readonly string[] {
  if (!Number.isInteger(count) || count < 1 || count > ADVISOR_MONTH_WINDOW_MAX_MONTHS) {
    throw new Error('janela de meses inválida.');
  }
  const start = shiftCivilMonthKey(endMonthKey, -(count - 1));
  return listForwardInclusiveMonthKeys(start, count);
}

/**
 * Expressão de período da pergunta atual + spans para mascarar.
 * `anchorMonthKey` é o mês conversacional já resolvido (fim oficial da janela).
 */
export function parseAdvisorPeriodExpression(input: {
  readonly content: string;
  readonly anchorMonthKey: string;
  readonly referenceMonthKey?: string;
  readonly now?: Date;
}): AdvisorParsedPeriod {
  const folded = foldAdvisorInterpretationText(input.content);
  const spans: AdvisorTextSpan[] = [];
  const collect = (pattern: RegExp): boolean => {
    let found = false;
    for (const match of folded.matchAll(pattern)) {
      if (match.index === undefined) {
        continue;
      }
      spans.push({ start: match.index, end: match.index + match[0].length });
      found = true;
    }
    return found;
  };

  const hasLastN = collect(LAST_MONTHS_SPAN) || collect(N_LAST_MONTHS_SPAN);
  const comparison = isAdvisorComparisonQuestion(input.content);
  const hasRange = !comparison && collect(RANGE_SPAN);
  const hasAnaphora = collect(ANAPHORA_SPAN);
  const hasQuarter = collect(QUARTER_SPAN);
  const hasSemester = collect(SEMESTER_SPAN);
  const hasYear = collect(YEAR_SPAN);
  const hasBareLastMonth = collect(BARE_LAST_MONTH_SPAN);
  let hasMonth = false;
  for (const pattern of MONTH_SPANS) {
    hasMonth = collect(pattern) || hasMonth;
  }
  const merged = mergeSpans(spans);

  if (hasLastN) {
    const count = parseAdvisorLastMonthsCount(folded);
    if (count === null) {
      return { expression: { kind: 'UNSUPPORTED', reason: 'INVALID_RANGE' }, spans: merged };
    }
    if (count > ADVISOR_MONTH_WINDOW_MAX_MONTHS) {
      return { expression: { kind: 'UNSUPPORTED', reason: 'WINDOW_TOO_LARGE' }, spans: merged };
    }
    return {
      expression: {
        kind: 'MONTH_WINDOW',
        endMonthKey: input.anchorMonthKey,
        count,
        form: 'LAST_N_MONTHS',
      },
      spans: merged,
    };
  }
  if (hasRange) {
    return { expression: parseRange(folded, input), spans: merged };
  }
  if (hasQuarter) {
    return { expression: { kind: 'UNSUPPORTED', reason: 'QUARTER' }, spans: merged };
  }
  if (hasSemester) {
    return { expression: { kind: 'UNSUPPORTED', reason: 'SEMESTER' }, spans: merged };
  }
  if (hasYear) {
    return { expression: { kind: 'UNSUPPORTED', reason: 'YEAR' }, spans: merged };
  }
  if (hasAnaphora) {
    return { expression: { kind: 'ANAPHORA' }, spans: merged };
  }
  if (hasBareLastMonth) {
    return { expression: { kind: 'UNSUPPORTED', reason: 'AMBIGUOUS_LAST_MONTH' }, spans: merged };
  }
  if (hasMonth) {
    return { expression: { kind: 'MONTH' }, spans: merged };
  }
  return { expression: { kind: 'NONE' }, spans: merged };
}

/** Substitui as expressões de período por espaços (mesmo comprimento). */
export function maskAdvisorTextSpans(folded: string, spans: readonly AdvisorTextSpan[]): string {
  let masked = folded;
  for (const span of spans) {
    masked =
      masked.slice(0, span.start) + ' '.repeat(span.end - span.start) + masked.slice(span.end);
  }
  return masked;
}

/**
 * Cardinalidade de ranking de lançamentos. Deve receber o texto já mascarado:
 * números de período não chegam aqui.
 */
export function parseAdvisorRankingCardinality(maskedFolded: string): AdvisorRankingCardinality {
  const explicit = extractExplicitAdvisorTopNLimit(maskedFolded);
  if (explicit !== null) {
    return explicit === 1
      ? { kind: 'TOP_1', limit: 1, source: 'SINGULAR' }
      : { kind: 'TOP_N', limit: explicit, source: 'EXPLICIT_NUMBER' };
  }
  const writtenWords = Object.keys(WRITTEN_COUNTS).join('|');
  const written =
    new RegExp(
      `\\b(${writtenWords})\\s+(?:maiores|principais|gastos|despesas|saidas|lancamentos|pagamentos)\\b`,
    ).exec(maskedFolded) ?? new RegExp(`\\btop\\s+(${writtenWords})\\b`).exec(maskedFolded);
  if (written?.[1] !== undefined) {
    const value = WRITTEN_COUNTS[written[1]];
    if (value !== undefined) {
      return value === 1
        ? { kind: 'TOP_1', limit: 1, source: 'SINGULAR' }
        : { kind: 'TOP_N', limit: value, source: 'WRITTEN_NUMBER' };
    }
  }
  const noun = '(?:gastos?|despesas?|saidas?|lancamentos?|pagamentos?)';
  const plural =
    new RegExp(`\\bmaiores\\s+${noun}\\b`).test(maskedFolded) ||
    new RegExp(`\\b${noun}\\s+mais\\s+(?:altos|altas|caros|caras)\\b`).test(maskedFolded);
  if (plural) {
    return { kind: 'TOP_N', limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT, source: 'DEFAULT_PLURAL' };
  }
  const singular =
    new RegExp(`\\bmaior\\s+${noun}\\b`).test(maskedFolded) ||
    new RegExp(`\\b${noun}\\s+mais\\s+(?:alto|alta|caro|cara)\\b`).test(maskedFolded);
  if (singular) {
    return { kind: 'TOP_1', limit: 1, source: 'SINGULAR' };
  }
  return { kind: 'NONE' };
}

/**
 * Entidade de centro de custo a partir do escopo do catálogo do tenant
 * (`detectExplicitCostCenterScope`). ABSENT significa: o catálogo não confirmou
 * nenhum centro; um handler pode tentar a menção textual, que a tool verifica.
 */
export function interpretAdvisorCostCenterEntity(
  scope: ExplicitCostCenterScope,
): AdvisorEntityInterpretation {
  if (scope.status === 'FOUND') {
    return {
      status: 'RESOLVED',
      dimension: 'COST_CENTER',
      source: 'CATALOG',
      mention: scope.query,
      officialName: scope.resolvedName,
    };
  }
  if (scope.status === 'AMBIGUOUS') {
    return {
      status: 'AMBIGUOUS',
      dimension: 'COST_CENTER',
      source: 'CATALOG',
      mention: scope.query,
      candidates: scope.candidates,
    };
  }
  return { status: 'ABSENT' };
}

/**
 * Contrato único: o orquestrador calcula uma vez e repassa aos handlers.
 * `inheritedPeriod` é o período da investigação anterior (para "nesse período").
 */
export function interpretAdvisorQuestion(input: {
  readonly content: string;
  readonly conversationalPeriod: AdvisorConversationalPeriod;
  readonly demand: Pick<
    AdvisorQuestionAnalyticalDemand,
    'explicitCostCenter' | 'wantsOutflow' | 'wantsInflow' | 'wantsBilling'
  >;
  readonly inheritedPeriod?: AnalyticalPeriod | null;
  readonly referenceMonthKey?: string;
  readonly now?: Date;
}): AdvisorQuestionInterpretation {
  const parsed = parseAdvisorPeriodExpression({
    content: input.content,
    anchorMonthKey: input.conversationalPeriod.monthKey,
    referenceMonthKey: input.referenceMonthKey,
    now: input.now,
  });
  const maskedContent = maskAdvisorTextSpans(
    foldAdvisorInterpretationText(input.content),
    parsed.spans,
  );
  const entity = interpretAdvisorCostCenterEntity(input.demand.explicitCostCenter);
  const cardinality = parseAdvisorRankingCardinality(maskedContent);
  const ambiguities: Array<'ENTITY' | 'PERIOD_ANAPHORA_WITHOUT_CONTEXT'> = [];
  if (entity.status === 'AMBIGUOUS') {
    ambiguities.push('ENTITY');
  }

  let period: AdvisorResolvedPeriod | null = null;
  let status: AdvisorQuestionInterpretation['status'] = 'COMPLETE';
  const expression = parsed.expression;
  if (expression.kind === 'MONTH_WINDOW') {
    period = {
      kind: 'MONTH_WINDOW',
      endMonthKey: expression.endMonthKey,
      count: expression.count,
      origin: 'QUESTION',
    };
  } else if (expression.kind === 'MONTH') {
    period = {
      kind: 'MONTH',
      monthKey: input.conversationalPeriod.monthKey,
      origin: 'QUESTION',
    };
  } else if (expression.kind === 'ANAPHORA') {
    period = inheritedResolvedPeriod(input.inheritedPeriod ?? null);
    if (period === null) {
      ambiguities.push('PERIOD_ANAPHORA_WITHOUT_CONTEXT');
    }
  } else if (expression.kind === 'UNSUPPORTED') {
    status = 'UNSUPPORTED_PERIOD';
  } else {
    period = {
      kind: 'MONTH',
      monthKey: input.conversationalPeriod.monthKey,
      origin: 'CONVERSATION_DEFAULT',
    };
  }
  if (status === 'COMPLETE' && ambiguities.length > 0) {
    status = 'NEEDS_CLARIFICATION';
  }

  const metric = input.demand.wantsOutflow
    ? 'REALIZED_CASH'
    : input.demand.wantsBilling
      ? 'BILLING'
      : input.demand.wantsInflow
        ? 'REALIZED_CASH'
        : null;
  const direction = input.demand.wantsOutflow
    ? 'OUTFLOW'
    : !input.demand.wantsBilling && input.demand.wantsInflow
      ? 'INFLOW'
      : null;

  return {
    version: ADVISOR_INTERPRETATION_VERSION,
    metric,
    direction,
    cardinality,
    entity,
    periodExpression: expression,
    period,
    status,
    ambiguities,
    maskedContent,
  };
}

/** Período herdável (MONTH ou MONTH_WINDOW) de uma investigação anterior. */
export function inheritedResolvedPeriod(
  period: AnalyticalPeriod | null,
): AdvisorResolvedPeriod | null {
  if (period === null) {
    return null;
  }
  if (period.kind === 'MONTH') {
    return { kind: 'MONTH', monthKey: period.monthKey, origin: 'INHERITED' };
  }
  if (period.kind === 'MONTH_WINDOW') {
    return {
      kind: 'MONTH_WINDOW',
      endMonthKey: period.endMonthKey,
      count: period.count,
      origin: 'INHERITED',
    };
  }
  return null;
}

function parseRange(
  folded: string,
  input: { readonly anchorMonthKey: string; readonly referenceMonthKey?: string; readonly now?: Date },
): AdvisorPeriodExpression {
  const match = RANGE.exec(folded);
  if (match === null) {
    return { kind: 'UNSUPPORTED', reason: 'INVALID_RANGE' };
  }
  const fromMonth = monthNumber(match[1] ?? '');
  const toMonth = monthNumber(match[3] ?? '');
  if (fromMonth === null || toMonth === null) {
    return { kind: 'UNSUPPORTED', reason: 'INVALID_RANGE' };
  }
  // Ano: o explícito; senão o mesmo fallback oficial dos meses nomeados (referência/civil).
  const fallbackYear =
    listAdvisorNamedPeriodKeys({
      content: match[3] ?? '',
      referenceMonthKey: input.referenceMonthKey,
      now: input.now,
    })[0]?.slice(0, 4) ?? input.anchorMonthKey.slice(0, 4);
  const toYear = Number(match[4] ?? match[2] ?? fallbackYear);
  const fromYear =
    match[2] !== undefined ? Number(match[2]) : fromMonth > toMonth ? toYear - 1 : toYear;
  const count = (toYear - fromYear) * 12 + (toMonth - fromMonth) + 1;
  if (count < 1) {
    return { kind: 'UNSUPPORTED', reason: 'INVALID_RANGE' };
  }
  if (count > ADVISOR_MONTH_WINDOW_MAX_MONTHS) {
    return { kind: 'UNSUPPORTED', reason: 'WINDOW_TOO_LARGE' };
  }
  const endMonthKey = `${String(toYear).padStart(4, '0')}-${String(toMonth).padStart(2, '0')}`;
  return { kind: 'MONTH_WINDOW', endMonthKey, count, form: 'EXPLICIT_RANGE' };
}

function monthNumber(name: string): number | null {
  const index = (MONTH_FULL_NAMES as readonly string[]).indexOf(name);
  return index < 0 ? null : index + 1;
}

function parseCountToken(token: string): number | null {
  if (/^\d+$/.test(token)) {
    const value = Number(token);
    return Number.isInteger(value) && value >= 1 ? value : null;
  }
  return WRITTEN_COUNTS[token] ?? null;
}

function mergeSpans(spans: readonly AdvisorTextSpan[]): AdvisorTextSpan[] {
  const sorted = [...spans].sort((left, right) => left.start - right.start || right.end - left.end);
  const merged: AdvisorTextSpan[] = [];
  for (const span of sorted) {
    const last = merged[merged.length - 1];
    if (last !== undefined && span.start <= last.end) {
      merged[merged.length - 1] = { start: last.start, end: Math.max(last.end, span.end) };
      continue;
    }
    merged.push(span);
  }
  return merged;
}
