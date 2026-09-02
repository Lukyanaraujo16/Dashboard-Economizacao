import type { Prisma } from '../../../generated/prisma/client.js';
import type { ExpectedReceivableDetails } from '../../analytics/domain/types.js';
import type { DashboardExpectedReceivableDetailsResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}

export function toDashboardExpectedReceivableDetailsResponse(
  details: ExpectedReceivableDetails,
): DashboardExpectedReceivableDetailsResponse {
  return {
    today: serializeCivilDate(details.today),
    monthKey: details.monthKey,
    from: serializeCivilDate(details.from),
    to: serializeCivilDate(details.to),
    available: details.available,
    total: serializeNullableDecimal(details.total),
    items: details.items.map((item) => ({
      id: item.id,
      externalId: item.externalId,
      dueDate: serializeCivilDate(item.dueDate),
      amount: serializeDecimal(item.amount),
      description: item.description,
      customerName: item.customerName,
      categoryNames: [...item.categoryNames],
    })),
  };
}
