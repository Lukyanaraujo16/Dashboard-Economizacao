import type { MonthlyCompetenceExpenseResult } from '../../analytics/domain/types.js';
import type { DashboardMonthlyExpenseResponse } from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

export function toDashboardMonthlyExpenseResponse(
  expense: MonthlyCompetenceExpenseResult,
): DashboardMonthlyExpenseResponse {
  return {
    today: serializeCivilDate(expense.today),
    monthKey: expense.monthKey,
    from: serializeCivilDate(expense.from),
    to: serializeCivilDate(expense.to),
    payables: {
      total: serializeDecimal(expense.total),
      paid: serializeDecimal(expense.received),
      outstanding: serializeDecimal(expense.outstanding),
      overdue: serializeDecimal(expense.overdue),
      classified: serializeDecimal(expense.classified),
      uncategorized: serializeDecimal(expense.uncategorized),
      imprecise: serializeDecimal(expense.imprecise),
      coverageRate: expense.coverageRate === null ? null : serializeDecimal(expense.coverageRate),
      items: expense.items.map((item) => ({
        kind: item.kind,
        name: item.name,
        amount: serializeDecimal(item.amount),
        paid: serializeDecimal(item.received),
        outstanding: serializeDecimal(item.outstanding),
        percentage: serializeDecimal(item.percentage),
      })),
      daily: expense.daily.map((point) => ({
        date: serializeCivilDate(point.date),
        amount: serializeDecimal(point.amount),
        received: serializeDecimal(point.received),
        outstanding: serializeDecimal(point.outstanding),
      })),
    },
  };
}
