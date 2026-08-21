import { Prisma } from '../../../generated/prisma/client.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../../finance/domain/types.js';
import { addCivilDays } from './civil-calendar.js';
import {
  DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES,
  IMPRECISE_PAYABLE_BUCKET_NAME,
  OTHER_PAYABLE_CATEGORIES_BUCKET_NAME,
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
 * received/outstanding/overdue ficam null (PARCIAL — sem split pago/em aberto seguro).
 * Categorias: D8 sobre categoryExternalIds da parcela (1 = nomeada; 0 = sem; 2+ = imprecisa).
 */
export function calculateMonthlyCompetenceFromAllocations(
  rows: readonly CostCenterAllocationMonthlySource[],
  categories: readonly CategoryLookup[],
  expectedType: CompositionCategoryType = 'REVENUE',
  maxNamedCategories: number = DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES,
): {
  readonly total: Prisma.Decimal;
  readonly received: null;
  readonly outstanding: null;
  readonly overdue: null;
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

  for (const row of rows) {
    total = total.plus(row.amount);
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

  const classifiedAmount = [...named.values()].reduce(
    (sum, bucket) => sum.plus(bucket.amount),
    ZERO,
  );
  const namedBuckets = [...named.values()];
  const quality: AmountBucket[] = [];
  if (uncategorized.greaterThan(ZERO)) {
    quality.push({
      kind: 'uncategorized',
      key: 'uncategorized',
      name: UNCATEGORIZED_PAYABLE_BUCKET_NAME,
      amount: uncategorized,
    });
  }
  if (imprecise.greaterThan(ZERO)) {
    quality.push({
      kind: 'imprecise',
      key: 'imprecise',
      name: IMPRECISE_PAYABLE_BUCKET_NAME,
      amount: imprecise,
    });
  }

  let presented: AmountBucket[] = [...namedBuckets, ...quality];
  if (namedBuckets.length > maxNamedCategories) {
    const sortedNamed = sortBuckets(namedBuckets);
    const kept = sortedNamed.slice(0, maxNamedCategories);
    const folded = sortedNamed.slice(maxNamedCategories);
    const otherAmount = folded.reduce((sum, bucket) => sum.plus(bucket.amount), ZERO);
    presented = [
      ...kept,
      {
        kind: 'other',
        key: 'other',
        name: OTHER_PAYABLE_CATEGORIES_BUCKET_NAME,
        amount: otherAmount,
      },
      ...quality,
    ];
  }

  const items = sortBuckets(presented).map((bucket) => ({
    ...bucket,
    percentage: shareOfTotal(bucket.amount, total),
    received: null,
    outstanding: null,
  }));

  return {
    total,
    received: null,
    outstanding: null,
    overdue: null,
    classified: classifiedAmount,
    uncategorized,
    imprecise,
    coverageRate: total.equals(ZERO) ? null : classifiedAmount.div(total).times(HUNDRED),
    items,
  };
}

/**
 * Série diária por competenceDate com Σ allocation.amount.
 * received/outstanding null (sem split de caixa por centro).
 */
export function buildDailyCompetenceAllocationTotals(
  rows: readonly CostCenterAllocationMonthlySource[],
  from: Date,
  to: Date,
): readonly MonthlyCompetenceDailyPoint[] {
  const byDay = new Map<number, Prisma.Decimal>();
  for (const row of rows) {
    const competence = row.competenceDate;
    if (competence === null) {
      continue;
    }
    const time = competence.getTime();
    if (time < from.getTime() || time > to.getTime()) {
      continue;
    }
    byDay.set(time, (byDay.get(time) ?? ZERO).plus(row.amount));
  }

  const points: MonthlyCompetenceDailyPoint[] = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    points.push({
      date: cursor,
      amount: byDay.get(cursor.getTime()) ?? ZERO,
      received: null,
      outstanding: null,
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
      'competenceDate' | 'categoryExternalIds'
    >;
  }[],
): readonly CostCenterAllocationMonthlySource[] {
  return rows.map((row) => ({
    amount: row.amount,
    competenceDate: row.installment.competenceDate,
    categoryExternalIds: row.installment.categoryExternalIds,
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
