import { Prisma } from '../../../generated/prisma/client.js';
import { monthlyBilling } from '../../analytics/domain/monthly-cash-flow.js';
import type {
  MonthlyCashFlow,
  MonthlyCashFlowRealizedCategoryComposition,
} from '../../analytics/domain/types.js';
import { AdvisorDomainError } from './advisor-domain-error.js';

export const ADVISOR_CASH_CATEGORY_TOP_N = 10;

export const ADVISOR_BILLING_COVERAGES = ['FULL_BILLING', 'REALIZED_ONLY'] as const;
export type AdvisorBillingCoverage = (typeof ADVISOR_BILLING_COVERAGES)[number];

export const ADVISOR_CASH_TRENDS = ['INCREASE', 'DECREASE', 'UNCHANGED'] as const;
export type AdvisorCashTrend = (typeof ADVISOR_CASH_TRENDS)[number];

export type AdvisorCashPeriodSnapshot = {
  readonly monthKey: string;
  readonly billing: Prisma.Decimal | null;
  readonly realizedInflows: Prisma.Decimal | null;
  readonly realizedOutflows: Prisma.Decimal | null;
  readonly realizedResult: Prisma.Decimal | null;
  readonly expectedReceivables: Prisma.Decimal | null;
  readonly expectedPayables: Prisma.Decimal | null;
};

export type AdvisorCashDelta = {
  readonly billing: Prisma.Decimal | null;
  readonly billingPercent: Prisma.Decimal | null;
  readonly realizedInflows: Prisma.Decimal | null;
  readonly realizedOutflows: Prisma.Decimal | null;
  readonly realizedResult: Prisma.Decimal | null;
};

export type AdvisorCashCategoryDelta = {
  readonly key: string;
  readonly name: string;
  readonly kind: 'category' | 'other' | 'uncategorized' | 'imprecise';
  readonly amountA: Prisma.Decimal | null;
  readonly amountB: Prisma.Decimal | null;
  readonly delta: Prisma.Decimal | null;
  readonly percent: Prisma.Decimal | null;
  readonly trend: AdvisorCashTrend | null;
};

export type AdvisorCashCategoryComparison = {
  /**
   * false = composição oficial ausente em pelo menos um lado (split unavailable).
   * Categoria omitida pelo serviço em um mês presente = zero, não ABSENT.
   */
  readonly available: boolean;
  readonly items: readonly AdvisorCashCategoryDelta[];
  readonly increases: readonly AdvisorCashCategoryDelta[];
  readonly decreases: readonly AdvisorCashCategoryDelta[];
};

export type AdvisorCashMonthComparison = {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
  readonly periodA: AdvisorCashPeriodSnapshot;
  readonly periodB: AdvisorCashPeriodSnapshot;
  readonly difference: AdvisorCashDelta;
  readonly billingCoverage: AdvisorBillingCoverage;
  readonly inflowCategories: AdvisorCashCategoryComparison;
  readonly outflowCategories: AdvisorCashCategoryComparison;
};

export type CompareAdvisorCashMonthsInput = {
  readonly tenantId: string;
  readonly periodA: MonthlyCashFlow;
  readonly periodB: MonthlyCashFlow;
};

/**
 * Compara dois MonthlyCashFlow oficiais.
 * periodA = comparisonMonthKey (base); periodB = monthKey (atual).
 * Não recalcula caixa: usa monthlyBilling e realizedByCategory do motor.
 */
