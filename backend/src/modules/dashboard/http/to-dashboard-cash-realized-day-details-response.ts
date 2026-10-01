import type { Prisma } from '../../../generated/prisma/client.js';
import type { CashRealizedDayDetails } from '../../analytics/domain/cash-realized-day-details.js';
import type { DashboardCashRealizedDayDetailsResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}

export function toDashboardCashRealizedDayDetailsResponse(
  details: CashRealizedDayDetails,
): DashboardCashRealizedDayDetailsResponse {
  return {
    date: details.date,
    direction: details.direction,
    completeness: details.completeness,
    total: serializeNullableDecimal(details.total),
    returnedSum: serializeNullableDecimal(details.returnedSum),
    difference: serializeNullableDecimal(details.difference),
    hasMore: details.hasMore,
    itemCount: details.itemCount,
    limit: details.limit,
    items: details.items.map((item) => ({
      occurredOn: serializeCivilDate(item.occurredOn),
      attributedAmount: serializeDecimal(item.attributedAmount),
      partyName: item.partyName,
      description: item.description,
      displayLabel: item.displayLabel,
      categoryNames: [...item.categoryNames],
      costCenterLabel: item.costCenterLabel,
    })),
  };
}
