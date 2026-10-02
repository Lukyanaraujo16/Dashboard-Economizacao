import { foldAdvisorNominalText } from './advisor-nominal-text.js';
import { BILLING_SERIES_MAX_MONTHS } from './billing-month-series.js';
import { isAdvisorInterpretiveQuestion } from './classify-advisor-factual-response.js';
import { isAdvisorMonthlyFactualCompareQuestion } from './resolve-advisor-conversational-period.js';

const BILLING_NOUN =
  /\bfaturament|\bfaturei\b|\bfaturamos\b|\bfaturaram\b|\bfaturou\b|\bfaturado\b/;

const AVERAGE = /\bmedias?\b|\bmedio\b|\bem media\b/;

const OTHER_SUBJECT =
  /\bdespesas?\b|\bgastos?\b|\bpagamentos?\b|\bmetas?\b|\bteto\b/;

const OTHER_LENS =
  /\bcentro(?:\s+de\s+custo)?\b|\bcategor|\bconvenio\b|\bfornecedor|\bclientes?\b|\branking\b|\bmaiores\b|\bem aberto\b|\bvencid|\binadimpl|\binterpret|\bmetodolog|\bcom base\b/;

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

/**
 * Núcleo de faturamento mensal ou série/média dos últimos N meses.
 * Não casa frase inteira e não captura comparação, meta, drill-down nem snapshot.
 */
export function resolveAdvisorBillingIntent(content: string): AdvisorBillingIntent | null {
  if (isAdvisorInterpretiveQuestion(content) || isAdvisorMonthlyFactualCompareQuestion(content)) {
    return null;
  }
  const folded = foldAdvisorNominalText(content);
  if (OTHER_LENS.test(folded) || OTHER_SUBJECT.test(folded)) {
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

export function billingSeriesExceedsOfficialWindow(count: number): boolean {
  return count > BILLING_SERIES_MAX_MONTHS;
}
