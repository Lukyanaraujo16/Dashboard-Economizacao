import type { MonthlyCompetenceRevenueResult } from '../../analytics/domain/types.js';
import type { DashboardMonthlyRevenueResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

export function toDashboardMonthlyRevenueResponse(
  revenue: MonthlyCompetenceRevenueResult,
): DashboardMonthlyRevenueResponse {
  return {
    today: serializeCivilDate(revenue.today),
    monthKey: revenue.monthKey,
    from: serializeCivilDate(revenue.from),
    to: serializeCivilDate(revenue.to),
    receivables: {
      total: serializeDecimal(revenue.total),
      received: serializeDecimal(revenue.received),
      outstanding: serializeDecimal(revenue.outstanding),
      overdue: serializeDecimal(revenue.overdue),
      classified: serializeDecimal(revenue.classified),
      uncategorized: serializeDecimal(revenue.uncategorized),
      imprecise: serializeDecimal(revenue.imprecise),
      coverageRate: revenue.coverageRate === null ? null : serializeDecimal(revenue.coverageRate),
      items: revenue.items.map((item) => ({
        kind: item.kind,
        name: item.name,
        amount: serializeDecimal(item.amount),
        received: serializeDecimal(item.received),
        outstanding: serializeDecimal(item.outstanding),
        percentage: serializeDecimal(item.percentage),
      })),
      daily: revenue.daily.map((point) => ({
        date: serializeCivilDate(point.date),
        amount: serializeDecimal(point.amount),
        received: serializeDecimal(point.received),
        outstanding: serializeDecimal(point.outstanding),
      })),
    },
  };
}
