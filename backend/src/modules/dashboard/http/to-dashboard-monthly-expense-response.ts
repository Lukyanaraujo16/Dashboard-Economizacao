import type { Prisma } from '../../../generated/prisma/client.js';
import type { MonthlyCompetenceExpenseResult } from '../../analytics/domain/types.js';
import type { DashboardMonthlyExpenseResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

export function toDashboardMonthlyExpenseResponse(
  expense: MonthlyCompetenceExpenseResult,
): DashboardMonthlyExpenseResponse {
  const cashSplit = expense.costCenterCashSplit;
  return {
    today: serializeCivilDate(expense.today),
    monthKey: expense.monthKey,
    from: serializeCivilDate(expense.from),
    to: serializeCivilDate(expense.to),
    ...(cashSplit ? {} : { costCenterCashSplit: false as const }),
    payables: {
      total: serializeDecimal(expense.total),
      paid: serializeNullableDecimal(expense.received),
      outstanding: serializeNullableDecimal(expense.outstanding),
      overdue: serializeNullableDecimal(expense.overdue),
      classified: serializeDecimal(expense.classified),
      uncategorized: serializeDecimal(expense.uncategorized),
      imprecise: serializeDecimal(expense.imprecise),
      coverageRate: expense.coverageRate === null ? null : serializeDecimal(expense.coverageRate),
      items: expense.items.map((item) => ({
        kind: item.kind,
        name: item.name,
        amount: serializeDecimal(item.amount),
        paid: serializeNullableDecimal(item.received),
        outstanding: serializeNullableDecimal(item.outstanding),
        percentage: serializeDecimal(item.percentage),
      })),
      daily: expense.daily.map((point) => ({
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
