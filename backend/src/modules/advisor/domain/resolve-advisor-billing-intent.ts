import { foldAdvisorNominalText } from './advisor-nominal-text.js';
import { BILLING_SERIES_MAX_MONTHS } from './billing-month-series.js';
import { isAdvisorInterpretiveQuestion } from './classify-advisor-factual-response.js';
import { isAdvisorMonthlyFactualCompareQuestion } from './resolve-advisor-conversational-period.js';

const BILLING_NOUN =
  /\bfaturament|\bfaturei\b|\bfaturamos\b|\bfaturaram\b|\bfaturou\b|\bfaturado\b/;

const AVERAGE = /\bmedias?\b|\bmedio\b|\bem media\b/;

const OTHER_SUBJECT =
  /\bdespesas?\b|\bgastos?\b|\bpagamentos?\b|\bmetas?\b|\bteto\b/;

/** Lentes que desviam faturamento consolidado (tenant). Centro é tratado no caminho CC. */
const OTHER_LENS_TENANT =
  /\bcentro(?:\s+de\s+custo)?\b|\bcategor|\bconvenio\b|\bfornecedor|\bclientes?\b|\branking\b|\bmaiores\b|\bem aberto\b|\bvencid|\binadimpl|\binterpret|\bmetodolog|\bcom base\b/;

/** Sem cue de centro — usado quando o escopo CC já foi resolvido no catálogo. */
const OTHER_LENS_COST_CENTER =
  /\bcategor|\bconvenio\b|\bfornecedor|\bclientes?\b|\branking\b|\bmaiores\b|\bem aberto\b|\bvencid|\binadimpl|\binterpret|\bmetodolog|\bcom base\b/;

const COUNT_TOKEN =
  '(?:\\d{1,3}|um|uma|dois|duas|tres|quatro|cinco|seis|sete|oito|nove|dez|onze|doze)';

const LAST_MONTHS = new RegExp(`\\bultim[oa]s?\\s+(${COUNT_TOKEN})\\s+meses\\b`);

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
};

export type AdvisorBillingIntent =
  | { readonly kind: 'MONTH_VALUE' }
  | {
      readonly kind: 'MONTH_SERIES';
      readonly count: number;
      readonly wantsAverage: boolean;
    };

function parseCountToken(token: string): number | null {
  if (/^\d+$/.test(token)) {
    const value = Number(token);
    if (!Number.isInteger(value) || value < 1) {
      return null;
    }
    return value;
  }
  return WRITTEN_COUNTS[token] ?? null;
}

function parseLastMonthCount(folded: string): number | null {
  const match = LAST_MONTHS.exec(folded);
  if (match === null || match[1] === undefined) {
    return null;
  }
  return parseCountToken(match[1]);
}

export function hasAdvisorBillingNoun(content: string): boolean {
  return BILLING_NOUN.test(foldAdvisorNominalText(content));
}

function resolveBillingIntentWithLens(
  content: string,
  otherLens: RegExp,
): AdvisorBillingIntent | null {
  if (isAdvisorInterpretiveQuestion(content) || isAdvisorMonthlyFactualCompareQuestion(content)) {
    return null;
  }
  const folded = foldAdvisorNominalText(content);
  if (otherLens.test(folded) || OTHER_SUBJECT.test(folded)) {
    return null;
  }
  const count = parseLastMonthCount(folded);
  const billing = BILLING_NOUN.test(folded);
  const wantsAverage = AVERAGE.test(folded);
  if (count !== null && (billing || wantsAverage)) {
    return { kind: 'MONTH_SERIES', count, wantsAverage };
  }
  if (count !== null || !billing) {
    return null;
  }
  return { kind: 'MONTH_VALUE' };
}

/**
 * Núcleo de faturamento mensal ou série/média dos últimos N meses (escopo empresa).
 * Não casa frase inteira e não captura comparação, meta, drill-down nem snapshot.
 */
export function resolveAdvisorBillingIntent(content: string): AdvisorBillingIntent | null {
  return resolveBillingIntentWithLens(content, OTHER_LENS_TENANT);
}

/**
 * Mesmo núcleo para faturamento com centro explícito já detectado no catálogo.
 * Permite "faturamento do centro X" sem cair em null por causa do cue de centro.
 */
export function resolveAdvisorBillingIntentForCostCenter(
  content: string,
): AdvisorBillingIntent | null {
  return resolveBillingIntentWithLens(content, OTHER_LENS_COST_CENTER);
}

export function billingSeriesExceedsOfficialWindow(count: number): boolean {
  return count > BILLING_SERIES_MAX_MONTHS;
}

const MONTH_NAME =
  '(?:janeiro|fevereiro|marco|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)';

/**
 * Menção textual de centro em pergunta de faturamento.
 * Usada para não cair no consolidado quando o catálogo ainda não marcou FOUND.
 */
export function extractAdvisorBillingCostCenterMention(content: string): string | null {
  const folded = foldAdvisorNominalText(content);
  if (!BILLING_NOUN.test(folded)) {
    return null;
  }
  const patterns = [
    new RegExp(
      `faturament\\w*\\s+do\\s+centro(?:\\s+de\\s+custo)?\\s+(.+?)(?:\\s+em\\s+|\\s+nos\\s+ultim|\\s+do\\s+mes|[?.!]|$)`,
      'i',
    ),
    new RegExp(
      `faturament\\w*(?:\\s+\\w+){0,4}?\\s+de\\s+(.+?)(?:\\s+em\\s+|\\s+nos\\s+ultim|\\s+do\\s+mes|[?.!]|$)`,
      'i',
    ),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(folded);
    const raw = match?.[1]?.trim();
    if (raw === undefined || raw === '') {
      continue;
    }
    const cleaned = raw
      .replace(new RegExp(`\\s+${MONTH_NAME}(?:\\s+de\\s+\\d{4})?.*$`, 'i'), '')
      .replace(/\s+de\s+\d{4}.*$/i, '')
      .replace(/[?.!].*$/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (
      cleaned === '' ||
      new RegExp(`^${MONTH_NAME}(?:\\s+de\\s+\\d{4})?$`, 'i').test(cleaned) ||
      /^(?:centro|centros|custo|mes|esse|este)$/i.test(cleaned)
    ) {
      continue;
    }
    return cleaned;
  }
  return null;
}
