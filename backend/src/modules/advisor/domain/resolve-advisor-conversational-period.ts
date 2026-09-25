import {
  countAdvisorNamedPeriods,
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
 * Dois períodos explícitos na pergunta atual: não herda contexto —
 * preserva o fallback seguro da F13.6.1 (SELECTED/CURRENT).
 *
 * Comparação ("E comparado com julho?"): monthKey oficial permanece o
 * contexto da conversa; comparisonMonthKey é o outro mês citado.
 * O Context Builder atual carrega um único monthKey — fatos oficiais
 * do segundo período ficam ABSENT até subfase própria.
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
  /\bcomparad[oa]s?\b|\bcomparacao\b|\bversus\b|\bvs\.?\b|\bem relacao\s+(?:a|ao|com)\b/;

export function isAdvisorComparisonQuestion(content: string): boolean {
  return COMPARISON_PATTERN.test(foldPt(content));
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
  const context = findConversationContext(input);
  const comparison = isAdvisorComparisonQuestion(input.content);

  if (countAdvisorNamedPeriods(input.content) >= 2) {
    return toConversational(current, comparison);
  }

  if (isCurrentQuestionAuthoritative(current.source)) {
    if (
      comparison &&
      current.source === 'EXPLICIT' &&
      context !== undefined &&
      context.monthKey !== current.monthKey
    ) {
      return {
        monthKey: context.monthKey,
        source: 'CONVERSATION_CONTEXT',
        comparison: true,
        comparisonMonthKey: current.monthKey,
      };
    }
    return toConversational(current, false);
  }

  if (context !== undefined) {
    return {
      monthKey: context.monthKey,
      source: 'CONVERSATION_CONTEXT',
      comparison: false,
    };
  }

  return toConversational(current, false);
}

function isCurrentQuestionAuthoritative(source: AdvisorPeriodSource): boolean {
  return source === 'EXPLICIT' || source === 'RELATIVE';
}

function findConversationContext(
  input: ResolveAdvisorConversationalPeriodInput,
): AdvisorResolvedPeriod | undefined {
  const priors = input.priorUserContents ?? [];
  const window = priors.slice(-ADVISOR_CONVERSATION_CONTEXT_USER_LIMIT);
  for (let index = window.length - 1; index >= 0; index -= 1) {
    const content = window[index];
    if (content === undefined || content.trim().length === 0) {
      continue;
    }
    const resolved = resolveAdvisorPeriod({
      content,
      referenceMonthKey: input.referenceMonthKey,
      now: input.now,
    });
    if (isInheritableAdvisorPeriodSource(resolved.source)) {
      return resolved;
    }
  }
  return undefined;
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
