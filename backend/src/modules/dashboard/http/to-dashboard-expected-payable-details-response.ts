import type { Prisma } from '../../../generated/prisma/client.js';
import type { ExpectedPayableDetails } from '../../analytics/domain/types.js';
import type { DashboardExpectedPayableDetailsResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}

export function toDashboardExpectedPayableDetailsResponse(
  details: ExpectedPayableDetails,
): DashboardExpectedPayableDetailsResponse {
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
      supplierName: item.supplierName,
      categoryNames: [...item.categoryNames],
    })),
  };
}
