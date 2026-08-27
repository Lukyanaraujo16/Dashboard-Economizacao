import type { ReportsExpensesResponse } from '../../services/reports/expenses.types';
import { revenueReportPeriodLabel } from './reports-revenue-view';

export { revenueReportPeriodLabel };

const ZEROISH = /^-?0+(\.0+)?$/;

export function isExpensesReportEmpty(data: ReportsExpensesResponse): boolean {
  const paid = data.payables.paid;
  const outstanding = data.payables.outstanding;
  const hasMovement =
    (paid !== null && !ZEROISH.test(paid)) ||
    (outstanding !== null && !ZEROISH.test(outstanding));
  return !hasMovement && data.payables.items.length === 0;
}
