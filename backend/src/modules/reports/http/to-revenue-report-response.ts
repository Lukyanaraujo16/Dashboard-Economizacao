import type { Prisma } from '../../../generated/prisma/client.js';
import type { MonthlyCompetenceRevenueResult } from '../../analytics/domain/types.js';
import { toDashboardMonthlyRevenueResponse } from '../../dashboard/http/to-dashboard-monthly-revenue-response.js';
import { serializeCivilDate, serializeDecimal } from '../../dashboard/http/to-dashboard-overview-response.js';
import { aggregateRevenueReport } from '../domain/aggregate-revenue-report.js';
import type { RevenueReportResponse } from '../domain/types.js';

export function toRevenueReportResponse(
  fromKey: string,
  toKey: string,
  months: readonly MonthlyCompetenceRevenueResult[],
): RevenueReportResponse {
  const first = months[0];
  if (first === undefined) {
    throw new Error('relatório de receita exige ao menos um mês.');
  }
  const aggregated = aggregateRevenueReport(months);
  return {
    today: serializeCivilDate(first.today),
    from: fromKey,
    to: toKey,
    ...(aggregated.costCenterCashSplit ? {} : { costCenterCashSplit: false as const }),
    receivables: {
      total: serializeDecimal(aggregated.total),
      received: serializeNullableDecimal(aggregated.received),
      outstanding: serializeNullableDecimal(aggregated.outstanding),
      overdue: serializeNullableDecimal(aggregated.overdue),
      classified: serializeDecimal(aggregated.classified),
      uncategorized: serializeDecimal(aggregated.uncategorized),
      imprecise: serializeDecimal(aggregated.imprecise),
      coverageRate:
        aggregated.coverageRate === null ? null : serializeDecimal(aggregated.coverageRate),
      items: aggregated.items.map((item) => ({
        kind: item.kind,
        name: item.name,
        amount: serializeDecimal(item.amount),
        received: serializeNullableDecimal(item.received),
        outstanding: serializeNullableDecimal(item.outstanding),
        percentage: serializeDecimal(item.percentage),
      })),
    },
    months: months.map((month) => ({
      monthKey: month.monthKey,
      receivables: toDashboardMonthlyRevenueResponse(month).receivables,
    })),
  };
}

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}
