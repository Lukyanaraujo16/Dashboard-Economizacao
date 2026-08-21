import type { Prisma } from '../../../generated/prisma/client.js';
import type { MonthlyCompetenceRevenueResult } from '../../analytics/domain/types.js';
import type { DashboardMonthlyRevenueResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

export function toDashboardMonthlyRevenueResponse(
  revenue: MonthlyCompetenceRevenueResult,
): DashboardMonthlyRevenueResponse {
  const cashSplit = revenue.costCenterCashSplit;
  return {
    today: serializeCivilDate(revenue.today),
    monthKey: revenue.monthKey,
    from: serializeCivilDate(revenue.from),
    to: serializeCivilDate(revenue.to),
    ...(cashSplit ? {} : { costCenterCashSplit: false as const }),
    receivables: {
      total: serializeDecimal(revenue.total),
      received: serializeNullableDecimal(revenue.received),
      outstanding: serializeNullableDecimal(revenue.outstanding),
      overdue: serializeNullableDecimal(revenue.overdue),
      classified: serializeDecimal(revenue.classified),
      uncategorized: serializeDecimal(revenue.uncategorized),
      imprecise: serializeDecimal(revenue.imprecise),
      coverageRate: revenue.coverageRate === null ? null : serializeDecimal(revenue.coverageRate),
      items: revenue.items.map((item) => ({
        kind: item.kind,
        name: item.name,
        amount: serializeDecimal(item.amount),
        received: serializeNullableDecimal(item.received),
        outstanding: serializeNullableDecimal(item.outstanding),
        percentage: serializeDecimal(item.percentage),
      })),
      daily: revenue.daily.map((point) => ({
        date: serializeCivilDate(point.date),
        amount: serializeDecimal(point.amount),
        received: serializeNullableDecimal(point.received),
        outstanding: serializeNullableDecimal(point.outstanding),
      })),
    },
  };
}

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}
