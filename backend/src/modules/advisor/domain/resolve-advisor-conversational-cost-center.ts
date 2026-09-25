import { ADVISOR_DRILLDOWN_DEFAULT_LIMIT } from './advisor-cash-realized-breakdown.js';
import type { AdvisorCashDirection } from './advisor-cash-realized-breakdown.js';
import {
  COMPARE_CASH_COST_CENTER_TOOL_NAME,
  CASH_COST_CENTER_LOOKUP_TOOL_NAME,
  CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
  CASH_COST_CENTER_RANKING_TOOL_NAME,
} from './advisor-cost-center-dimension.js';
import {
  extractAdvisorCostCenterQuery,
  hasAdvisorCostCenterCue,
  resolveAdvisorCostCenterIntent,
} from './resolve-advisor-cost-center-intent.js';
import { listAdvisorNamedPeriodKeys } from './resolve-advisor-period.js';
import {
  isAdvisorComparisonQuestion,
  resolveAdvisorConversationalPeriod,
  type AdvisorConversationalPeriod,
} from './resolve-advisor-conversational-period.js';
import { extractAdvisorDrilldownLimit } from './resolve-advisor-drilldown-intent.js';

export const ADVISOR_COST_CENTER_ANAPHORA_STATUSES = [
  'NONE',
  'RESOLVED',
  'AMBIGUOUS',
  'UNRESOLVED',
  'NEEDS_RANKING_WINNER',
  'ORDINAL_UNSUPPORTED',
] as const;

export type AdvisorCostCenterAnaphoraStatus =
  (typeof ADVISOR_COST_CENTER_ANAPHORA_STATUSES)[number];

export const ADVISOR_COST_CENTER_FOLLOW_UP_KINDS = [
  'COST_CENTER_COMPARE',
  'COST_CENTER_MOVEMENT_LINES',
  'COST_CENTER_LOOKUP',
] as const;

export type AdvisorCostCenterFollowUpKind =
  (typeof ADVISOR_COST_CENTER_FOLLOW_UP_KINDS)[number];

export type AdvisorCostCenterFollowUpIntent = {
  readonly kind: AdvisorCostCenterFollowUpKind;
  readonly toolName:
    | typeof COMPARE_CASH_COST_CENTER_TOOL_NAME
    | typeof CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME
    | typeof CASH_COST_CENTER_LOOKUP_TOOL_NAME;
  readonly direction: AdvisorCashDirection;
  readonly limit: number;
  readonly costCenterQuery?: string;
  readonly monthKey?: string;
  readonly comparisonMonthKey?: string;
};

export type AdvisorConversationalCostCenter = {
  readonly intent: AdvisorCostCenterFollowUpIntent | null;
  readonly anaphora: AdvisorCostCenterAnaphoraStatus;
  readonly needsRankingWinner: boolean;
  readonly rankingQuestion: string | null;
  readonly inheritComparisonTarget: boolean;
  readonly inheritedMonthKey: string | null;
};

const MONTH_NAME =
  '(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)';

/**
 * Continuidade de centro de custo entre turns USER.
 * Não lê texto do assistant. Não altera o resolver temporal global.
 */
