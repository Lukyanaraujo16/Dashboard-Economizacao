import type { FinancialInstallmentStatus } from '../../../generated/prisma/client.js';
import type { UpcomingInstallment, UpcomingInstallments } from '../../analytics/domain/types.js';
import { summarizeUpcomingWindow } from '../../analytics/domain/upcoming.js';
import type {
  DashboardUpcomingDays,
  DashboardUpcomingInstallmentStatus,
  DashboardUpcomingItem,
  DashboardUpcomingResponse,
} from '../domain/types.js';
import { serializeCivilDate, serializeDecimal } from './to-dashboard-overview-response.js';

export function toDashboardUpcomingResponse(
  nDays: DashboardUpcomingDays,
  receivables: UpcomingInstallments,
  payables: UpcomingInstallments,
): DashboardUpcomingResponse {
  const summary = summarizeUpcomingWindow(receivables.items, payables.items);
  return {
    today: serializeCivilDate(receivables.today),
    nDays,
    from: serializeCivilDate(receivables.from),
    to: serializeCivilDate(receivables.to),
    summary: {
      receivable: serializeDecimal(summary.receivable),
      payable: serializeDecimal(summary.payable),
      net: serializeDecimal(summary.net),
    },
    receivables: { items: receivables.items.map(toItem) },
    payables: { items: payables.items.map(toItem) },
  };
}

function toItem(item: UpcomingInstallment): DashboardUpcomingItem {
  return {
    id: item.id,
    dueDate: serializeCivilDate(item.dueDate),
    unpaid: serializeDecimal(item.unpaid),
    status: toPublicStatus(item.status),
  };
}

function toPublicStatus(status: FinancialInstallmentStatus): DashboardUpcomingInstallmentStatus {
  if (status === 'OPEN' || status === 'OVERDUE' || status === 'PARTIALLY_PAID') {
    return status;
  }
  throw new Error('Status de parcela fora do contrato upcoming da Dashboard.');
}
