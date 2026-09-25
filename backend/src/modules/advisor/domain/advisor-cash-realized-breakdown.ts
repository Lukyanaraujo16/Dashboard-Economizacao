import { Prisma } from '../../../generated/prisma/client.js';
import type {
  MonthlyCashFlow,
  MonthlyCashFlowRealizedCategoryComposition,
} from '../../analytics/domain/types.js';
import { AdvisorDomainError } from './advisor-domain-error.js';
import {
  resolveAdvisorBillingCoverage,
  type AdvisorBillingCoverage,
} from './compare-advisor-cash-months.js';
import {
  ADVISOR_CASH_INFLOW_MEANING,
  ADVISOR_CASH_OUTFLOW_MEANING,
  ADVISOR_FINANCIAL_ABSENT,
  formatAdvisorFinancialAmount,
} from './financial-facts-text.js';

export const CASH_REALIZED_BREAKDOWN_TOOL_NAME = 'cash_realized_breakdown';

export const ADVISOR_DRILLDOWN_DEFAULT_LIMIT = 5;
export const ADVISOR_DRILLDOWN_MAX_LIMIT = 20;

export const ADVISOR_CASH_DIRECTIONS = ['INFLOW', 'OUTFLOW'] as const;
export type AdvisorCashDirection = (typeof ADVISOR_CASH_DIRECTIONS)[number];

export const ADVISOR_BREAKDOWN_STATUSES = ['OK', 'ABSENT', 'EMPTY_RESULT'] as const;
export type AdvisorBreakdownStatus = (typeof ADVISOR_BREAKDOWN_STATUSES)[number];

export type AdvisorCashCategoryRank = {
  readonly key: string;
  readonly label: string;
  readonly kind: 'category' | 'other' | 'uncategorized' | 'imprecise';
  readonly amount: Prisma.Decimal;
  readonly sharePercent: Prisma.Decimal | null;
  readonly rank: number;
};

export type AdvisorCashRealizedBreakdown = {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly scope: 'PERIOD';
  readonly direction: AdvisorCashDirection;
  readonly coverage: AdvisorBillingCoverage | null;
  readonly status: AdvisorBreakdownStatus;
  readonly totalRealized: Prisma.Decimal | null;
  readonly requestedLimit: number;
  readonly effectiveLimit: number;
  readonly hasMore: boolean;
  readonly categories: readonly AdvisorCashCategoryRank[];
};

export function isAdvisorCashDirection(value: string): value is AdvisorCashDirection {
  return (ADVISOR_CASH_DIRECTIONS as readonly string[]).includes(value);
}

export function clampAdvisorDrilldownLimit(limit: number | undefined): {
  readonly requestedLimit: number | null;
  readonly effectiveLimit: number;
} {
  if (limit === undefined) {
    return {
      requestedLimit: null,
      effectiveLimit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
    };
  }
  if (!Number.isFinite(limit)) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_INVALID_INPUT',
      'limit deve ser um número finito.',
    );
  }
  const requestedLimit = Math.trunc(limit);
  return {
    requestedLimit,
    effectiveLimit: Math.min(
      Math.max(1, requestedLimit),
      ADVISOR_DRILLDOWN_MAX_LIMIT,
    ),
  };
}

/**
 * Ranking oficial a partir de realizedByCategory. Não recalcula caixa.
 * sharePercent usa o total oficial; denominador 0 → null (NOT_APPLICABLE).
 */
export function rankAdvisorCashRealizedBreakdown(input: {
  readonly flow: MonthlyCashFlow;
  readonly direction: AdvisorCashDirection;
  readonly requestedLimit: number | null;
  readonly effectiveLimit: number;
}): AdvisorCashRealizedBreakdown {
  const composition = compositionForDirection(input.flow, input.direction);
  const coverage = resolveAdvisorBillingCoverage(input.flow.expected.receivables);

  if (composition === null) {
    return {
      tenantId: input.flow.tenantId,
      monthKey: input.flow.monthKey,
      scope: 'PERIOD',
      direction: input.direction,
      coverage,
      status: 'ABSENT',
      totalRealized: null,
      requestedLimit: input.requestedLimit ?? input.effectiveLimit,
      effectiveLimit: input.effectiveLimit,
      hasMore: false,
      categories: [],
    };
  }

  const ranked = rankOfficialCategories(composition);
  const window = ranked.slice(0, input.effectiveLimit);

  return {
    tenantId: input.flow.tenantId,
    monthKey: input.flow.monthKey,
    scope: 'PERIOD',
    direction: input.direction,
    coverage,
    status: window.length === 0 ? 'EMPTY_RESULT' : 'OK',
    totalRealized: composition.total,
    requestedLimit: input.requestedLimit ?? input.effectiveLimit,
    effectiveLimit: input.effectiveLimit,
    hasMore: ranked.length > window.length,
    categories: window,
  };
}

export function serializeAdvisorCashRealizedBreakdown(
  value: AdvisorCashRealizedBreakdown,
): Record<string, unknown> {
  return {
    status: value.status,
    monthKey: value.monthKey,
    scope: value.scope,
    direction: value.direction,
    coverage: value.coverage ?? ADVISOR_FINANCIAL_ABSENT,
    realizedMeaning:
      value.direction === 'INFLOW' ? ADVISOR_CASH_INFLOW_MEANING : ADVISOR_CASH_OUTFLOW_MEANING,
    rankingAuthority: 'OFFICIAL_REALIZED_BY_CATEGORY',
    notIndividualConvenioRanking: true,
    totalRealized: formatAdvisorFinancialAmount(value.totalRealized),
    requestedLimit: value.requestedLimit,
    effectiveLimit: value.effectiveLimit,
    returnedCount: value.categories.length,
    hasMore: value.hasMore,
    categories: value.categories.map((item) => ({
      key: item.key,
      label: item.label,
      kind: item.kind,
      amount: formatAdvisorFinancialAmount(item.amount),
      sharePercent:
        item.sharePercent === null ? 'NOT_APPLICABLE' : item.sharePercent.toString(),
      rank: item.rank,
    })),
  };
}

function compositionForDirection(
  flow: MonthlyCashFlow,
  direction: AdvisorCashDirection,
): MonthlyCashFlowRealizedCategoryComposition | null {
  return direction === 'INFLOW'
    ? flow.realizedByCategory.inflows
    : flow.realizedByCategory.outflows;
}

function rankOfficialCategories(
  composition: MonthlyCashFlowRealizedCategoryComposition,
): AdvisorCashCategoryRank[] {
  return [...composition.items]
    .sort((left, right) => {
      const byAmount = right.amount.comparedTo(left.amount);
      if (byAmount !== 0) {
        return byAmount;
      }
      const byLabel = left.name.localeCompare(right.name, 'pt-BR');
      if (byLabel !== 0) {
        return byLabel;
      }
      return left.key.localeCompare(right.key);
    })
    .map((item, index) => ({
      key: item.key,
      label: item.name,
      kind: item.kind,
      amount: item.amount,
      sharePercent: shareOfOfficialTotal(item.amount, composition.total),
      rank: index + 1,
    }));
}

function shareOfOfficialTotal(
  amount: Prisma.Decimal,
  total: Prisma.Decimal,
): Prisma.Decimal | null {
  if (total.isZero()) {
    return null;
  }
  return amount.div(total).times(100);
}
