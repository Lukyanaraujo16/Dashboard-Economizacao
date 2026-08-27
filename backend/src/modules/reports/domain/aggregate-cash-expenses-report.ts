import { Prisma } from '../../../generated/prisma/client.js';
import type {
  MonthlyCashFlow,
  MonthlyCashFlowRealizedCategoryComposition,
} from '../../analytics/domain/types.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/** Despesas de caixa = saídas realizadas + a pagar no prazo. */
export function monthlyCashExpenses(flow: {
  readonly realized: { readonly outflows: Prisma.Decimal | null };
  readonly expected: { readonly payables: Prisma.Decimal | null };
}): Prisma.Decimal | null {
  if (flow.realized.outflows === null || flow.expected.payables === null) {
    return null;
  }
  return flow.realized.outflows.plus(flow.expected.payables);
}

export type CashExpensesCompositionItem = {
  readonly kind: 'category' | 'other' | 'uncategorized' | 'imprecise';
  readonly key: string;
  readonly name: string;
  readonly amount: Prisma.Decimal;
  readonly received: Prisma.Decimal | null;
  readonly outstanding: Prisma.Decimal | null;
  readonly percentage: Prisma.Decimal;
};

export type AggregatedCashExpensesReport = {
  readonly costCenterCashSplit: boolean;
  readonly total: Prisma.Decimal | null;
  /** Saídas realizadas (occurredOn / netAmount). */
  readonly received: Prisma.Decimal | null;
  readonly outstanding: Prisma.Decimal | null;
  readonly overdue: Prisma.Decimal | null;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly CashExpensesCompositionItem[];
};

type CompositionBucket = {
  readonly kind: CashExpensesCompositionItem['kind'];
  readonly key: string;
  readonly name: string;
  amount: Prisma.Decimal;
};

/**
 * Agrega MonthlyCashFlow[] em relatório de SAÍDAS (CASH-6).
 */
export function aggregateCashExpensesReport(
  months: readonly MonthlyCashFlow[],
): AggregatedCashExpensesReport {
  let total: Prisma.Decimal | null = ZERO;
  let received: Prisma.Decimal | null = ZERO;
  let outstanding: Prisma.Decimal | null = ZERO;
  let overdue: Prisma.Decimal | null = ZERO;
  let classified = ZERO;
  let uncategorized = ZERO;
  let imprecise = ZERO;
  let costCenterCashSplit = true;
  const buckets = new Map<string, CompositionBucket>();

  for (const month of months) {
    if (!month.costCenterCashSplit) {
      costCenterCashSplit = false;
    }

    total = addNullable(total, monthlyCashExpenses(month));
    received = addNullable(received, month.realized.outflows);
    outstanding = addNullable(outstanding, month.expected.payables);
    overdue = addNullable(overdue, month.overdue.ofMonth.payables);

    const composition = month.realizedByCategory.outflows;
    if (composition) {
      classified = classified.plus(composition.classified);
      uncategorized = uncategorized.plus(composition.uncategorized);
      imprecise = imprecise.plus(composition.imprecise);
      mergeComposition(buckets, composition);
    }
  }

  const realizedTotal = received ?? ZERO;
  const coverageRate =
    realizedTotal.equals(ZERO) || !costCenterCashSplit
      ? null
      : classified.div(realizedTotal).times(HUNDRED);

  const items = sortItems(
    [...buckets.values()].map((item) => ({
      kind: item.kind,
      key: item.key,
      name: item.name,
      amount: item.amount,
      received: costCenterCashSplit ? item.amount : null,
      outstanding: costCenterCashSplit ? ZERO : null,
      percentage: shareOfTotal(item.amount, realizedTotal),
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

function mergeComposition(
  buckets: Map<string, CompositionBucket>,
  composition: MonthlyCashFlowRealizedCategoryComposition,
): void {
  for (const item of composition.items) {
    const mergeKey = `${item.kind}\0${item.key}`;
    const current = buckets.get(mergeKey);
    if (current === undefined) {
      buckets.set(mergeKey, {
        kind: item.kind,
        key: item.key,
        name: item.name,
        amount: item.amount,
      });
      continue;
    }
    current.amount = current.amount.plus(item.amount);
  }
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

function kindRank(kind: CashExpensesCompositionItem['kind']): number {
  if (kind === 'category') return 0;
  if (kind === 'other') return 1;
  if (kind === 'uncategorized') return 2;
  return 3;
}

function sortItems(items: readonly CashExpensesCompositionItem[]): CashExpensesCompositionItem[] {
  return [...items].sort((left, right) => {
    const byAmount = right.amount.comparedTo(left.amount);
    if (byAmount !== 0) return byAmount;
    const byKind = kindRank(left.kind) - kindRank(right.kind);
    if (byKind !== 0) return byKind;
    return left.name.localeCompare(right.name, 'pt-BR');
  });
}
