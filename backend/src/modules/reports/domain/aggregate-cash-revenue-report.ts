import { Prisma } from '../../../generated/prisma/client.js';
import { monthlyBilling } from '../../analytics/domain/monthly-cash-flow.js';
import type {
  MonthlyCashFlow,
  MonthlyCashFlowRealizedCategoryComposition,
} from '../../analytics/domain/types.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export type CashRevenueCompositionItem = {
  readonly kind: 'category' | 'other' | 'uncategorized' | 'imprecise';
  readonly key: string;
  readonly name: string;
  readonly amount: Prisma.Decimal;
  /** Entradas realizadas nesta categoria (caixa). */
  readonly received: Prisma.Decimal | null;
  /** Sem previsto por categoria no contrato de caixa. */
  readonly outstanding: Prisma.Decimal | null;
  readonly percentage: Prisma.Decimal;
};

export type AggregatedCashRevenueReport = {
  readonly costCenterCashSplit: boolean;
  /** Faturamento do intervalo = Σ (realized.inflows + expected.receivables). */
  readonly total: Prisma.Decimal | null;
  /** Entradas realizadas (occurredOn / netAmount). */
  readonly received: Prisma.Decimal | null;
  /** A receber no prazo (dueDate no intervalo). */
  readonly outstanding: Prisma.Decimal | null;
  /** Vencido com dueDate no intervalo (ofMonth). */
  readonly overdue: Prisma.Decimal | null;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly CashRevenueCompositionItem[];
};

type CompositionBucket = {
  readonly kind: CashRevenueCompositionItem['kind'];
  readonly key: string;
  readonly name: string;
  amount: Prisma.Decimal;
};

/**
 * Agrega MonthlyCashFlow[] em relatório de ENTRADAS (CASH-6).
 * Realizado soma por mês; previsto/vencido usam dueDate no mês (ofMonth).
 * Sem as-of histórico — expected de meses passados tende a zero.
 */
export function aggregateCashRevenueReport(
  months: readonly MonthlyCashFlow[],
): AggregatedCashRevenueReport {
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

    const billing = monthlyBilling(month);
    total = addNullable(total, billing);
    received = addNullable(received, month.realized.inflows);
    outstanding = addNullable(outstanding, month.expected.receivables);
    overdue = addNullable(overdue, month.overdue.ofMonth.receivables);

    const composition = month.realizedByCategory.inflows;
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

function kindRank(kind: CashRevenueCompositionItem['kind']): number {
  if (kind === 'category') return 0;
  if (kind === 'other') return 1;
  if (kind === 'uncategorized') return 2;
  return 3;
}

function sortItems(items: readonly CashRevenueCompositionItem[]): CashRevenueCompositionItem[] {
  return [...items].sort((left, right) => {
    const byAmount = right.amount.comparedTo(left.amount);
    if (byAmount !== 0) return byAmount;
    const byKind = kindRank(left.kind) - kindRank(right.kind);
    if (byKind !== 0) return byKind;
    return left.name.localeCompare(right.name, 'pt-BR');
  });
}
