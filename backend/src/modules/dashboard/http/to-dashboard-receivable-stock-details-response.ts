import type { Prisma } from '../../../generated/prisma/client.js';
import type { ReceivableStockDetails } from '../../analytics/domain/types.js';
import type { DashboardReceivableStockDetailsResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}

export function toDashboardReceivableStockDetailsResponse(
  details: ReceivableStockDetails,
): DashboardReceivableStockDetailsResponse {
  return {
    today: serializeCivilDate(details.today),
    available: details.available,
    total: serializeNullableDecimal(details.total),
    overdue: serializeNullableDecimal(details.overdue),
    dueToday: serializeNullableDecimal(details.dueToday),
    upcoming: serializeNullableDecimal(details.upcoming),
    items: details.items.map((item) => ({
      id: item.id,
      externalId: item.externalId,
      dueDate: serializeCivilDate(item.dueDate),
      amount: serializeDecimal(item.amount),
      description: item.description,
      customerName: item.customerName,
      categoryNames: [...item.categoryNames],
      situation: item.situation,
      overdueDays: item.overdueDays,
    })),
  };
}
