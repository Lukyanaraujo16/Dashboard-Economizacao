import { Prisma } from '../../../generated/prisma/client.js';
import { formatAdvisorCivilDate } from './financial-facts-text.js';
import {
  ADVISOR_CASH_INFLOW_MEANING,
  ADVISOR_CASH_OUTFLOW_MEANING,
} from './financial-facts-text.js';
import type { AdvisorCashDirection } from './advisor-cash-realized-breakdown.js';

export const CASH_MOVEMENT_LINES_TOOL_NAME = 'cash_movement_lines';

export const ADVISOR_MOVEMENT_SORTS = ['AMOUNT_DESC', 'DATE_DESC'] as const;
export type AdvisorCashMovementSort = (typeof ADVISOR_MOVEMENT_SORTS)[number];

export const ADVISOR_MOVEMENT_STATUSES = ['OK', 'EMPTY_RESULT', 'UNAVAILABLE'] as const;
export type AdvisorMovementStatus = (typeof ADVISOR_MOVEMENT_STATUSES)[number];

export const ADVISOR_MOVEMENT_TEXT_MAX = 160;

export type AdvisorCashMovementSourceLine = {
  readonly date: Date;
  readonly amount: Prisma.Decimal;
  readonly description: string | null;
  readonly partyName: string | null;
  readonly categoryNames: readonly string[];
  readonly costCenterNames: readonly string[];
  readonly tieBreak?: string;
};

export type AdvisorCashMovementSource = {
  readonly available: boolean;
  readonly items: readonly AdvisorCashMovementSourceLine[];
};

export type AdvisorCashMovementLine = {
  readonly date: string;
  readonly amount: Prisma.Decimal;
  readonly description: string | null;
  readonly partyName: string | null;
  readonly categoryNames: readonly string[];
  readonly costCenterNames: readonly string[];
};

export type AdvisorCashMovementWindow = {
  readonly monthKey: string;
  readonly scope: 'PERIOD';
  readonly direction: AdvisorCashDirection;
  readonly sort: AdvisorCashMovementSort;
  readonly status: AdvisorMovementStatus;
  readonly requestedLimit: number;
  readonly effectiveLimit: number;
  readonly returnedCount: number;
  readonly hasMore: boolean;
  readonly lines: readonly AdvisorCashMovementLine[];
};

export function isAdvisorCashMovementSort(value: string): value is AdvisorCashMovementSort {
  return (ADVISOR_MOVEMENT_SORTS as readonly string[]).includes(value);
}

/**
 * Janela limitada de movimentações oficiais já atribuídas.
 * Não agrega por party, description, convênio ou unidade.
 */
export function rankAdvisorCashMovementLines(input: {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly sort: AdvisorCashMovementSort;
  readonly requestedLimit: number;
  readonly effectiveLimit: number;
  readonly source: AdvisorCashMovementSource;
}): AdvisorCashMovementWindow {
  if (!input.source.available) {
    return {
      monthKey: input.monthKey,
      scope: 'PERIOD',
      direction: input.direction,
      sort: input.sort,
      status: 'UNAVAILABLE',
      requestedLimit: input.requestedLimit,
      effectiveLimit: input.effectiveLimit,
      returnedCount: 0,
      hasMore: false,
      lines: [],
    };
  }

  const sorted = [...input.source.items].sort((left, right) =>
    compareMovementLines(left, right, input.sort),
  );
  const window = sorted.slice(0, input.effectiveLimit);

  return {
    monthKey: input.monthKey,
    scope: 'PERIOD',
    direction: input.direction,
    sort: input.sort,
    status: window.length === 0 ? 'EMPTY_RESULT' : 'OK',
    requestedLimit: input.requestedLimit,
    effectiveLimit: input.effectiveLimit,
    returnedCount: window.length,
    hasMore: sorted.length > window.length,
    lines: window.map(toPublicLine),
  };
}

export function serializeAdvisorCashMovementLines(
  value: AdvisorCashMovementWindow,
): Record<string, unknown> {
  return {
    status: value.status,
    monthKey: value.monthKey,
    scope: value.scope,
    direction: value.direction,
    sort: value.sort,
    realizedMeaning:
      value.direction === 'INFLOW' ? ADVISOR_CASH_INFLOW_MEANING : ADVISOR_CASH_OUTFLOW_MEANING,
    windowKind: 'TOP_N_INDIVIDUAL_MOVEMENTS',
    populationComplete: false,
    notAPartyRanking: true,
    notAConvenioRanking: true,
    requestedLimit: value.requestedLimit,
    effectiveLimit: value.effectiveLimit,
    returnedCount: value.returnedCount,
    hasMore: value.hasMore,
    lines: value.lines.map((line) => ({
      date: line.date,
      amount: line.amount.toString(),
      description: line.description,
      partyName: line.partyName,
      categoryNames: [...line.categoryNames],
      costCenterNames: [...line.costCenterNames],
    })),
  };
}

export function clipAdvisorToolText(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === '') {
    return null;
  }
  if (trimmed.length <= ADVISOR_MOVEMENT_TEXT_MAX) {
    return trimmed;
  }
  return `${trimmed.slice(0, ADVISOR_MOVEMENT_TEXT_MAX)}…`;
}

function toPublicLine(item: AdvisorCashMovementSourceLine): AdvisorCashMovementLine {
  return {
    date: formatAdvisorCivilDate(item.date),
    amount: item.amount,
    description: clipAdvisorToolText(item.description),
    partyName: clipAdvisorToolText(item.partyName),
    categoryNames: item.categoryNames.map((name) => clipAdvisorToolText(name) ?? name),
    costCenterNames: item.costCenterNames.map((name) => clipAdvisorToolText(name) ?? name),
  };
}

function compareMovementLines(
  left: AdvisorCashMovementSourceLine,
  right: AdvisorCashMovementSourceLine,
  sort: AdvisorCashMovementSort,
): number {
  if (sort === 'AMOUNT_DESC') {
    const byAmount = right.amount.comparedTo(left.amount);
    if (byAmount !== 0) {
      return byAmount;
    }
  }
  const byDate = right.date.getTime() - left.date.getTime();
  if (byDate !== 0) {
    return byDate;
  }
  const leftTie = left.tieBreak ?? '';
  const rightTie = right.tieBreak ?? '';
  const byTie = leftTie.localeCompare(rightTie);
  if (byTie !== 0) {
    return byTie;
  }
  return (left.description ?? '').localeCompare(right.description ?? '', 'pt-BR');
}
