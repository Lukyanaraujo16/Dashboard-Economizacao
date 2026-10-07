import { Prisma } from '../../../generated/prisma/client.js';
import { formatAdvisorCivilDate } from './financial-facts-text.js';
import { clipAdvisorToolText } from './advisor-cash-movement-lines.js';
import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  clampAdvisorDrilldownLimit,
} from './advisor-cash-realized-breakdown.js';

/**
 * Primitiva genérica de títulos de contas a pagar (PAYABLE / OBLIGATION).
 * Domínio distinto de REALIZED_CASH. Fonte = tabela `payables` canônica do Dashboard.
 */

export const PAYABLE_TITLES_TOOL_NAME = 'payable_titles';

export const ADVISOR_PAYABLE_TITLE_STATUSES = [
  'OPEN',
  'PAID',
  'OVERDUE',
  'ALL',
] as const;
export type AdvisorPayableTitleStatus = (typeof ADVISOR_PAYABLE_TITLE_STATUSES)[number];

export const ADVISOR_PAYABLE_TITLE_ORDERINGS = ['VALUE_DESC', 'DUE_DATE_ASC'] as const;
export type AdvisorPayableTitleOrdering = (typeof ADVISOR_PAYABLE_TITLE_ORDERINGS)[number];

export const ADVISOR_PAYABLE_TITLE_RESULT_STATUSES = [
  'OK',
  'EMPTY_RESULT',
  'UNAVAILABLE',
  'NOT_FOUND',
  'AMBIGUOUS',
] as const;
export type AdvisorPayableTitleResultStatus =
  (typeof ADVISOR_PAYABLE_TITLE_RESULT_STATUSES)[number];

export type AdvisorPayableTitleCostCenter = {
  readonly costCenterId: string;
  readonly name: string;
  readonly code: string | null;
};

export type AdvisorPayableTitleSourceLine = {
  readonly externalId: string;
  readonly description: string | null;
  readonly supplierName: string | null;
  readonly categoryNames: readonly string[];
  readonly dueDate: Date;
  /** Valor usado no ranking (unpaid para abertos; total/paid para quitados). */
  readonly rankAmount: Prisma.Decimal;
  readonly unpaid: Prisma.Decimal;
  readonly paid: Prisma.Decimal;
  readonly total: Prisma.Decimal;
  readonly installmentStatus: string;
  readonly situation: 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' | 'PAID';
  readonly costCenterNames: readonly string[];
};

export type AdvisorPayableTitleLine = {
  readonly dueDate: string;
  readonly amount: string;
  readonly unpaid: string;
  readonly paid: string;
  readonly total: string;
  readonly description: string | null;
  readonly supplierName: string | null;
  readonly categoryNames: readonly string[];
  readonly installmentStatus: string;
  readonly situation: AdvisorPayableTitleSourceLine['situation'];
  readonly costCenterNames: readonly string[];
};

export type AdvisorPayableTitleWindow = {
  readonly status: AdvisorPayableTitleResultStatus;
  readonly monthKey: string;
  readonly scope: 'PERIOD';
  readonly entityScope: 'TENANT' | 'COST_CENTER';
  readonly domain: 'PAYABLE';
  readonly payableMeaning: 'ACCOUNTS_PAYABLE_TITLES';
  readonly titleStatus: AdvisorPayableTitleStatus;
  readonly ordering: AdvisorPayableTitleOrdering;
  readonly requestedLimit: number;
  readonly effectiveLimit: number;
  readonly returnedCount: number;
  readonly hasMore: boolean;
  readonly costCenter: AdvisorPayableTitleCostCenter | null;
  readonly lines: readonly AdvisorPayableTitleLine[];
  readonly message?: string;
};

export function isAdvisorPayableTitleStatus(
  value: string,
): value is AdvisorPayableTitleStatus {
  return (ADVISOR_PAYABLE_TITLE_STATUSES as readonly string[]).includes(value);
}

export function isAdvisorPayableTitleOrdering(
  value: string,
): value is AdvisorPayableTitleOrdering {
  return (ADVISOR_PAYABLE_TITLE_ORDERINGS as readonly string[]).includes(value);
}

/**
 * Janela limitada de títulos PAYABLE canônicos.
 * Não agrega; não mistura com REALIZED_CASH.
 */