export function resolveAdvisorConversationalCostCenter(input: {
  readonly content: string;
  readonly period: AdvisorConversationalPeriod;
  readonly priorUserContents?: readonly string[];
  readonly referenceMonthKey?: string;
  readonly now?: Date;
}): AdvisorConversationalCostCenter {
  const priors = input.priorUserContents ?? [];
  const folded = foldPt(input.content);
  if (isCostCenterOrdinalQuestion(folded)) {
    return {
      intent: null,
      anaphora: 'ORDINAL_UNSUPPORTED',
      needsRankingWinner: false,
      rankingQuestion: null,
      inheritComparisonTarget: false,
      inheritedMonthKey: null,
    };
  }

  const mention = extractAdvisorCostCenterMention(input.content);
  const anaphoric = isCostCenterAnaphoraFollowUp(folded);
  const periodFollowUp = isAdvisorCostCenterPeriodFollowUp(input.content);
  const movement = isCostCenterMovementQuestion(folded);
  const comparison = input.period.comparison || isAdvisorComparisonQuestion(input.content);
  const direction = resolveFollowUpDirection(folded, priors);
  const invitesHistoricalAnchor = currentQuestionAllowsHistoricalCostCenter({
    anaphoric,
    periodFollowUp,
  });
  const anchor = invitesHistoricalAnchor
    ? resolveCostCenterAnchor(priors)
    : { kind: 'none' as const };
  const inherit = shouldInheritComparisonTarget({
    content: input.content,
    period: input.period,
    priors,
    anaphoric,
    periodFollowUp,
    mention,
  });

  if (mention === 'AMBIGUOUS' || (invitesHistoricalAnchor && anchor.kind === 'ambiguous')) {
    return {
      intent: null,
      anaphora: 'AMBIGUOUS',
      needsRankingWinner: false,
      rankingQuestion: null,
      inheritComparisonTarget: false,
      inheritedMonthKey: null,
    };
  }

  const query =
    mention !== null
      ? mention
      : invitesHistoricalAnchor && anchor.kind === 'entity'
        ? anchor.entityQuery
        : undefined;
  const needsWinner = invitesHistoricalAnchor && query === undefined && anchor.kind === 'ranking';

  if (comparison && (mention !== null || anaphoric)) {
    if (direction === null) {
      return emptyConversational();
    }
    if (query === undefined && !needsWinner && !anaphoric) {
      return emptyConversational();
    }
    if (query === undefined && anaphoric && anchor.kind === 'none') {
      return unresolved(inherit);
    }
    const pair = resolveLocalComparisonPair(input.content, input.period, input.now, input.referenceMonthKey);
    return {
      intent: {
        kind: 'COST_CENTER_COMPARE',
        toolName: COMPARE_CASH_COST_CENTER_TOOL_NAME,
        direction,
        limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
        ...(query === undefined ? {} : { costCenterQuery: query }),
        ...(pair === null
          ? {}
          : { monthKey: pair.monthKey, comparisonMonthKey: pair.comparisonMonthKey }),
      },
      anaphora: query !== undefined ? (anaphoric ? 'RESOLVED' : 'NONE') : needsWinner ? 'NEEDS_RANKING_WINNER' : 'UNRESOLVED',
      needsRankingWinner: needsWinner && query === undefined,
      rankingQuestion: needsWinner && query === undefined ? anchor.question : null,
      inheritComparisonTarget: false,
      inheritedMonthKey: null,
    };
  }

  if (movement && (mention !== null || anaphoric)) {
    if (direction === null) {
      return emptyConversational();
    }
    if (query === undefined && !needsWinner && !anaphoric) {
      return emptyConversational();
    }
    if (query === undefined && anaphoric && anchor.kind === 'none') {
      return unresolved(inherit);
    }
    return {
      intent: {
        kind: 'COST_CENTER_MOVEMENT_LINES',
        toolName: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
        direction,
        limit: extractAdvisorDrilldownLimit(folded),
        ...(query === undefined ? {} : { costCenterQuery: query }),
      },
      anaphora: query !== undefined ? (anaphoric ? 'RESOLVED' : 'NONE') : needsWinner ? 'NEEDS_RANKING_WINNER' : 'UNRESOLVED',
      needsRankingWinner: needsWinner && query === undefined,
      rankingQuestion: needsWinner && query === undefined ? anchor.question : null,
      inheritComparisonTarget: inherit.inherit,
      inheritedMonthKey: inherit.monthKey,
    };
  }

  if ((anaphoric || periodFollowUp) && (query !== undefined || needsWinner || anaphoric)) {
    if (direction === null && !periodFollowUp) {
      return emptyConversational();
    }
    const resolvedDirection = direction ?? inheritDirectionFromPriors(priors) ?? 'OUTFLOW';
    if (query === undefined && !needsWinner && anchor.kind === 'none') {
      return unresolved(inherit);
    }
    return {
      intent: {
        kind: 'COST_CENTER_LOOKUP',
        toolName: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
        direction: resolvedDirection,
        limit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
        ...(query === undefined ? {} : { costCenterQuery: query }),
      },
      anaphora: query !== undefined ? 'RESOLVED' : needsWinner ? 'NEEDS_RANKING_WINNER' : 'UNRESOLVED',
      needsRankingWinner: needsWinner && query === undefined,
      rankingQuestion: needsWinner && query === undefined ? anchor.question : null,
      inheritComparisonTarget: inherit.inherit,
      inheritedMonthKey: inherit.monthKey,
    };
  }

  return emptyConversational();
}

