import { Prisma } from '../../../generated/prisma/client.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../../finance/domain/types.js';
import { addCivilDays } from './civil-calendar.js';
import {
  aggregateCostCenterCashSplits,
  deriveInstallmentCostCenterCashSplit,
} from './cost-center-cash-split.js';
import {
  IMPRECISE_PAYABLE_BUCKET_NAME,
  UNCATEGORIZED_PAYABLE_BUCKET_NAME,
  type CompositionCategoryType,
  type PayableCompositionBucketKind,
} from './payable-category-composition.js';
import type { MonthlyCompetenceDailyPoint } from './types.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export type CostCenterAllocationMonthlySource = {
  readonly amount: Prisma.Decimal;
  readonly competenceDate: Date | null;
  readonly categoryExternalIds: readonly string[];
  readonly installmentTotal: Prisma.Decimal;
  readonly paid: Prisma.Decimal;
  readonly unpaid: Prisma.Decimal;
  readonly dueDate: Date;
  readonly status: FinancialInstallmentReadRecord['status'];
};

type CategoryLookup = Pick<FinancialCategoryReadRecord, 'externalId' | 'name' | 'type'>;

type AmountBucket = {
  readonly kind: PayableCompositionBucketKind;
  readonly key: string;
  readonly name: string;
  readonly amount: Prisma.Decimal;
};

export type CostCenterAllocationMonthlyCompositionItem = AmountBucket & {
  readonly percentage: Prisma.Decimal;
  readonly received: null;
  readonly outstanding: null;
};

/**
 * Competência filtrada por centro: Σ allocation.amount.
 * Cash split (received/outstanding/overdue) só quando DERIVABLE em todas as linhas
 * (1 centro 100%, multi quitado ou multi zerado). Parcial multi → null.
 */
export function calculateMonthlyCompetenceFromAllocations(
  rows: readonly CostCenterAllocationMonthlySource[],
  categories: readonly CategoryLookup[],
  expectedType: CompositionCategoryType = 'REVENUE',
  today: Date = new Date(),
): {
  readonly total: Prisma.Decimal;
  readonly received: Prisma.Decimal | null;
  readonly outstanding: Prisma.Decimal | null;
  readonly overdue: Prisma.Decimal | null;
  readonly costCenterCashSplit: boolean;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly CostCenterAllocationMonthlyCompositionItem[];
} {
  const catalog = new Map(categories.map((category) => [category.externalId, category]));
  const named = new Map<string, AmountBucket>();
  let uncategorized = ZERO;
  let imprecise = ZERO;
  let total = ZERO;
  const cashRows: ReturnType<typeof deriveInstallmentCostCenterCashSplit>[] = [];

  for (const row of rows) {
    total = total.plus(row.amount);
    cashRows.push(
      deriveInstallmentCostCenterCashSplit({
        allocationAmount: row.amount,
        installmentTotal: row.installmentTotal,
        paid: row.paid,
        unpaid: row.unpaid,
        dueDate: row.dueDate,
        today,
      }),
    );
    const ids = uniqueCategoryIds(row.categoryExternalIds);
    if (ids.length === 0) {
      uncategorized = uncategorized.plus(row.amount);
      continue;
    }
    if (ids.length > 1) {
      imprecise = imprecise.plus(row.amount);
      continue;
    }
    const category = catalog.get(ids[0]!);
    if (!category || category.type !== expectedType) {
      imprecise = imprecise.plus(row.amount);
      continue;
    }
    const current = named.get(category.externalId);
    named.set(category.externalId, {
      kind: 'category',
      key: category.externalId,
      name: category.name,
      amount: (current?.amount ?? ZERO).plus(row.amount),
    });
  }

  const cash = aggregateCostCenterCashSplits(cashRows);

  const classifiedAmount = [...named.values()].reduce(
    (sum, bucket) => sum.plus(bucket.amount),
    ZERO,
  );
  const presented: AmountBucket[] = [...named.values()];
  if (uncategorized.greaterThan(ZERO)) {
    presented.push({
      kind: 'uncategorized',
      key: 'uncategorized',
      name: UNCATEGORIZED_PAYABLE_BUCKET_NAME,
      amount: uncategorized,
    });
  }
  if (imprecise.greaterThan(ZERO)) {
    presented.push({
      kind: 'imprecise',
      key: 'imprecise',
      name: IMPRECISE_PAYABLE_BUCKET_NAME,
      amount: imprecise,
    });
  }

  const items = sortBuckets(presented).map((bucket) => ({
    ...bucket,
    percentage: shareOfTotal(bucket.amount, total),
    received: null,
    outstanding: null,
  }));

  return {
    total,
    received: cash.received,
    outstanding: cash.outstanding,
    overdue: cash.overdue,
    costCenterCashSplit: cash.costCenterCashSplit,
    classified: classifiedAmount,
    uncategorized,
    imprecise,
    coverageRate: total.equals(ZERO) ? null : classifiedAmount.div(total).times(HUNDRED),
    items,
  };
}

