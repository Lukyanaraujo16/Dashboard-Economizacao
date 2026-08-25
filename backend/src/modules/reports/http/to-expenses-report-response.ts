import type { Prisma } from '../../../generated/prisma/client.js';
import type { MonthlyCompetenceExpenseResult } from '../../analytics/domain/types.js';
import { toDashboardMonthlyExpenseResponse } from '../../dashboard/http/to-dashboard-monthly-expense-response.js';
import { serializeCivilDate, serializeDecimal } from '../../dashboard/http/to-dashboard-overview-response.js';
import { aggregateExpensesReport } from '../domain/aggregate-expenses-report.js';
import type { ExpensesReportResponse } from '../domain/types.js';

export function toExpensesReportResponse(
  fromKey: string,
  toKey: string,
  months: readonly MonthlyCompetenceExpenseResult[],
): ExpensesReportResponse {
  const first = months[0];
  if (first === undefined) {
    throw new Error('relatório de despesas exige ao menos um mês.');
  }
  const aggregated = aggregateExpensesReport(months);
  return {
    today: serializeCivilDate(first.today),
    from: fromKey,
    to: toKey,
    ...(aggregated.costCenterCashSplit ? {} : { costCenterCashSplit: false as const }),
    payables: {
      total: serializeDecimal(aggregated.total),
      paid: serializeNullableDecimal(aggregated.received),
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
        paid: serializeNullableDecimal(item.received),
        outstanding: serializeNullableDecimal(item.outstanding),
        percentage: serializeDecimal(item.percentage),
      })),
    },
    months: months.map((month) => ({
      monthKey: month.monthKey,
      payables: toDashboardMonthlyExpenseResponse(month).payables,
    })),
  };
}

function serializeNullableDecimal(value: Prisma.Decimal | null): string | null {
  return value === null ? null : serializeDecimal(value);
}
