import type { FinancialCategoryReadRecord } from '../../finance/domain/types.js';
import type { ExpectedPayableDetailItem } from './types.js';
import type { ExpectedOpenPayableItem } from './expected-open-payables.js';
import { compareExpectedOpenPayableItems } from './expected-open-payables.js';

export function resolvePayableCategoryNames(
  categoryExternalIds: readonly string[],
  catalog: ReadonlyMap<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>>,
): string[] {
  const names: string[] = [];
  for (const externalId of categoryExternalIds) {
    const category = catalog.get(externalId);
    if (category?.type === 'EXPENSE') {
      names.push(category.name);
    }
  }
  return names;
}

export function buildExpectedPayableDetailItems(input: {
  readonly items: readonly ExpectedOpenPayableItem[];
  readonly partyNames: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>>;
}): ExpectedPayableDetailItem[] {
  const supplierNameFor = (installment: ExpectedOpenPayableItem['installment']) =>
    installment.partyId ? (input.partyNames.get(installment.partyId) ?? null) : null;

  const sorted = [...input.items].sort((left, right) =>
    compareExpectedOpenPayableItems(left, right, supplierNameFor),
  );

  return sorted.map((row) => ({
    id: row.installment.id,
    externalId: row.installment.externalId,
    dueDate: row.installment.dueDate,
    amount: row.amount,
    description: row.installment.description,
    supplierName: supplierNameFor(row.installment),
    categoryNames: resolvePayableCategoryNames(
      row.installment.categoryExternalIds,
      input.categories,
    ),
  }));
}
