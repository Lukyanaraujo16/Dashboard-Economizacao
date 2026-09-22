import { Prisma } from '../../../generated/prisma/client.js';
import type { DashboardCategoryFilter } from './dashboard-home-filters.js';
import {
  civilMonthBoundsFromKey,
  listForwardInclusiveMonthKeys,
} from './civil-calendar.js';
import { selectExpectedOpenPayables } from './expected-open-payables.js';
import { selectExpectedOpenReceivables } from './expected-open-receivables.js';
import type { CashCostCenterAllocationSource } from './monthly-cash-flow.js';

const ZERO = new Prisma.Decimal(0);

export const CASH_EXPECTED_HORIZON_VALUES = [3, 6, 12] as const;
export type CashExpectedHorizonMonths = (typeof CASH_EXPECTED_HORIZON_VALUES)[number];

export type CashExpectedHorizonMoney = {
  readonly receivables: Prisma.Decimal | null;
  readonly payables: Prisma.Decimal | null;
  readonly result: Prisma.Decimal | null;
};

export type CashExpectedHorizonMonthBucket = {
  readonly monthKey: string;
  readonly expected: CashExpectedHorizonMoney;
};

export type CashExpectedHorizon = {
  readonly today: Date;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly horizon: CashExpectedHorizonMonths;
  readonly costCenterCashSplit: boolean;
  readonly totals: CashExpectedHorizonMoney;
  readonly months: readonly CashExpectedHorizonMonthBucket[];
};

export type CalculateCashExpectedHorizonInput = {
  readonly today: Date;
  readonly anchorMonthKey: string;
  readonly horizon: CashExpectedHorizonMonths;
  readonly receivableRows: readonly CashCostCenterAllocationSource[];
  readonly payableRows: readonly CashCostCenterAllocationSource[];
  readonly categoryFilter: DashboardCategoryFilter | null;
  readonly hasCostCenter: boolean;
};

function splitExpected(
  available: boolean,
  receivables: Prisma.Decimal,
  payables: Prisma.Decimal,
): CashExpectedHorizonMoney {
  if (!available) {
    return { receivables: null, payables: null, result: null };
  }
  return {
    receivables,
    payables,
    result: receivables.minus(payables),
  };
}

/**
 * Previsto multi-mês a partir da âncora — reutiliza exatamente
 * `selectExpectedOpenReceivables` / `selectExpectedOpenPayables` (CASH-3B).
 * Sem ledger/realizado. Um `today` compartilhado em todos os buckets.
 */
export function calculateCashExpectedHorizon(
  input: CalculateCashExpectedHorizonInput,
): CashExpectedHorizon {
  const monthKeys = listForwardInclusiveMonthKeys(input.anchorMonthKey, input.horizon);
  let expectedAvailable = true;
  let totalReceivables = ZERO;
  let totalPayables = ZERO;
  const months: CashExpectedHorizonMonthBucket[] = [];

  for (const monthKey of monthKeys) {
    const bounds = civilMonthBoundsFromKey(monthKey);
    const receivableOpen = selectExpectedOpenReceivables({
      rows: input.receivableRows,
      today: input.today,
      from: bounds.from,
      to: bounds.to,
      categoryFilter: input.categoryFilter,
      hasCostCenter: input.hasCostCenter,
    });
    if (!receivableOpen.available) {
      expectedAvailable = false;
    }

    const payableOpen = selectExpectedOpenPayables({
      rows: input.payableRows,
      today: input.today,
      from: bounds.from,
      to: bounds.to,
      categoryFilter: input.categoryFilter,
      hasCostCenter: input.hasCostCenter,
    });
    if (!payableOpen.available) {
      expectedAvailable = false;
    }

    totalReceivables = totalReceivables.plus(receivableOpen.total);
    totalPayables = totalPayables.plus(payableOpen.total);

    months.push({
      monthKey,
      expected: splitExpected(true, receivableOpen.total, payableOpen.total),
    });
  }

  if (!expectedAvailable) {
    return {
      today: input.today,
      startMonth: monthKeys[0]!,
      endMonth: monthKeys[monthKeys.length - 1]!,
      horizon: input.horizon,
      costCenterCashSplit: false,
      totals: { receivables: null, payables: null, result: null },
      months: months.map((bucket) => ({
        monthKey: bucket.monthKey,
        expected: { receivables: null, payables: null, result: null },
      })),
    };
  }

  return {
    today: input.today,
    startMonth: monthKeys[0]!,
    endMonth: monthKeys[monthKeys.length - 1]!,
    horizon: input.horizon,
    costCenterCashSplit: true,
    totals: splitExpected(true, totalReceivables, totalPayables),
    months,
  };
}

export function isCashExpectedHorizonMonths(value: number): value is CashExpectedHorizonMonths {
  return (CASH_EXPECTED_HORIZON_VALUES as readonly number[]).includes(value);
}
