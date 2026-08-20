import { Prisma } from '../../../generated/prisma/client.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../../finance/domain/types.js';
import {
  DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES,
  IMPRECISE_PAYABLE_BUCKET_NAME,
  OTHER_PAYABLE_CATEGORIES_BUCKET_NAME,
  UNCATEGORIZED_PAYABLE_BUCKET_NAME,
  type CompositionCategoryType,
  type PayableCompositionBucketKind,
} from './payable-category-composition.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export type MonthlyCompetenceRevenueSource = Pick<
  FinancialInstallmentReadRecord,
  'total' | 'paid' | 'unpaid' | 'dueDate' | 'categoryExternalIds' | 'status'
>;

type CategoryLookup = Pick<FinancialCategoryReadRecord, 'externalId' | 'name' | 'type'>;

export type MonthlyCompetenceRevenueBucket = {
  readonly kind: PayableCompositionBucketKind;
  readonly key: string;
  readonly name: string;
  readonly amount: Prisma.Decimal;
  readonly received: Prisma.Decimal;
  readonly outstanding: Prisma.Decimal;
};

export type MonthlyCompetenceRevenueCompositionItem = MonthlyCompetenceRevenueBucket & {
  readonly percentage: Prisma.Decimal;
};

export type MonthlyCompetenceRevenue = {
  readonly total: Prisma.Decimal;
  readonly received: Prisma.Decimal;
  readonly outstanding: Prisma.Decimal;
  readonly overdue: Prisma.Decimal;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly MonthlyCompetenceRevenueCompositionItem[];
};

/**
 * D8 sobre o total da receita de competência do mês (inclui PAID).
 * Sem rateio. Percentual e cobertura sobre o total do mês.
 */
export function calculateMonthlyCompetenceRevenue(
  installments: readonly MonthlyCompetenceRevenueSource[],
  categories: readonly CategoryLookup[],
  today: Date,
  maxNamedCategories: number = DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES,
  expectedType: CompositionCategoryType = 'REVENUE',
): MonthlyCompetenceRevenue {
  const catalog = new Map(categories.map((category) => [category.externalId, category]));
  const named = new Map<string, MonthlyCompetenceRevenueBucket>();
  let uncategorized = emptyMoney();
  let imprecise = emptyMoney();
  let totals = emptyMoney();
  let overdue = ZERO;
  const todayTime = today.getTime();

  for (const installment of installments) {
    totals = addInstallmentMoney(totals, installment);
    if (installment.dueDate.getTime() < todayTime) {
      overdue = overdue.plus(installment.unpaid);
    }
    const ids = uniqueCategoryIds(installment.categoryExternalIds);
    if (ids.length === 0) {
      uncategorized = addInstallmentMoney(uncategorized, installment);
      continue;
    }
    if (ids.length > 1) {
      imprecise = addInstallmentMoney(imprecise, installment);
      continue;
    }
    const category = catalog.get(ids[0]!);
    if (!category || category.type !== expectedType) {
      imprecise = addInstallmentMoney(imprecise, installment);
      continue;
    }
    const current =
      named.get(category.externalId) ?? emptyNamed(category.externalId, category.name);
    named.set(category.externalId, addInstallmentBucket(current, installment));
  }

  const classifiedAmount = [...named.values()].reduce(
    (sum, bucket) => sum.plus(bucket.amount),
    ZERO,
  );
  const namedBuckets = [...named.values()];
  const quality: MonthlyCompetenceRevenueBucket[] = [];
  if (uncategorized.amount.greaterThan(ZERO)) {
    quality.push({
      kind: 'uncategorized',
      key: 'uncategorized',
      name: UNCATEGORIZED_PAYABLE_BUCKET_NAME,
      ...uncategorized,
    });
  }
  if (imprecise.amount.greaterThan(ZERO)) {
    quality.push({
      kind: 'imprecise',
      key: 'imprecise',
      name: IMPRECISE_PAYABLE_BUCKET_NAME,
      ...imprecise,
    });
  }

  let presented: MonthlyCompetenceRevenueBucket[] = [...namedBuckets, ...quality];
  if (namedBuckets.length > maxNamedCategories) {
    const sortedNamed = sortBuckets(namedBuckets);
    const kept = sortedNamed.slice(0, maxNamedCategories);
    const folded = sortedNamed.slice(maxNamedCategories);
    const other = folded.reduce((acc, bucket) => addBucketMoney(acc, bucket), emptyMoney());
    presented = [
      ...kept,
      {
        kind: 'other',
        key: 'other',
        name: OTHER_PAYABLE_CATEGORIES_BUCKET_NAME,
        ...other,
      },
      ...quality,
    ];
  }

  const items = sortBuckets(presented).map((bucket) => ({
    ...bucket,
    percentage: shareOfTotal(bucket.amount, totals.amount),
  }));

  return {
    total: totals.amount,
    received: totals.received,
    outstanding: totals.outstanding,
    overdue,
    classified: classifiedAmount,
    uncategorized: uncategorized.amount,
    imprecise: imprecise.amount,
    coverageRate: totals.amount.equals(ZERO)
      ? null
      : classifiedAmount.div(totals.amount).times(HUNDRED),
    items,
  };
}

export function collectMonthlyRevenueCategoryExternalIds(
  installments: readonly Pick<FinancialInstallmentReadRecord, 'categoryExternalIds'>[],
): readonly string[] {
  const ids = new Set<string>();
  for (const installment of installments) {
    for (const id of uniqueCategoryIds(installment.categoryExternalIds)) {
      ids.add(id);
    }
  }
  return [...ids];
}

type MoneyTriple = {
  readonly amount: Prisma.Decimal;
  readonly received: Prisma.Decimal;
  readonly outstanding: Prisma.Decimal;
};

function emptyMoney(): MoneyTriple {
  return { amount: ZERO, received: ZERO, outstanding: ZERO };
}

function emptyNamed(key: string, name: string): MonthlyCompetenceRevenueBucket {
  return {
    kind: 'category',
    key,
    name,
    ...emptyMoney(),
  };
}

function addInstallmentMoney(
  current: MoneyTriple,
  installment: MonthlyCompetenceRevenueSource,
): MoneyTriple {
  return {
    amount: current.amount.plus(installment.total),
    received: current.received.plus(installment.paid),
    outstanding: current.outstanding.plus(installment.unpaid),
  };
}

function addInstallmentBucket(
  current: MonthlyCompetenceRevenueBucket,
  installment: MonthlyCompetenceRevenueSource,
): MonthlyCompetenceRevenueBucket {
  return {
    kind: current.kind,
    key: current.key,
    name: current.name,
    ...addInstallmentMoney(current, installment),
  };
}

function addBucketMoney(acc: MoneyTriple, bucket: MonthlyCompetenceRevenueBucket): MoneyTriple {
  return {
    amount: acc.amount.plus(bucket.amount),
    received: acc.received.plus(bucket.received),
    outstanding: acc.outstanding.plus(bucket.outstanding),
  };
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

function sortBuckets(
  buckets: readonly MonthlyCompetenceRevenueBucket[],
): MonthlyCompetenceRevenueBucket[] {
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
