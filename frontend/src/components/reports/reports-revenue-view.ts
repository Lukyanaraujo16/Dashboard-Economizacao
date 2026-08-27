import { formatMonthKeyPtBr } from '../dashboard/dashboard-forecast-view';
import type { ReportsRevenueResponse } from '../../services/reports/revenue.types';

const ZEROISH = /^-?0+(\.0+)?$/;

export function isRevenueReportEmpty(data: ReportsRevenueResponse): boolean {
  const received = data.receivables.received;
  const outstanding = data.receivables.outstanding;
  const hasMovement =
    (received !== null && !ZEROISH.test(received)) ||
    (outstanding !== null && !ZEROISH.test(outstanding));
  return !hasMovement && data.receivables.items.length === 0;
}

export function revenueReportPeriodLabel(from: string, to: string): string {
  if (from === to) {
    return formatMonthKeyPtBr(from);
  }
  return `${formatMonthKeyPtBr(from)} — ${formatMonthKeyPtBr(to)}`;
}
