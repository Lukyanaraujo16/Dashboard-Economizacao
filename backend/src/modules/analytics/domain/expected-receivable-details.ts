import type { FinancialCategoryReadRecord } from '../../finance/domain/types.js';
import type { ExpectedReceivableDetailItem } from './types.js';
import type { ExpectedOpenReceivableItem } from './expected-open-receivables.js';
import { compareExpectedOpenReceivableItems } from './expected-open-receivables.js';

export function resolveReceivableCategoryNames(
  categoryExternalIds: readonly string[],
  catalog: ReadonlyMap<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>>,
): string[] {
  const names: string[] = [];
  for (const externalId of categoryExternalIds) {
    const category = catalog.get(externalId);
    if (category?.type === 'REVENUE') {
      names.push(category.name);
    }
  }
  return names;
}

export function buildExpectedReceivableDetailItems(input: {
  readonly items: readonly ExpectedOpenReceivableItem[];
  readonly partyNames: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>>;
}): ExpectedReceivableDetailItem[] {
  const customerNameFor = (installment: ExpectedOpenReceivableItem['installment']) =>
    installment.partyId ? (input.partyNames.get(installment.partyId) ?? null) : null;

  const sorted = [...input.items].sort((left, right) =>
    compareExpectedOpenReceivableItems(left, right, customerNameFor),
  );

  return sorted.map((row) => ({
    id: row.installment.id,
    externalId: row.installment.externalId,
    dueDate: row.installment.dueDate,
    amount: row.amount,
    description: row.installment.description,
    customerName: customerNameFor(row.installment),
    categoryNames: resolveReceivableCategoryNames(
      row.installment.categoryExternalIds,
      input.categories,
    ),
  }));
}
