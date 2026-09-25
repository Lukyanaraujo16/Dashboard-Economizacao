import type { AdvisorConversationalPeriod } from './resolve-advisor-conversational-period.js';

export const ADVISOR_CURRENT_SNAPSHOT_INTENT_KINDS = [
  'SNAPSHOT_OPEN_RECEIVABLES',
  'SNAPSHOT_OPEN_PAYABLES',
  'SNAPSHOT_OPEN_BOTH',
  'SNAPSHOT_OVERDUE_RECEIVABLES',
  'SNAPSHOT_OVERDUE_PAYABLES',
  'SNAPSHOT_OVERDUE_BOTH',
  'SNAPSHOT_DELINQUENCY',
  'SNAPSHOT_DUE_TODAY_RECEIVABLES',
  'SNAPSHOT_DUE_TODAY_PAYABLES',
  'SNAPSHOT_DUE_TODAY_BOTH',
  'SNAPSHOT_UPCOMING_RECEIVABLES',
  'SNAPSHOT_UPCOMING_PAYABLES',
  'SNAPSHOT_UPCOMING_BOTH',
] as const;

export type AdvisorCurrentSnapshotIntentKind =
  (typeof ADVISOR_CURRENT_SNAPSHOT_INTENT_KINDS)[number];

/**
 * Intenção de posição financeira atual. Não resolve monthKey.
 * Recusa perguntas históricas, comparação e realizado de período.
 */
export function resolveAdvisorCurrentSnapshotIntent(input: {
  readonly content: string;
  readonly period: Pick<AdvisorConversationalPeriod, 'source' | 'comparison'>;
}): AdvisorCurrentSnapshotIntentKind | null {
  if (input.period.comparison) {
    return null;
  }
  const folded = foldPt(input.content);
  if (/\bcentros?(?:\s+de\s+custo)?\b/.test(folded)) {
    return null;
  }
  if (isHistoricalFinancialGuard(folded, input.period.source)) {
    return null;
  }

  if (/\binadimpl/.test(folded)) {
    return 'SNAPSHOT_DELINQUENCY';
  }

  const receivable = hasReceivableSide(folded);
  const payable = hasPayableSide(folded);

  if (isDueTodayQuestion(folded)) {
    if (receivable && !payable) {
      return 'SNAPSHOT_DUE_TODAY_RECEIVABLES';
    }
    if (payable && !receivable) {
      return 'SNAPSHOT_DUE_TODAY_PAYABLES';
    }
    return 'SNAPSHOT_DUE_TODAY_BOTH';
  }

  if (isUpcomingFutureQuestion(folded)) {
    if (receivable && !payable) {
      return 'SNAPSHOT_UPCOMING_RECEIVABLES';
    }
    if (payable && !receivable) {
      return 'SNAPSHOT_UPCOMING_PAYABLES';
    }
    return 'SNAPSHOT_UPCOMING_BOTH';
  }

  if (isOverdueQuestion(folded)) {
    if (receivable && !payable) {
      return 'SNAPSHOT_OVERDUE_RECEIVABLES';
    }
    if (payable && !receivable) {
      return 'SNAPSHOT_OVERDUE_PAYABLES';
    }
    return 'SNAPSHOT_OVERDUE_BOTH';
  }

  if (isOpenReceivablesQuestion(folded) && !payable) {
    return 'SNAPSHOT_OPEN_RECEIVABLES';
  }
  if (isOpenPayablesQuestion(folded) && !receivable) {
    return 'SNAPSHOT_OPEN_PAYABLES';
  }
  if (isOpenBothQuestion(folded)) {
    return 'SNAPSHOT_OPEN_BOTH';
  }

  return null;
}

export function isAdvisorCurrentSnapshotIntentKind(
  value: string,
): value is AdvisorCurrentSnapshotIntentKind {
  return (ADVISOR_CURRENT_SNAPSHOT_INTENT_KINDS as readonly string[]).includes(value);
}

function isHistoricalFinancialGuard(
  folded: string,
  source: AdvisorConversationalPeriod['source'],
): boolean {
  if (/\b(compare|comparad|comparando|comparacao|versus|\bvs\.?)\b/.test(folded)) {
    return true;
  }
  const namedPeriod = hasNamedPeriodAttribution(folded);
  const inheritedPeriod =
    source === 'EXPLICIT' || source === 'RELATIVE' || source === 'CONVERSATION_CONTEXT';
  const historicalVerb =
    /\b(estava|estavam|estive|foi|foram|recebi|paguei|faturei|faturamento)\b/.test(folded);
  if (historicalVerb && (namedPeriod || inheritedPeriod)) {
    return true;
  }
  if ((namedPeriod || (inheritedPeriod && hasPeriodPreposition(folded))) && !hasCurrentPositionCue(folded)) {
    return true;
  }
  return false;
}

function hasCurrentPositionCue(folded: string): boolean {
  return /\b(hoje|agora|atual|atualmente|neste momento|neste instante)\b/.test(folded);
}

function hasNamedPeriodAttribution(folded: string): boolean {
  return (
    /\b(?:jan(?:eiro)?|fev(?:ereiro)?|mar(?:co)?|abr(?:il)?|mai(?:o)?|jun(?:ho)?|jul(?:ho)?|ago(?:sto)?|set(?:embro)?|out(?:ubro)?|nov(?:embro)?|dez(?:embro)?)\b/.test(
      folded,
    ) || /\b\d{4}-(0[1-9]|1[0-2])\b/.test(folded)
  );
}

function hasPeriodPreposition(folded: string): boolean {
  return /\bem (?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez|\d{4})/.test(folded);
}

function hasReceivableSide(folded: string): boolean {
  return (
    /\b(?:a|para) receber\b/.test(folded) ||
    /\brecebive(?:l|is)\b/.test(folded) ||
    /\bcontas a receber\b/.test(folded)
  );
}

function hasPayableSide(folded: string): boolean {
  return (
    /\b(?:a|para) pagar\b/.test(folded) ||
    /\bpagave(?:l|is)\b/.test(folded) ||
    /\bcontas a pagar\b/.test(folded)
  );
}

function isOpenReceivablesQuestion(folded: string): boolean {
  return (
    /\btenho a receber\b/.test(folded) ||
    /\bcontas a receber(?: em aberto)?\b/.test(folded) ||
    (/\ba receber\b/.test(folded) && (hasCurrentPositionCue(folded) || /\bem aberto\b/.test(folded)))
  );
}

function isOpenPayablesQuestion(folded: string): boolean {
  return (
    /\btenho a pagar\b/.test(folded) ||
    /\bcontas a pagar(?: em aberto)?\b/.test(folded) ||
    (/\ba pagar\b/.test(folded) && (hasCurrentPositionCue(folded) || /\bem aberto\b/.test(folded)))
  );
}

function isOpenBothQuestion(folded: string): boolean {
  return /\bem aberto\b/.test(folded) && !hasReceivableSide(folded) && !hasPayableSide(folded);
}

function isOverdueQuestion(folded: string): boolean {
  return /\bvencid/.test(folded) && !isDueTodayQuestion(folded) && !isUpcomingFutureQuestion(folded);
}

function isDueTodayQuestion(folded: string): boolean {
  return /\bvenc(?:e|em|eu|eram) hoje\b/.test(folded) || /\bvence hoje\b/.test(folded);
}

function isUpcomingFutureQuestion(folded: string): boolean {
  return /\bainda vai vencer\b/.test(folded) || /\ba vencer\b/.test(folded);
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}
