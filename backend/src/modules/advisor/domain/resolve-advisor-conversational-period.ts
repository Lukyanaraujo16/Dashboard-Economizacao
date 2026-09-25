import {
  listAdvisorNamedPeriodKeys,
  resolveAdvisorPeriod,
  type AdvisorPeriodSource,
  type AdvisorResolvedPeriod,
} from './resolve-advisor-period.js';

/**
 * Continuidade temporal da conversa (F13.8.1C).
 * Sem Prisma, HTTP, provider ou LLM.
 *
 * Precedência:
 * período explícito/relativo da PERGUNTA ATUAL
 *   > último período EXPLICIT das mensagens USER anteriores
 *   > mês selecionado do Dashboard
 *   > mês civil atual
 *
 * Mensagens CONSULTANT nunca entram em `priorUserContents`.
 * RELATIVE em mensagens anteriores não é herdado: depende do Dashboard
 * da época e seria reescrito se o seletor mudasse.
 * Dois períodos explícitos SEM intenção comparativa: não herda contexto —
 * preserva o fallback seguro da F13.6.1 (SELECTED/CURRENT).
 *
 * Comparação:
 * - "E comparado com julho?": monthKey = contexto; comparisonMonthKey = mês citado.
 * - dois meses nomeados + intenção comparativa: o par explícito, sem cair no Dashboard.
 * - "comparando esses dois meses" sem mês novo: últimos dois EXPLICIT distintos das USER,
 *   ordenados cronologicamente (mais antigo = comparisonMonthKey).
 */
export const ADVISOR_CONVERSATION_CONTEXT_USER_LIMIT = 40;

export const ADVISOR_CONVERSATIONAL_PERIOD_SOURCES = [
  'EXPLICIT',
  'SELECTED',
  'CURRENT',
  'RELATIVE',
  'CONVERSATION_CONTEXT',
] as const;

export type AdvisorConversationalPeriodSource =
  (typeof ADVISOR_CONVERSATIONAL_PERIOD_SOURCES)[number];

export type ResolveAdvisorConversationalPeriodInput = {
  readonly content: string;
  readonly referenceMonthKey?: string;
  readonly now?: Date;
  readonly priorUserContents?: readonly string[];
};

export type AdvisorConversationalPeriod = {
  readonly monthKey: string;
  readonly source: AdvisorConversationalPeriodSource;
  readonly comparison: boolean;
  readonly comparisonMonthKey?: string;
};

const COMPARISON_PATTERN =
  /\bcompare\b|\bcomparad[oa]s?\b|\bcomparando\b|\bcomparacao\b|\bversus\b|\bvs\.?\b|\bem relacao\s+(?:a|ao|com)\b|\bdiferenca\b|\bvariacao\b|\bcresceu\b/;

export function isAdvisorComparisonQuestion(content: string): boolean {
  return COMPARISON_PATTERN.test(foldPt(content));
}

export function isAdvisorMonthlyFactualCompareQuestion(content: string): boolean {
  const folded = foldPt(content);
  return (
    isAdvisorComparisonQuestion(content) ||
    /\baumentou(?:\s+o)?\s+faturamento\b/.test(folded) ||
    /\bdiferenca(?:\s+de)?\s+faturamento\b/.test(folded) ||
    /\bmaior faturamento\b/.test(folded)
  );
}

export function isAdvisorMonthlyBillingFollowUp(content: string): boolean {
  const folded = foldPt(content);
  return (
    /\bqual(?:\s+dos\s+dois)?\s+mes(?:es)?\b/.test(folded) ||
    /\bqual mes\b/.test(folded) ||
    /\bmaior faturamento\b/.test(folded) ||
    /\bdiferenca(?:\s+de)?\s+faturamento\b/.test(folded) ||
    /\baumentou(?:\s+o)?\s+faturamento\b/.test(folded)
  );
}

export function isInheritableAdvisorPeriodSource(source: AdvisorPeriodSource): boolean {
  return source === 'EXPLICIT';
}

