import { Prisma } from '../../../generated/prisma/client.js';
import type { FinancialCategoryReadRecord } from '../../finance/domain/types.js';
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

export type CashAttributedCategorySource = {
  readonly amount: Prisma.Decimal;
  readonly categoryExternalIds: readonly string[];
};

type CategoryLookup = Pick<FinancialCategoryReadRecord, 'externalId' | 'name' | 'type'>;

export type CashRealizedCategoryBucket = {
  readonly kind: PayableCompositionBucketKind;
  readonly key: string;
  readonly name: string;
  readonly amount: Prisma.Decimal;
};

export type CashRealizedCategoryCompositionItem = CashRealizedCategoryBucket & {
  readonly percentage: Prisma.Decimal;
};

/**
 * Composição D8 de caixa realizado: Σ amount por categoria precisa.
 * Percentuais e fechamento sobre o total atribuído (deve = realized.inflows/outflows).
 */
export type CashRealizedCategoryComposition = {
  readonly total: Prisma.Decimal;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly CashRealizedCategoryCompositionItem[];
};

/**
 * Classifica baixas já atribuídas (netAmount ou share de CC) por categoria D8.
 * Sem rateio. Parcela sem IDs → Sem categoria. Multi/tipo errado/ausente → impreciso.
 */
export function classifyCashAmountsByCategory(
  rows: readonly CashAttributedCategorySource[],
  categories: readonly CategoryLookup[],
  expectedType: CompositionCategoryType,
  maxNamedCategories: number = DASHBOARD_EXPENSE_COMPOSITION_MAX_NAMED_CATEGORIES,
): CashRealizedCategoryComposition {
  const catalog = new Map(categories.map((category) => [category.externalId, category]));
  const named = new Map<string, CashRealizedCategoryBucket>();
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

  const classified = [...named.values()].reduce((sum, bucket) => sum.plus(bucket.amount), ZERO);
  const namedBuckets = [...named.values()];
  const quality: CashRealizedCategoryBucket[] = [];
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

  let presented: CashRealizedCategoryBucket[] = [...namedBuckets, ...quality];
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
  }));

  return {
    total,
    classified,
    uncategorized,
    imprecise,
    coverageRate: total.equals(ZERO) ? null : classified.div(total).times(HUNDRED),
    items,
  };
}

export function collectCashCategoryExternalIds(
  rows: readonly Pick<CashAttributedCategorySource, 'categoryExternalIds'>[],
): readonly string[] {
  const ids = new Set<string>();
  for (const row of rows) {
    for (const id of uniqueCategoryIds(row.categoryExternalIds)) {
      ids.add(id);
    }
  }
  return [...ids];
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
  buckets: readonly CashRealizedCategoryBucket[],
): readonly CashRealizedCategoryBucket[] {
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
