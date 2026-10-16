import { foldAdvisorNominalText } from './advisor-nominal-text.js';
import { parseAdvisorLastMonthsCount } from './advisor-question-interpretation.js';
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

export type AdvisorBillingIntent =
  | { readonly kind: 'MONTH_VALUE' }
  | {
      readonly kind: 'MONTH_SERIES';
      readonly count: number;
      readonly wantsAverage: boolean;
    };

/** Fonte única de "últimos N meses" (mesma semântica em todas as famílias). */
function parseLastMonthCount(folded: string): number | null {
  return parseAdvisorLastMonthsCount(folded);
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
