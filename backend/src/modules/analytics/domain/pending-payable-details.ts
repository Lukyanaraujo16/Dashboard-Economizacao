import type { FinancialCategoryReadRecord } from '../../finance/domain/types.js';
import type { PayableStockDetailItem } from './types.js';
import { resolvePayableCategoryNames } from './expected-payable-details.js';
import {
  comparePendingStockItems,
  type PendingStockItem,
} from './pending-installment-stock.js';

export function buildPayableStockDetailItems(input: {
  readonly items: readonly PendingStockItem[];
  readonly partyNames: ReadonlyMap<string, string>;
  readonly categories: ReadonlyMap<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>>;
}): PayableStockDetailItem[] {
  const supplierNameFor = (installment: PendingStockItem['installment']) =>
    installment.partyId ? (input.partyNames.get(installment.partyId) ?? null) : null;

  const sorted = [...input.items].sort((left, right) =>
    comparePendingStockItems(left, right, supplierNameFor),
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
    situation: row.situation,
    overdueDays: row.overdueDays,
  }));
}
