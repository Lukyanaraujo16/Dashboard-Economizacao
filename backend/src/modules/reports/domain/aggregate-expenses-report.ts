import type { MonthlyCompetenceExpenseResult } from '../../analytics/domain/types.js';
import {
  aggregateRevenueReport,
  type AggregatedRevenueReport,
} from './aggregate-revenue-report.js';

export type AggregatedExpensesReport = AggregatedRevenueReport;

/**
 * Mesma soma de competência da Receita (domínio interno usa `received`).
 * O serializer HTTP mapeia para `paid`.
 */
export function aggregateExpensesReport(
  months: readonly MonthlyCompetenceExpenseResult[],
): AggregatedExpensesReport {
  return aggregateRevenueReport(months);
}