export function resolveAdvisorConversationalPeriod(
  input: ResolveAdvisorConversationalPeriodInput,
): AdvisorConversationalPeriod {
  const current = resolveAdvisorPeriod({
    content: input.content,
    referenceMonthKey: input.referenceMonthKey,
    now: input.now,
  });
  const namedKeys = listAdvisorNamedPeriodKeys({
    content: input.content,
    referenceMonthKey: input.referenceMonthKey,
    now: input.now,
  });
  const inheritable = findInheritableMonthKeys(input);
  const comparison = isAdvisorComparisonQuestion(input.content);

  if (namedKeys.length >= 2) {
    if (comparison || isAdvisorMonthlyFactualCompareQuestion(input.content)) {
      return pairToConversational(namedKeys, 'EXPLICIT');
    }
    return toConversational(current, false);
  }

  if (isCurrentQuestionAuthoritative(current.source)) {
    if (
      comparison &&
      current.source === 'EXPLICIT' &&
      inheritable[0] !== undefined &&
      inheritable[0] !== current.monthKey
    ) {
      return {
        monthKey: inheritable[0],
        source: 'CONVERSATION_CONTEXT',
        comparison: true,
        comparisonMonthKey: current.monthKey,
      };
    }
    return toConversational(current, false);
  }

  if (
    (comparison || isAdvisorMonthlyBillingFollowUp(input.content)) &&
    inheritable.length >= 2
  ) {
    return pairToConversational(inheritable, 'CONVERSATION_CONTEXT');
  }

  if (inheritable[0] !== undefined) {
    return {
      monthKey: inheritable[0],
      source: 'CONVERSATION_CONTEXT',
      comparison: false,
    };
  }

  return toConversational(current, false);
}

function isCurrentQuestionAuthoritative(source: AdvisorPeriodSource): boolean {
  return source === 'EXPLICIT' || source === 'RELATIVE';
}

function findInheritableMonthKeys(
  input: ResolveAdvisorConversationalPeriodInput,
): string[] {
  const priors = input.priorUserContents ?? [];
  const window = priors.slice(-ADVISOR_CONVERSATION_CONTEXT_USER_LIMIT);
  const keys: string[] = [];
  const seen = new Set<string>();
  for (let index = window.length - 1; index >= 0; index -= 1) {
    const content = window[index];
    if (content === undefined || content.trim().length === 0) {
      continue;
    }
    const namedFromPrior = listAdvisorNamedPeriodKeys({
      content,
      referenceMonthKey: input.referenceMonthKey,
      now: input.now,
    });
    if (namedFromPrior.length >= 2 && isAdvisorComparisonQuestion(content)) {
      for (const key of namedFromPrior) {
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        keys.push(key);
      }
      continue;
    }
    const resolved = resolveAdvisorPeriod({
      content,
      referenceMonthKey: input.referenceMonthKey,
      now: input.now,
    });
    if (!isInheritableAdvisorPeriodSource(resolved.source) || seen.has(resolved.monthKey)) {
      continue;
    }
    seen.add(resolved.monthKey);
    keys.push(resolved.monthKey);
  }
  return keys;
}

function pairToConversational(
  keys: readonly string[],
  source: AdvisorConversationalPeriodSource,
): AdvisorConversationalPeriod {
  const unique = [...new Set(keys)].filter((key) => key.length > 0);
  const sorted = [...unique].sort();
  const earlier = sorted[0]!;
  const later = sorted[sorted.length - 1]!;
  if (earlier === later) {
    return {
      monthKey: later,
      source,
      comparison: false,
    };
  }
  return {
    monthKey: later,
    source,
    comparison: true,
    comparisonMonthKey: earlier,
  };
}

function toConversational(
  period: AdvisorResolvedPeriod,
  comparison: boolean,
): AdvisorConversationalPeriod {
  return {
    monthKey: period.monthKey,
    source: period.source,
    comparison,
  };
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
