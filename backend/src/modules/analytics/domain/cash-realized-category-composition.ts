import { Prisma } from '../../../generated/prisma/client.js';
import type { FinancialCategoryReadRecord } from '../../finance/domain/types.js';
import {
  IMPRECISE_PAYABLE_BUCKET_NAME,
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

/** Identidade estável do bucket D8 (externalId nominal ou uncategorized/imprecise). */
export type CashRealizedCategoryIdentity = {
  readonly kind: PayableCompositionBucketKind;
  readonly key: string;
  readonly name: string;
};

/**
 * Resolve o bucket D8 de uma baixa já atribuída — mesma regra de
 * `classifyCashAmountsByCategory` (sem inventar segundo algoritmo).
 */
export function resolveCashAttributedCategoryBucket(
  categoryExternalIds: readonly string[],
  categories: readonly CategoryLookup[],
  expectedType: CompositionCategoryType,
): CashRealizedCategoryIdentity {
  const catalog = new Map(categories.map((category) => [category.externalId, category]));
  const ids = uniqueCategoryIds(categoryExternalIds);
  if (ids.length === 0) {
    return {
      kind: 'uncategorized',
      key: 'uncategorized',
      name: UNCATEGORIZED_PAYABLE_BUCKET_NAME,
    };
  }
  if (ids.length > 1) {
    return {
      kind: 'imprecise',
      key: 'imprecise',
      name: IMPRECISE_PAYABLE_BUCKET_NAME,
    };
  }
  const category = catalog.get(ids[0]!);
  if (!category || category.type !== expectedType) {
    return {
      kind: 'imprecise',
      key: 'imprecise',
      name: IMPRECISE_PAYABLE_BUCKET_NAME,
    };
  }
  return {
    kind: 'category',
    key: category.externalId,
    name: category.name,
  };
}

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
): CashRealizedCategoryComposition {
  const named = new Map<string, CashRealizedCategoryBucket>();
  let uncategorized = ZERO;
  let imprecise = ZERO;
  let total = ZERO;

  for (const row of rows) {
    total = total.plus(row.amount);
    const bucket = resolveCashAttributedCategoryBucket(
      row.categoryExternalIds,
      categories,
      expectedType,
    );
    if (bucket.kind === 'uncategorized') {
      uncategorized = uncategorized.plus(row.amount);
      continue;
    }
    if (bucket.kind === 'imprecise') {
      imprecise = imprecise.plus(row.amount);
      continue;
    }
    const current = named.get(bucket.key);
    named.set(bucket.key, {
      kind: 'category',
      key: bucket.key,
      name: bucket.name,
      amount: (current?.amount ?? ZERO).plus(row.amount),
    });
  }

  const classified = [...named.values()].reduce((sum, bucket) => sum.plus(bucket.amount), ZERO);
  const presented: CashRealizedCategoryBucket[] = [...named.values()];
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
