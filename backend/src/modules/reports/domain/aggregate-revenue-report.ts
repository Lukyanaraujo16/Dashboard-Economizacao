import { Prisma } from '../../../generated/prisma/client.js';
import type { MonthlyCompetenceRevenueResult } from '../../analytics/domain/types.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

type RevenueItem = MonthlyCompetenceRevenueResult['items'][number];

export type AggregatedRevenueReport = {
  readonly costCenterCashSplit: boolean;
  readonly total: Prisma.Decimal;
  readonly received: Prisma.Decimal | null;
  readonly outstanding: Prisma.Decimal | null;
  readonly overdue: Prisma.Decimal | null;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly RevenueItem[];
};

/**
 * Soma dos totais mensais do motor de competência (F12-A).
 * `coverageRate` = classificados ÷ total do intervalo (D9: null se total 0).
 * `items` mesclados por kind+key (id de categoria / bucket; HTTP §12c não expõe id).
 */
export function aggregateRevenueReport(
  months: readonly MonthlyCompetenceRevenueResult[],
): AggregatedRevenueReport {
  let total = ZERO;
  let received: Prisma.Decimal | null = ZERO;
  let outstanding: Prisma.Decimal | null = ZERO;
  let overdue: Prisma.Decimal | null = ZERO;
  let classified = ZERO;
  let uncategorized = ZERO;
  let imprecise = ZERO;
  let costCenterCashSplit = true;
  const buckets = new Map<string, RevenueItem>();

  for (const month of months) {
    if (!month.costCenterCashSplit) {
      costCenterCashSplit = false;
    }
    total = total.plus(month.total);
    received = addNullable(received, month.received);
    outstanding = addNullable(outstanding, month.outstanding);
    overdue = addNullable(overdue, month.overdue);
    classified = classified.plus(month.classified);
    uncategorized = uncategorized.plus(month.uncategorized);
    imprecise = imprecise.plus(month.imprecise);

    for (const item of month.items) {
      const mergeKey = itemMergeKey(item);
      const current = buckets.get(mergeKey);
      if (current === undefined) {
        buckets.set(mergeKey, { ...item, percentage: ZERO });
        continue;
      }
      buckets.set(mergeKey, {
        ...current,
        amount: current.amount.plus(item.amount),
        received: addNullable(current.received, item.received),
        outstanding: addNullable(current.outstanding, item.outstanding),
        percentage: ZERO,
      });
    }
  }

  const coverageRate = total.equals(ZERO) ? null : classified.div(total).times(HUNDRED);
  const items = sortItems(
    [...buckets.values()].map((item) => ({
      ...item,
      percentage: shareOfTotal(item.amount, total),
    })),
  );

  return {
    costCenterCashSplit,
    total,
    received,
    outstanding,
    overdue,
    classified,
    uncategorized,
    imprecise,
    coverageRate,
    items,
  };
}

function itemMergeKey(item: RevenueItem): string {
  return `${item.kind}\0${item.key}`;
}

function addNullable(left: Prisma.Decimal | null, right: Prisma.Decimal | null): Prisma.Decimal | null {
  if (left === null || right === null) {
    return null;
  }
  return left.plus(right);
}

function shareOfTotal(amount: Prisma.Decimal, total: Prisma.Decimal): Prisma.Decimal {
  if (total.equals(ZERO)) {
    return ZERO;
  }
  return amount.div(total).times(HUNDRED);
}

function kindRank(kind: RevenueItem['kind']): number {
  if (kind === 'category') {
    return 0;
  }
  if (kind === 'other') {
    return 1;
  }
  if (kind === 'uncategorized') {
    return 2;
  }
  return 3;
}

function sortItems(items: readonly RevenueItem[]): RevenueItem[] {
  return [...items].sort((left, right) => {
    const byAmount = right.amount.comparedTo(left.amount);
    if (byAmount !== 0) {
      return byAmount;
    }
    const byKind = kindRank(left.kind) - kindRank(right.kind);
    if (byKind !== 0) {
      return byKind;
    }
    return left.name.localeCompare(right.name, 'pt-BR');
  });
}
