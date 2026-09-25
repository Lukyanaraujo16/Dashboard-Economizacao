import { Prisma } from '../../../generated/prisma/client.js';
import {
  identifiedCenterOrZero,
  type AdvisorCostCenterAggregation,
  type AdvisorCostCenterCatalogItem,
  type AdvisorCostCenterIdentified,
} from './advisor-cost-center-dimension.js';
import {
  advisorCostCenterCompareFactContract,
} from './advisor-cost-center-fact-contract.js';
import {
  formatAdvisorPercent,
  percentDelta,
} from './compare-advisor-cash-months.js';
import {
  ADVISOR_CASH_INFLOW_MEANING,
  ADVISOR_CASH_OUTFLOW_MEANING,
  formatAdvisorFinancialAmount,
} from './financial-facts-text.js';
import type { AdvisorCashTrend } from './compare-advisor-cash-months.js';

export const ADVISOR_COST_CENTER_COMPARE_STATUSES = [
  'OK',
  'NOT_FOUND',
  'AMBIGUOUS',
  'UNAVAILABLE',
] as const;

export type AdvisorCostCenterCompareStatus =
  (typeof ADVISOR_COST_CENTER_COMPARE_STATUSES)[number];

export type AdvisorCostCenterPeriodFacts = {
  readonly monthKey: string;
  readonly amount: Prisma.Decimal;
  readonly shareOfPopulation: Prisma.Decimal | null;
  readonly shareOfIdentified: Prisma.Decimal | null;
  readonly populationAmount: Prisma.Decimal;
  readonly identifiedAmount: Prisma.Decimal;
  readonly unidentifiedAmount: Prisma.Decimal;
  readonly coveragePercentage: Prisma.Decimal | null;
};

export type AdvisorCostCenterComparison = {
  readonly status: AdvisorCostCenterCompareStatus;
  readonly direction: AdvisorCostCenterAggregation['direction'];
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
  readonly costCenter: AdvisorCostCenterIdentified | null;
  readonly base: AdvisorCostCenterPeriodFacts | null;
  readonly target: AdvisorCostCenterPeriodFacts | null;
  readonly absoluteDelta: Prisma.Decimal | null;
  readonly percentageDelta: Prisma.Decimal | null;
  readonly trend: AdvisorCashTrend | null;
  readonly coverageDiffers: boolean;
  readonly candidates?: readonly AdvisorCostCenterCatalogItem[];
};

/**
 * Compara o MESMO costCenterId em duas agregações D4.2.
 * Centro resolvido no catálogo sem valor identificado = zero, não NOT_FOUND.
 */
export function compareAdvisorCostCenterDimension(input: {
  readonly base: AdvisorCostCenterAggregation;
  readonly target: AdvisorCostCenterAggregation;
  readonly catalogItem: AdvisorCostCenterCatalogItem;
}): AdvisorCostCenterComparison {
  if (!input.base.available || !input.target.available) {
    return unavailableComparison(input);
  }
  const baseCenter = identifiedCenterOrZero(input.base, input.catalogItem.id, input.catalogItem);
  const targetCenter = identifiedCenterOrZero(
    input.target,
    input.catalogItem.id,
    input.catalogItem,
  );
  const absoluteDelta = targetCenter.amount.minus(baseCenter.amount);
  const percentageDelta = percentDelta(targetCenter.amount, baseCenter.amount);
  return {
    status: 'OK',
    direction: input.target.direction,
    monthKey: input.target.monthKey,
    comparisonMonthKey: input.base.monthKey,
    costCenter: {
      ...targetCenter,
      name: input.catalogItem.name,
      code: input.catalogItem.code,
    },
    base: toPeriodFacts(input.base, baseCenter),
    target: toPeriodFacts(input.target, targetCenter),
    absoluteDelta,
    percentageDelta,
    trend: trendFromDelta(absoluteDelta),
    coverageDiffers: coverageDiffers(input.base, input.target),
  };
}

export function serializeAdvisorCostCenterComparison(
  value: AdvisorCostCenterComparison,
): Record<string, unknown> {
  return {
    status: value.status,
    monthKey: value.monthKey,
    comparisonMonthKey: value.comparisonMonthKey,
    scope: 'PERIOD_COMPARISON',
    direction: value.direction,
    realizedMeaning:
      value.direction === 'INFLOW' ? ADVISOR_CASH_INFLOW_MEANING : ADVISOR_CASH_OUTFLOW_MEANING,
    ...advisorCostCenterCompareFactContract(),
    coverageDiffers: value.coverageDiffers,
    costCenter:
      value.costCenter === null
        ? null
        : {
            costCenterId: value.costCenter.costCenterId,
            name: value.costCenter.name,
            code: value.costCenter.code,
          },
    base: value.base === null ? null : serializePeriodFacts(value.base),
    target: value.target === null ? null : serializePeriodFacts(value.target),
    absoluteDelta: formatNullableAmount(value.absoluteDelta),
    percentageDelta: formatAdvisorPercent(value.percentageDelta),
    trend: value.trend ?? 'ABSENT',
    candidates:
      value.candidates?.map((row) => ({
        costCenterId: row.id,
        name: row.name,
        code: row.code,
      })) ?? [],
  };
}

function toPeriodFacts(
  aggregation: AdvisorCostCenterAggregation,
  center: AdvisorCostCenterIdentified,
): AdvisorCostCenterPeriodFacts {
  return {
    monthKey: aggregation.monthKey,
    amount: center.amount,
    shareOfPopulation: center.shareOfPopulation,
    shareOfIdentified: center.shareOfIdentified,
    populationAmount: aggregation.populationAmount,
    identifiedAmount: aggregation.identifiedAmount,
    unidentifiedAmount: aggregation.unidentifiedAmount,
    coveragePercentage: aggregation.coveragePercentage,
  };
}

function serializePeriodFacts(value: AdvisorCostCenterPeriodFacts): Record<string, string | null> {
  return {
    monthKey: value.monthKey,
    amount: formatAdvisorFinancialAmount(value.amount),
    shareOfPopulation: formatAdvisorPercent(value.shareOfPopulation),
    shareOfIdentified: formatAdvisorPercent(value.shareOfIdentified),
    populationAmount: formatAdvisorFinancialAmount(value.populationAmount),
    identifiedAmount: formatAdvisorFinancialAmount(value.identifiedAmount),
    unidentifiedAmount: formatAdvisorFinancialAmount(value.unidentifiedAmount),
    coveragePercentage: formatAdvisorPercent(value.coveragePercentage),
  };
}

function coverageDiffers(
  base: AdvisorCostCenterAggregation,
  target: AdvisorCostCenterAggregation,
): boolean {
  if (base.coveragePercentage === null || target.coveragePercentage === null) {
    return base.coveragePercentage !== target.coveragePercentage;
  }
  return !base.coveragePercentage.equals(target.coveragePercentage);
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

function formatNullableAmount(value: Prisma.Decimal | null): string {
  return value === null ? 'ABSENT' : formatAdvisorFinancialAmount(value);
}

function unavailableComparison(input: {
  readonly base: AdvisorCostCenterAggregation;
  readonly target: AdvisorCostCenterAggregation;
}): AdvisorCostCenterComparison {
  return {
    status: 'UNAVAILABLE',
    direction: input.target.direction,
    monthKey: input.target.monthKey,
    comparisonMonthKey: input.base.monthKey,
    costCenter: null,
    base: null,
    target: null,
    absoluteDelta: null,
    percentageDelta: null,
    trend: null,
    coverageDiffers: false,
  };
}