export function compareAdvisorCashMonths(
  input: CompareAdvisorCashMonthsInput,
): AdvisorCashMonthComparison {
  const tenantId = input.tenantId.trim();
  if (input.periodA.tenantId !== tenantId || input.periodB.tenantId !== tenantId) {
    throw new AdvisorDomainError(
      'ANALYTICAL_TOOL_FORBIDDEN',
      'Comparação de caixa recusou fluxo de outro tenant.',
    );
  }

  const periodA = toSnapshot(input.periodA);
  const periodB = toSnapshot(input.periodB);
  const billingA = periodA.billing;
  const billingB = periodB.billing;

  return {
    tenantId,
    monthKey: periodB.monthKey,
    comparisonMonthKey: periodA.monthKey,
    periodA,
    periodB,
    difference: {
      billing: subtractNullable(billingB, billingA),
      billingPercent: percentDelta(billingB, billingA),
      realizedInflows: subtractNullable(periodB.realizedInflows, periodA.realizedInflows),
      realizedOutflows: subtractNullable(periodB.realizedOutflows, periodA.realizedOutflows),
      realizedResult: subtractNullable(periodB.realizedResult, periodA.realizedResult),
    },
    billingCoverage: resolveAdvisorComparisonBillingCoverage(
      periodA.expectedReceivables,
      periodB.expectedReceivables,
    ),
    inflowCategories: compareCategorySide(
      input.periodA.realizedByCategory.inflows,
      input.periodB.realizedByCategory.inflows,
    ),
    outflowCategories: compareCategorySide(
      input.periodA.realizedByCategory.outflows,
      input.periodB.realizedByCategory.outflows,
    ),
  };
}

export function resolveAdvisorBillingCoverage(
  expectedReceivables: Prisma.Decimal | null,
): AdvisorBillingCoverage {
  if (expectedReceivables !== null && expectedReceivables.isZero()) {
    return 'FULL_BILLING';
  }
  return 'REALIZED_ONLY';
}

export function resolveAdvisorComparisonBillingCoverage(
  expectedA: Prisma.Decimal | null,
  expectedB: Prisma.Decimal | null,
): AdvisorBillingCoverage {
  if (
    expectedA !== null &&
    expectedB !== null &&
    expectedA.isZero() &&
    expectedB.isZero()
  ) {
    return 'FULL_BILLING';
  }
  return 'REALIZED_ONLY';
}

export const ADVISOR_MONTHLY_COMPARISON_FACT_KIND = 'PERIOD_CASH_MONTH_COMPARISON';

export function serializeAdvisorMonthlyComparisonFacts(
  value: AdvisorCashMonthComparison,
): Record<string, unknown> {
  return {
    status: 'OK',
    factKind: ADVISOR_MONTHLY_COMPARISON_FACT_KIND,
    ...serializeAdvisorCashMonthComparison(value),
  };
}

export function serializeAdvisorCashMonthComparison(
  value: AdvisorCashMonthComparison,
): Record<string, unknown> {
  return {
    temporalScope: 'PERIOD_COMPARISON',
    monthKey: value.monthKey,
    comparisonMonthKey: value.comparisonMonthKey,
    billingCoverage: value.billingCoverage,
    realizedResultMeaning: 'RESULTADO_DE_CAIXA',
    realizedOutflowsMeaning: 'SAIDAS_REALIZADAS_DE_CAIXA',
    periodA: serializePeriod(value.periodA),
    periodB: serializePeriod(value.periodB),
    difference: {
      billing: formatAmount(value.difference.billing),
      billingPercent: formatAdvisorPercent(value.difference.billingPercent),
      realizedInflows: formatAmount(value.difference.realizedInflows),
      realizedOutflows: formatAmount(value.difference.realizedOutflows),
      realizedResult: formatAmount(value.difference.realizedResult),
    },
    inflowCategories: serializeCategoryComparison(value.inflowCategories),
    outflowCategories: serializeCategoryComparison(value.outflowCategories),
  };
}

export function formatAdvisorPercent(value: Prisma.Decimal | null): string {
  return value === null ? 'NOT_APPLICABLE' : value.toString();
}

function formatAmount(value: Prisma.Decimal | null): string {
  return value === null ? 'ABSENT' : value.toString();
}

function toSnapshot(flow: MonthlyCashFlow): AdvisorCashPeriodSnapshot {
  return {
    monthKey: flow.monthKey,
    billing: monthlyBilling(flow),
    realizedInflows: flow.realized.inflows,
    realizedOutflows: flow.realized.outflows,
    realizedResult: flow.realized.result,
    expectedReceivables: flow.expected.receivables,
    expectedPayables: flow.expected.payables,
  };
}

function subtractNullable(
  current: Prisma.Decimal | null,
  base: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (current === null || base === null) {
    return null;
  }
  return current.minus(base);
}

