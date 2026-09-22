import type { Prisma } from '../../../generated/prisma/client.js';
import type { CashRealizedDetails } from '../../analytics/domain/cash-realized-details.js';
import type { DashboardCashRealizedDetailsResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}

export function toDashboardCashRealizedDetailsResponse(
  details: CashRealizedDetails,
): DashboardCashRealizedDetailsResponse {
  return {
    today: serializeCivilDate(details.today),
    monthKey: details.monthKey,
    from: serializeCivilDate(details.from),
    to: serializeCivilDate(details.to),
    direction: details.direction,
    categoryKey: details.categoryKey,
    categoryKind: details.categoryKind,
    available: details.available,
    total: serializeNullableDecimal(details.total),
    itemCount: details.itemCount,
    limit: details.limit,
    offset: details.offset,
    items: details.items.map((item) => ({
      settlementExternalId: item.settlementExternalId,
      installmentExternalId: item.installmentExternalId,
      installmentKind: item.installmentKind,
      occurredOn: serializeCivilDate(item.occurredOn),
      netAmount: serializeDecimal(item.netAmount),
      attributedAmount: serializeDecimal(item.attributedAmount),
      description: item.description,
      partyName: item.partyName,
      categoryNames: [...item.categoryNames],
      categoryExternalIds: [...item.categoryExternalIds],
      categoryKey: item.categoryKey,
      categoryKind: item.categoryKind,
      categoryName: item.categoryName,
    })),
  };
}
