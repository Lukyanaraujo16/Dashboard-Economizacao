import type { MonthEndCashPressureResult } from '../../analytics/domain/month-end-cash-pressure.js';
import type { DashboardMonthEndCashPressureResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

export function toDashboardMonthEndCashPressureResponse(
  pressure: MonthEndCashPressureResult,
): DashboardMonthEndCashPressureResponse {
  return {
    today: serializeCivilDate(pressure.today),
    monthKey: pressure.monthKey,
    from: serializeCivilDate(pressure.from),
    to: serializeCivilDate(pressure.to),
    summary: {
      receivable: serializeDecimal(pressure.summary.receivable),
      payable: serializeDecimal(pressure.summary.payable),
      net: serializeDecimal(pressure.summary.net),
    },
  };
}