/**
 * Denominador > 0: percentual normal.
 * Ambos 0: percentual 0 (diferença absoluta 0).
 * Denominador 0 e current ≠ 0: NOT_APPLICABLE (null), sem Infinity.
 * Ausência (null) ≠ zero.
 */
export function percentDelta(
  current: Prisma.Decimal | null,
  base: Prisma.Decimal | null,
): Prisma.Decimal | null {
  if (current === null || base === null) {
    return null;
  }
  if (base.isZero()) {
    return current.isZero() ? new Prisma.Decimal(0) : null;
  }
  return current.minus(base).div(base).times(100);
}

function trendFromDelta(delta: Prisma.Decimal | null): AdvisorCashTrend | null {
  if (delta === null) {
    return null;
  }
  if (delta.isZero()) {
    return 'UNCHANGED';
  }
  return delta.greaterThan(0) ? 'INCREASE' : 'DECREASE';
}

function compareCategorySide(
  sideA: MonthlyCashFlowRealizedCategoryComposition | null,
  sideB: MonthlyCashFlowRealizedCategoryComposition | null,
): AdvisorCashCategoryComparison {
  if (sideA === null || sideB === null) {
    return {
      available: false,
      items: [],
      increases: [],
      decreases: [],
    };
  }

  const mapA = new Map(sideA.items.map((item) => [item.key, item]));
  const mapB = new Map(sideB.items.map((item) => [item.key, item]));
  const keys = [...new Set([...mapA.keys(), ...mapB.keys()])];
  const zero = new Prisma.Decimal(0);
  const items = keys
    .map((key) => {
      const left = mapA.get(key);
      const right = mapB.get(key);
      const amountA = left?.amount ?? zero;
      const amountB = right?.amount ?? zero;
      const delta = amountB.minus(amountA);
      return {
        key,
        name: right?.name ?? left?.name ?? key,
        kind: right?.kind ?? left?.kind ?? 'category',
        amountA,
        amountB,
        delta,
        percent: percentDelta(amountB, amountA),
        trend: trendFromDelta(delta),
      } satisfies AdvisorCashCategoryDelta;
    })
    .sort((left, right) => {
      const byAbs = (right.delta ?? zero).abs().comparedTo((left.delta ?? zero).abs());
      if (byAbs !== 0) {
        return byAbs;
      }
      return left.name.localeCompare(right.name, 'pt-BR');
    });

  const increases = items
    .filter((item) => item.trend === 'INCREASE')
    .sort((left, right) => (right.delta ?? zero).comparedTo(left.delta ?? zero))
    .slice(0, ADVISOR_CASH_CATEGORY_TOP_N);
  const decreases = items
    .filter((item) => item.trend === 'DECREASE')
    .sort((left, right) => (left.delta ?? zero).comparedTo(right.delta ?? zero))
    .slice(0, ADVISOR_CASH_CATEGORY_TOP_N);

  return { available: true, items, increases, decreases };
}

function serializePeriod(period: AdvisorCashPeriodSnapshot): Record<string, string> {
  return {
    monthKey: period.monthKey,
    billing: formatAmount(period.billing),
    realizedInflows: formatAmount(period.realizedInflows),
    realizedOutflows: formatAmount(period.realizedOutflows),
    realizedResult: formatAmount(period.realizedResult),
    expectedReceivables: formatAmount(period.expectedReceivables),
    expectedPayables: formatAmount(period.expectedPayables),
  };
}

function serializeCategoryComparison(
  value: AdvisorCashCategoryComparison,
): Record<string, unknown> {
  return {
    available: value.available,
    increases: value.increases.map(serializeCategoryDelta),
    decreases: value.decreases.map(serializeCategoryDelta),
  };
}

function serializeCategoryDelta(item: AdvisorCashCategoryDelta): Record<string, unknown> {
  return {
    key: item.key,
    name: item.name,
    kind: item.kind,
    amountA: formatAmount(item.amountA),
    amountB: formatAmount(item.amountB),
    delta: formatAmount(item.delta),
    percent: formatAdvisorPercent(item.percent),
    trend: item.trend ?? 'ABSENT',
  };
}