export function extractAdvisorCostCenterMention(content: string): string | 'AMBIGUOUS' | null {
  const folded = foldPt(content);
  if (!isCostCenterAnaphoraFollowUp(folded)) {
    const prefixed = extractAdvisorCostCenterQuery(content);
    if (prefixed !== null && !isGenericMention(prefixed)) {
      return prefixed;
    }
  }
  const patterns = [
    new RegExp(
      `(?:saidas?|entradas?|gastos?|despesas?|lancamentos?)\\s+de\\s+(.+?)\\s+(?:em|entre)\\s+${MONTH_NAME}`,
      'i',
    ),
    /quanto\s+(.+?)\s+cresceu/i,
    new RegExp(`gastei\\s+em\\s+(.+?)\\s+em\\s+${MONTH_NAME}`, 'i'),
    new RegExp(
      `compare\\s+(?:as\\s+)?(?:saidas?|entradas?|gastos?)(?:\\s+do\\s+centro)?\\s+(?:de\\s+)?(.+?)\\s+entre`,
      'i',
    ),
    /(?:formaram|compoem|compoe)\s+(?:o\s+)?(?:gasto|total|valor)\s+de\s+(.+?)\s+em/i,
  ];
  const found: string[] = [];
  for (const pattern of patterns) {
    const match = pattern.exec(folded);
    if (match?.[1] === undefined) {
      continue;
    }
    const cleaned = cleanMention(match[1]);
    if (cleaned === null || isMonthToken(cleaned) || isGenericMention(cleaned)) {
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
  if (/\bcentros?(?:\s+de\s+custo)?\b/.test(folded)) {
    return null;
  }
  return null;
}

export function isAdvisorCostCenterPeriodFollowUp(content: string): boolean {
  const folded = foldPt(content).replace(/[?.!]/g, '').trim();
  return /^(?:e em |agora em |e no mes|e nesse mes|e neste mes)/.test(folded);
}

export function isCostCenterOrdinalQuestion(folded: string): boolean {
  return (
    /\b(?:o |a )?(?:primeiro|segunda?|terceir[oa]|quarto|quinto|\d+\s*o)\s+(?:maior\s+)?centros?\b/.test(
      folded,
    ) ||
    (/\b(?:o |a )?(?:segundo|terceiro|quarto|quinto)\b/.test(folded) &&
      /\bcentros?\b/.test(folded))
  );
}

function currentQuestionAllowsHistoricalCostCenter(input: {
  readonly anaphoric: boolean;
  readonly periodFollowUp: boolean;
}): boolean {
  return input.anaphoric || input.periodFollowUp;
}

function isCostCenterAnaphoraFollowUp(folded: string): boolean {
  return (
    /\b(?:nesse|neste|desse|deste|esse|este)\s+centro\b/.test(folded) ||
    /\b(?:as\s+)?(?:maiores?\s+)?(?:saidas?|entradas?|despesas?|lancamentos?)\s+dele\b/.test(
      folded,
    ) ||
    /\bquanto\s+(?:esse centro|ele)\s+teve\b/.test(folded) ||
    /\bquanto\s+cresceu\b/.test(folded)
  );
}

function isCostCenterMovementQuestion(folded: string): boolean {
  return (
    /\blancamentos?\b/.test(folded) ||
    /\bformaram\b/.test(folded) ||
    /\bcompoe(?:m|m)?\b/.test(folded) ||
    /\bcompõem\b/.test(folded) ||
    /\bmaiores?\s+(?:saidas?|entradas?|despesas?)\b/.test(folded)
  );
}

function resolveFollowUpDirection(
  folded: string,
  priors: readonly string[],
): AdvisorCashDirection | null {
  const outflow =
    /\b(saidas?|gasto|gastos|gastei|pagamentos? realizados?|despesas?|paguei)\b/.test(folded);
  const inflow =
    /\b(entradas?|recebi|recebimentos? realizados?)\b/.test(folded);
  if (outflow && !inflow) {
    return 'OUTFLOW';
  }
  if (inflow && !outflow) {
    return 'INFLOW';
  }
  if (/\bcresceu\b/.test(folded) || /\bquanto .+ teve\b/.test(folded)) {
    return inheritDirectionFromPriors(priors) ?? 'OUTFLOW';
  }
  return inheritDirectionFromPriors(priors);
}

function inheritDirectionFromPriors(priors: readonly string[]): AdvisorCashDirection | null {
  for (let index = priors.length - 1; index >= 0; index -= 1) {
    const content = priors[index];
    if (content === undefined) {
      continue;
    }
    const folded = foldPt(content);
    const outflow = /\b(saidas?|gasto|gastos|gastei|despesas?)\b/.test(folded);
    const inflow = /\b(entradas?|recebi|recebimentos?)\b/.test(folded);
    if (outflow && !inflow) {
      return 'OUTFLOW';
    }
    if (inflow && !outflow) {
      return 'INFLOW';
    }
  }
  return null;
}

function resolveCostCenterAnchor(
  priorUserContents: readonly string[],
):
  | { readonly kind: 'none' }
  | { readonly kind: 'entity'; readonly entityQuery: string }
  | { readonly kind: 'ranking'; readonly question: string }
  | { readonly kind: 'ambiguous' } {
  for (let index = priorUserContents.length - 1; index >= 0; index -= 1) {
    const content = priorUserContents[index]!;
    const period = resolveAdvisorConversationalPeriod({ content });
    const ranking = resolveAdvisorCostCenterIntent({ content, period });
    if (ranking?.toolName === CASH_COST_CENTER_RANKING_TOOL_NAME) {
      return { kind: 'ranking', question: content };
    }
    if (hasAdvisorCostCenterCue(content) && isWinnerCue(foldPt(content))) {
      return { kind: 'ranking', question: content };
    }
    const mention = extractAdvisorCostCenterMention(content);
    if (mention === 'AMBIGUOUS') {
      return { kind: 'ambiguous' };
    }
    if (mention !== null) {
      return { kind: 'entity', entityQuery: mention };
    }
  }
  return { kind: 'none' };
}

function shouldInheritComparisonTarget(input: {
  readonly content: string;
  readonly period: AdvisorConversationalPeriod;
  readonly priors: readonly string[];
  readonly anaphoric: boolean;
  readonly periodFollowUp: boolean;
  readonly mention: string | 'AMBIGUOUS' | null;
}): { readonly inherit: boolean; readonly monthKey: string | null } {
  if (input.periodFollowUp) {
    return { inherit: false, monthKey: null };
  }
  const currentNamed = namedMonthInCurrent(input.content);
  if (currentNamed) {
    return { inherit: false, monthKey: null };
  }
  if (!input.anaphoric && input.mention === null) {
    return { inherit: false, monthKey: null };
  }
  const previousCompare = findPreviousCostCenterComparison(input.priors);
  if (previousCompare === null) {
    return { inherit: false, monthKey: null };
  }
  return { inherit: true, monthKey: previousCompare };
}

function namedMonthInCurrent(content: string): boolean {
  const folded = foldPt(content);
  return (
    new RegExp(`\\b${MONTH_NAME}\\b`).test(folded) ||
    /\b\d{4}-(0[1-9]|1[0-2])\b/.test(folded)
  );
}

function findPreviousCostCenterComparison(priors: readonly string[]): string | null {
  for (let index = priors.length - 1; index >= 0; index -= 1) {
    const content = priors[index]!;
    const period = resolveAdvisorConversationalPeriod({ content });
    if (!period.comparison || period.comparisonMonthKey === undefined) {
      continue;
    }
    const mention = extractAdvisorCostCenterMention(content);
    const anaphoric = isCostCenterAnaphoraFollowUp(foldPt(content));
    if (mention !== null || anaphoric || hasAdvisorCostCenterCue(content)) {
      return period.monthKey;
    }
  }
  return null;
}

function cleanMention(value: string): string | null {
  const cleaned = value
    .replace(/\s+do\s+centro(?:\s+de\s+custo)?\s+/i, ' ')
    .replace(/\s+entre\s+.+$/i, '')
    .replace(/\s+em\s+.+$/i, '')
    .replace(/[?.!].*$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned === '' ? null : cleaned;
}

function isMonthToken(value: string): boolean {
  return new RegExp(`^${MONTH_NAME}$`, 'i').test(foldPt(value));
}

function isGenericMention(value: string): boolean {
  const folded = foldPt(value);
  return (
    /^(?:centro|centros|de custo|maior|maiores|esse|este|dele|saidas?|entradas?|gastos?|teve|tem|gastou|cresceu|quanto)$/.test(
      folded,
    ) || /^(?:teve|com)\s+/.test(folded)
  );
}

function isWinnerCue(folded: string): boolean {
  return (
    /\bqual centros? (?:de custo )?(?:teve |com )?(?:a )?maior\b/.test(folded) ||
    /\bcentro(?:s)?(?:\s+de\s+custo)? (?:teve |com )?(?:a )?maior\b/.test(folded)
  );
}

const BARE_MONTHS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bjan(?:eiro)?\b/, '01'],
  [/\bfev(?:ereiro)?\b/, '02'],
  [/\bmar(?:co)?\b/, '03'],
  [/\babr(?:il)?\b/, '04'],
  [/\bmai(?:o)?\b/, '05'],
  [/\bjun(?:ho)?\b/, '06'],
  [/\bjul(?:ho)?\b/, '07'],
  [/\bago(?:sto)?\b/, '08'],
  [/\bset(?:embro)?\b/, '09'],
  [/\bout(?:ubro)?\b/, '10'],
  [/\bnov(?:embro)?\b/, '11'],
  [/\bdez(?:embro)?\b/, '12'],
];

function resolveLocalComparisonPair(
  content: string,
  period: AdvisorConversationalPeriod,
  now: Date | undefined,
  referenceMonthKey: string | undefined,
): { readonly monthKey: string; readonly comparisonMonthKey: string } | null {
  if (period.comparison && period.comparisonMonthKey !== undefined) {
    return { monthKey: period.monthKey, comparisonMonthKey: period.comparisonMonthKey };
  }
  const official = listAdvisorNamedPeriodKeys({ content, now, referenceMonthKey });
  const folded = foldPt(content);
  const year = (official[0] ?? referenceMonthKey ?? period.monthKey).slice(0, 4);
  const keys = new Set(official);
  for (const [pattern, month] of BARE_MONTHS) {
    if (pattern.test(folded)) {
      keys.add(`${year}-${month}`);
    }
  }
  const sorted = [...keys].sort();
  if (sorted.length < 2) {
    return null;
  }
  return {
    comparisonMonthKey: sorted[0]!,
    monthKey: sorted[sorted.length - 1]!,
  };
}

function emptyConversational(): AdvisorConversationalCostCenter {
  return {
    intent: null,
    anaphora: 'NONE',
    needsRankingWinner: false,
    rankingQuestion: null,
    inheritComparisonTarget: false,
    inheritedMonthKey: null,
  };
}

function unresolved(inherit: {
  readonly inherit: boolean;
  readonly monthKey: string | null;
}): AdvisorConversationalCostCenter {
  return {
    intent: null,
    anaphora: 'UNRESOLVED',
    needsRankingWinner: false,
    rankingQuestion: null,
    inheritComparisonTarget: inherit.inherit,
    inheritedMonthKey: inherit.monthKey,
  };
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