/**
 * Série diária por competenceDate com Σ allocation.amount.
 * received/outstanding: mesma semântica EXACT/UNAVAILABLE da CC1.3
 * (snapshot do título no dia de competência — não é caixa do dia).
 * Se qualquer título do mês for UNAVAILABLE, received/outstanding ficam null
 * em todos os pontos (coerente com o KPI mensal).
 */
export function buildDailyCompetenceAllocationTotals(
  rows: readonly CostCenterAllocationMonthlySource[],
  from: Date,
  to: Date,
  today: Date = new Date(),
): readonly MonthlyCompetenceDailyPoint[] {
  type DayBucket = {
    amount: Prisma.Decimal;
    received: Prisma.Decimal;
    outstanding: Prisma.Decimal;
  };
  const byDay = new Map<number, DayBucket>();
  const cashSplits = rows.map((row) =>
    deriveInstallmentCostCenterCashSplit({
      allocationAmount: row.amount,
      installmentTotal: row.installmentTotal,
      paid: row.paid,
      unpaid: row.unpaid,
      dueDate: row.dueDate,
      today,
    }),
  );
  const cashAvailable = cashSplits.every((split) => split.kind === 'EXACT');

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index]!;
    const competence = row.competenceDate;
    if (competence === null) {
      continue;
    }
    const time = competence.getTime();
    if (time < from.getTime() || time > to.getTime()) {
      continue;
    }
    const current = byDay.get(time) ?? {
      amount: ZERO,
      received: ZERO,
      outstanding: ZERO,
    };
    const split = cashSplits[index]!;
    byDay.set(time, {
      amount: current.amount.plus(row.amount),
      received:
        cashAvailable && split.kind === 'EXACT'
          ? current.received.plus(split.received)
          : current.received,
      outstanding:
        cashAvailable && split.kind === 'EXACT'
          ? current.outstanding.plus(split.outstanding)
          : current.outstanding,
    });
  }

  const points: MonthlyCompetenceDailyPoint[] = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    const bucket = byDay.get(cursor.getTime());
    points.push({
      date: cursor,
      amount: bucket?.amount ?? ZERO,
      received: cashAvailable ? (bucket?.received ?? ZERO) : null,
      outstanding: cashAvailable ? (bucket?.outstanding ?? ZERO) : null,
    });
    cursor = addCivilDays(cursor, 1);
  }
  return points;
}

export function toAllocationMonthlySources(
  rows: readonly {
    readonly amount: Prisma.Decimal;
    readonly installment: Pick<
      FinancialInstallmentReadRecord,
      'competenceDate' | 'categoryExternalIds' | 'total' | 'paid' | 'unpaid' | 'dueDate' | 'status'
    >;
  }[],
): readonly CostCenterAllocationMonthlySource[] {
  return rows.map((row) => ({
    amount: row.amount,
    competenceDate: row.installment.competenceDate,
    categoryExternalIds: row.installment.categoryExternalIds,
    installmentTotal: row.installment.total,
    paid: row.installment.paid,
    unpaid: row.installment.unpaid,
    dueDate: row.installment.dueDate,
    status: row.installment.status,
  }));
}

/**
 * Estoque / previsão filtrados por centro: exposição ≈ Σ allocation.amount
 * (não é unpaid residual; aproximação de exposição do centro no título ativo).
 */
export function toAllocationExposureInstallments(
  rows: readonly {
    readonly amount: Prisma.Decimal;
    readonly installment: Pick<
      FinancialInstallmentReadRecord,
      'id' | 'dueDate' | 'status' | 'categoryExternalIds'
    >;
  }[],
): readonly {
  readonly id: string;
  readonly dueDate: Date;
  readonly unpaid: Prisma.Decimal;
  readonly status: FinancialInstallmentReadRecord['status'];
  readonly categoryExternalIds: readonly string[];
}[] {
  return rows.map((row) => ({
    id: row.installment.id,
    dueDate: row.installment.dueDate,
    unpaid: row.amount,
    status: row.installment.status,
    categoryExternalIds: row.installment.categoryExternalIds,
  }));
}

function uniqueCategoryIds(raw: readonly string[]): readonly string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const value of raw) {
    const id = value.trim();
    if (id === '' || seen.has(id)) {
      continue;
    }
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

function shareOfTotal(amount: Prisma.Decimal, total: Prisma.Decimal): Prisma.Decimal {
  if (total.equals(ZERO)) {
    return ZERO;
  }
  return amount.div(total).times(HUNDRED);
}

function kindRank(kind: PayableCompositionBucketKind): number {
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

function sortBuckets(buckets: readonly AmountBucket[]): AmountBucket[] {
  return [...buckets].sort((left, right) => {
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
