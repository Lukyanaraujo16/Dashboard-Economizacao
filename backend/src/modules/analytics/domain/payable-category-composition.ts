import { Prisma } from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../../finance/domain/active-installment-status.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../../finance/domain/types.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/**
 * Buckets de qualidade D8 (não são categorias nominais Conta Azul).
 * Composições retornam TODAS as categorias nominais; Top N é só visual na UI.
 * `other` permanece no union apenas para tolerância defensiva de payloads legados —
 * o domínio novo NÃO produz kind=other.
 */
export const UNCATEGORIZED_PAYABLE_BUCKET_NAME = 'Sem categoria';
export const IMPRECISE_PAYABLE_BUCKET_NAME = 'Sem classificação precisa';

export type PayableCompositionBucketKind = 'category' | 'other' | 'uncategorized' | 'imprecise';

export type PayableCompositionBucket = {
  readonly kind: PayableCompositionBucketKind;
  readonly key: string;
  readonly name: string;
  readonly amount: Prisma.Decimal;
};

export type OpenPayablesCategoryComposition = {
  readonly total: Prisma.Decimal;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly PayableCompositionPresentedItem[];
};

export type PayableCompositionPresentedItem = PayableCompositionBucket & {
  readonly percentage: Prisma.Decimal;
};

type PayableCategorySource = Pick<
  FinancialInstallmentReadRecord,
  'unpaid' | 'status' | 'categoryExternalIds'
>;

type CategoryLookup = Pick<FinancialCategoryReadRecord, 'externalId' | 'name' | 'type'>;

export type CompositionCategoryType = 'EXPENSE' | 'REVENUE';

/**
 * D8 para estoque em aberto: exatamente uma categoria do tipo esperado
 * recebe 100% do unpaid. Sem rateio inventado.
 */
export function classifyOpenInstallmentsByCategory(
  installments: readonly PayableCategorySource[],
  categories: readonly CategoryLookup[],
  expectedType: CompositionCategoryType,
): {
  readonly total: Prisma.Decimal;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly buckets: readonly PayableCompositionBucket[];
} {
  const catalog = new Map(categories.map((category) => [category.externalId, category]));
  const named = new Map<string, PayableCompositionBucket>();
  let uncategorized = ZERO;
  let imprecise = ZERO;
  let total = ZERO;

  for (const installment of installments) {
    if (!isActiveStatus(installment.status)) {
      continue;
    }
    total = total.plus(installment.unpaid);
    const ids = uniqueCategoryIds(installment.categoryExternalIds);
    if (ids.length === 0) {
      uncategorized = uncategorized.plus(installment.unpaid);
      continue;
    }
    if (ids.length > 1) {
      imprecise = imprecise.plus(installment.unpaid);
      continue;
    }
    const category = catalog.get(ids[0]!);
    if (!category || category.type !== expectedType) {
      imprecise = imprecise.plus(installment.unpaid);
      continue;
    }
    const current = named.get(category.externalId);
    named.set(category.externalId, {
      kind: 'category',
      key: category.externalId,
      name: category.name,
      amount: (current?.amount ?? ZERO).plus(installment.unpaid),
    });
  }

  const classified = [...named.values()].reduce((sum, bucket) => sum.plus(bucket.amount), ZERO);
  const buckets: PayableCompositionBucket[] = [...named.values()];
  if (uncategorized.greaterThan(ZERO)) {
    buckets.push({
      kind: 'uncategorized',
      key: 'uncategorized',
      name: UNCATEGORIZED_PAYABLE_BUCKET_NAME,
      amount: uncategorized,
    });
  }
  if (imprecise.greaterThan(ZERO)) {
    buckets.push({
      kind: 'imprecise',
      key: 'imprecise',
      name: IMPRECISE_PAYABLE_BUCKET_NAME,
      amount: imprecise,
    });
  }

  return {
    total,
    classified,
    uncategorized,
    imprecise,
    buckets: sortBuckets(buckets),
  };
}

export function classifyOpenPayablesByCategory(
  payables: readonly PayableCategorySource[],
  categories: readonly CategoryLookup[],
) {
  return classifyOpenInstallmentsByCategory(payables, categories, 'EXPENSE');
}

export function classifyOpenReceivablesByCategory(
  receivables: readonly PayableCategorySource[],
  categories: readonly CategoryLookup[],
) {
  return classifyOpenInstallmentsByCategory(receivables, categories, 'REVENUE');
}

export function presentOpenPayablesCategoryComposition(
  classified: ReturnType<typeof classifyOpenInstallmentsByCategory>,
): OpenPayablesCategoryComposition {
  const items = sortBuckets(classified.buckets).map((bucket) => ({
    ...bucket,
    percentage: shareOfTotal(bucket.amount, classified.total),
  }));

  return {
    total: classified.total,
    classified: classified.classified,
    uncategorized: classified.uncategorized,
    imprecise: classified.imprecise,
    coverageRate: classified.total.equals(ZERO)
      ? null
      : classified.classified.div(classified.total).times(HUNDRED),
    items,
  };
}

export function collectPayableCategoryExternalIds(
  payables: readonly Pick<FinancialInstallmentReadRecord, 'categoryExternalIds' | 'status'>[],
): readonly string[] {
  return collectInstallmentCategoryExternalIds(payables);
}

export function collectInstallmentCategoryExternalIds(
  installments: readonly Pick<FinancialInstallmentReadRecord, 'categoryExternalIds' | 'status'>[],
): readonly string[] {
  const ids = new Set<string>();
  for (const installment of installments) {
    if (!isActiveStatus(installment.status)) {
      continue;
    }
    for (const id of uniqueCategoryIds(installment.categoryExternalIds)) {
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

function isActiveStatus(status: PayableCategorySource['status']): boolean {
  return (ACTIVE_INSTALLMENT_STATUSES as readonly string[]).includes(status);
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
  buckets: readonly PayableCompositionBucket[],
): readonly PayableCompositionBucket[] {
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
