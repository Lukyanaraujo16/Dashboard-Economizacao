import {
  serializeCivilDate,
  serializeDecimal,
} from '../../dashboard/http/to-dashboard-overview-response.js';
import type { ReportCashDetails } from '../domain/report-cash-details.js';
import type { ReportCashDetailsResponse } from '../domain/types.js';

export function toReportCashDetailsResponse(
  fromKey: string,
  toKey: string,
  details: ReportCashDetails,
): ReportCashDetailsResponse {
  return {
    today: serializeCivilDate(details.today),
    from: fromKey,
    to: toKey,
    situation: details.situation,
    available: details.available,
    unavailableReason: details.unavailableReason,
    totalAmount: details.totalAmount === null ? null : serializeDecimal(details.totalAmount),
    itemCount: details.itemCount,
    limit: details.limit,
    offset: details.offset,
    items: details.items.map((item) => ({
      date: serializeCivilDate(item.date),
      description: item.description,
      partyName: item.partyName,
      categoryNames: [...item.categoryNames],
      costCenterNames: [...item.costCenterNames],
      situation: item.situation,
      amount: serializeDecimal(item.amount),
      installmentKind: item.installmentKind,
      installmentExternalId: item.installmentExternalId,
      ...(item.settlementExternalId === undefined
        ? {}
        : { settlementExternalId: item.settlementExternalId }),
    })),
  };
}