export function rankAdvisorPayableTitles(input: {
  readonly monthKey: string;
  readonly titleStatus: AdvisorPayableTitleStatus;
  readonly ordering: AdvisorPayableTitleOrdering;
  readonly requestedLimit: number;
  readonly effectiveLimit: number;
  readonly available: boolean;
  readonly entityScope: 'TENANT' | 'COST_CENTER';
  readonly costCenter: AdvisorPayableTitleCostCenter | null;
  readonly items: readonly AdvisorPayableTitleSourceLine[];
  readonly entityMiss?: 'NOT_FOUND' | 'AMBIGUOUS';
  readonly entityMessage?: string;
}): AdvisorPayableTitleWindow {
  if (input.entityMiss === 'NOT_FOUND' || input.entityMiss === 'AMBIGUOUS') {
    return {
      status: input.entityMiss,
      monthKey: input.monthKey,
      scope: 'PERIOD',
      entityScope: 'COST_CENTER',
      domain: 'PAYABLE',
      payableMeaning: 'ACCOUNTS_PAYABLE_TITLES',
      titleStatus: input.titleStatus,
      ordering: input.ordering,
      requestedLimit: input.requestedLimit,
      effectiveLimit: input.effectiveLimit,
      returnedCount: 0,
      hasMore: false,
      costCenter: null,
      lines: [],
      ...(input.entityMessage !== undefined ? { message: input.entityMessage } : {}),
    };
  }

  if (!input.available) {
    return {
      status: 'UNAVAILABLE',
      monthKey: input.monthKey,
      scope: 'PERIOD',
      entityScope: input.entityScope,
      domain: 'PAYABLE',
      payableMeaning: 'ACCOUNTS_PAYABLE_TITLES',
      titleStatus: input.titleStatus,
      ordering: input.ordering,
      requestedLimit: input.requestedLimit,
      effectiveLimit: input.effectiveLimit,
      returnedCount: 0,
      hasMore: false,
      costCenter: input.costCenter,
      lines: [],
      message: 'Não consegui obter os títulos de contas a pagar agora.',
    };
  }

  const sorted = [...input.items].sort((left, right) =>
    comparePayableTitleLines(left, right, input.ordering),
  );
  const window = sorted.slice(0, input.effectiveLimit);

  return {
    status: window.length === 0 ? 'EMPTY_RESULT' : 'OK',
    monthKey: input.monthKey,
    scope: 'PERIOD',
    entityScope: input.entityScope,
    domain: 'PAYABLE',
    payableMeaning: 'ACCOUNTS_PAYABLE_TITLES',
    titleStatus: input.titleStatus,
    ordering: input.ordering,
    requestedLimit: input.requestedLimit,
    effectiveLimit: input.effectiveLimit,
    returnedCount: window.length,
    hasMore: sorted.length > window.length,
    costCenter: input.costCenter,
    lines: window.map(toPublicLine),
  };
}

export function serializeAdvisorPayableTitles(
  value: AdvisorPayableTitleWindow,
): Record<string, unknown> {
  return {
    status: value.status,
    monthKey: value.monthKey,
    scope: value.scope,
    entityScope: value.entityScope,
    domain: value.domain,
    payableMeaning: value.payableMeaning,
    realizedMeaning: null,
    titleStatus: value.titleStatus,
    ordering: value.ordering,
    windowKind: 'TOP_N_PAYABLE_TITLES',
    proves: [
      'INDIVIDUAL_PAYABLE_TITLES',
      'PAYABLE_RANKING_WINDOW',
      'OPEN_OR_PAID_OR_OVERDUE_FILTER',
    ],
    doesNotProve: [
      'REALIZED_CASH_MOVEMENTS',
      'COMPLETE_POPULATION_BEYOND_WINDOW',
      'MONTHLY_EXPENSES_COMPOSITION_FROM_REALIZED_PLUS_OPEN',
    ],
    requestedLimit: value.requestedLimit,
    effectiveLimit: value.effectiveLimit,
    returnedCount: value.returnedCount,
    hasMore: value.hasMore,
    costCenter:
      value.costCenter === null
        ? null
        : {
            costCenterId: value.costCenter.costCenterId,
            name: value.costCenter.name,
            code: value.costCenter.code,
          },
    resolvedCostCenter: value.costCenter?.name ?? 'NONE',
    lines: value.lines.map((line) => ({
      dueDate: line.dueDate,
      amount: line.amount,
      unpaid: line.unpaid,
      paid: line.paid,
      total: line.total,
      description: line.description,
      supplierName: line.supplierName,
      categoryNames: [...line.categoryNames],
      installmentStatus: line.installmentStatus,
      situation: line.situation,
      costCenterNames: [...line.costCenterNames],
    })),
    ...(value.message !== undefined ? { message: value.message } : {}),
  };
}

export function resolvePayableTitlesLimits(limit: number | undefined): {
  readonly requestedLimit: number;
  readonly effectiveLimit: number;
} {
  const clamped = clampAdvisorDrilldownLimit(limit);
  return {
    requestedLimit: clamped.requestedLimit ?? ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
    effectiveLimit: clamped.effectiveLimit,
  };
}

function toPublicLine(item: AdvisorPayableTitleSourceLine): AdvisorPayableTitleLine {
  return {
    dueDate: formatAdvisorCivilDate(item.dueDate),
    amount: item.rankAmount.toString(),
    unpaid: item.unpaid.toString(),
    paid: item.paid.toString(),
    total: item.total.toString(),
    description: clipAdvisorToolText(item.description),
    supplierName: clipAdvisorToolText(item.supplierName),
    categoryNames: item.categoryNames.map((name) => clipAdvisorToolText(name) ?? name),
    installmentStatus: item.installmentStatus,
    situation: item.situation,
    costCenterNames: item.costCenterNames.map((name) => clipAdvisorToolText(name) ?? name),
  };
}

function comparePayableTitleLines(
  left: AdvisorPayableTitleSourceLine,
  right: AdvisorPayableTitleSourceLine,
  ordering: AdvisorPayableTitleOrdering,
): number {
  if (ordering === 'VALUE_DESC') {
    const byAmount = right.rankAmount.comparedTo(left.rankAmount);
    if (byAmount !== 0) {
      return byAmount;
    }
  }
  const byDue = left.dueDate.getTime() - right.dueDate.getTime();
  if (byDue !== 0) {
    return ordering === 'DUE_DATE_ASC' ? byDue : -byDue;
  }
  const bySupplier = (left.supplierName ?? '').localeCompare(right.supplierName ?? '', 'pt-BR', {
    sensitivity: 'base',
  });
  if (bySupplier !== 0) {
    return bySupplier;
  }
  return left.externalId.localeCompare(right.externalId, 'pt-BR');
}
