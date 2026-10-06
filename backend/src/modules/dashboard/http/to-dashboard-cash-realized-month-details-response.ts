import type { Prisma } from '../../../generated/prisma/client.js';
import type { CashRealizedMonthDetails } from '../../analytics/domain/cash-realized-day-details.js';
import type { DashboardCashRealizedMonthDetailsResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}

export function toDashboardCashRealizedMonthDetailsResponse(
  details: CashRealizedMonthDetails,
): DashboardCashRealizedMonthDetailsResponse {
  return {
    monthKey: details.monthKey,
    from: serializeCivilDate(details.from),
    to: serializeCivilDate(details.to),
    direction: details.direction,
    completeness: details.completeness,
    total: serializeNullableDecimal(details.total),
    returnedSum: serializeNullableDecimal(details.returnedSum),
    difference: serializeNullableDecimal(details.difference),
    hasMore: details.hasMore,
    itemCount: details.itemCount,
    limit: details.limit,
    offset: details.offset,
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
