import { isExpenseCompositionEmpty } from '../dashboard/dashboard-expense-composition-view';
import { formatMonthKeyPtBr } from '../dashboard/dashboard-forecast-view';
import type { ReportsRevenueResponse } from '../../services/reports/revenue.types';

export function isRevenueReportEmpty(data: ReportsRevenueResponse): boolean {
  return isExpenseCompositionEmpty(data.receivables.items, data.receivables.total);
}

export function revenueReportPeriodLabel(from: string, to: string): string {
  if (from === to) {
    return formatMonthKeyPtBr(from);
  }
  return `${formatMonthKeyPtBr(from)} — ${formatMonthKeyPtBr(to)}`;
}
