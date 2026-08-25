import { isExpenseCompositionEmpty } from '../dashboard/dashboard-expense-composition-view';
import type { ReportsExpensesResponse } from '../../services/reports/expenses.types';
import { revenueReportPeriodLabel } from './reports-revenue-view';

export { revenueReportPeriodLabel };

export function isExpensesReportEmpty(data: ReportsExpensesResponse): boolean {
  return isExpenseCompositionEmpty(data.payables.items, data.payables.total);
}
