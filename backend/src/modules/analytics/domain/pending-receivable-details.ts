import type { FinancialCategoryReadRecord } from '../../finance/domain/types.js';
import type { ReceivableStockDetailItem } from './types.js';
import { resolveReceivableCategoryNames } from './expected-receivable-details.js';
import {
  comparePendingStockItems,
  type PendingStockItem,
} from './pending-installment-stock.js';

export function buildReceivableStockDetailItems(input: {
  readonly items: readonly PendingStockItem[];
  readonly partyNames: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>>;
}): ReceivableStockDetailItem[] {
  const customerNameFor = (installment: PendingStockItem['installment']) =>
    installment.partyId ? (input.partyNames.get(installment.partyId) ?? null) : null;

  const sorted = [...input.items].sort((left, right) =>
    comparePendingStockItems(left, right, customerNameFor),
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
    situation: row.situation,
    overdueDays: row.overdueDays,
  }));
}
