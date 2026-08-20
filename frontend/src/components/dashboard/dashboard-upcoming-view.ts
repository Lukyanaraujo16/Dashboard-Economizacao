import type {
  DashboardUpcomingDays,
  DashboardUpcomingInstallmentStatus,
  DashboardUpcomingItem,
} from '../../services/dashboard/upcoming.types';

export type UpcomingKind = 'receivable' | 'payable';

export type UpcomingListRow = {
  readonly kind: UpcomingKind;
  readonly id: string;
  readonly dueDate: string;
  readonly unpaid: string;
  readonly status: DashboardUpcomingInstallmentStatus;
};

export function mergeUpcomingRows(
  receivables: readonly DashboardUpcomingItem[],
  payables: readonly DashboardUpcomingItem[],
): readonly UpcomingListRow[] {
  const rows: UpcomingListRow[] = [
    ...receivables.map((item) => ({ ...item, kind: 'receivable' as const })),
    ...payables.map((item) => ({ ...item, kind: 'payable' as const })),
  ];
  return rows.sort((left, right) => {
    if (left.dueDate !== right.dueDate) {
      return left.dueDate < right.dueDate ? -1 : 1;
    }
    if (left.id !== right.id) {
      return left.id < right.id ? -1 : 1;
    }
    return 0;
  });
}

export function upcomingKindLabel(kind: UpcomingKind): string {
  return kind === 'receivable' ? 'A receber' : 'A pagar';
}

export function upcomingStatusLabel(
  status: DashboardUpcomingInstallmentStatus,
  kind: UpcomingKind,
): string {
  if (status === 'OPEN') {
    return 'Em aberto';
  }
  if (status === 'OVERDUE') {
    return 'Atrasado';
  }
  return kind === 'receivable' ? 'Parcialmente recebido' : 'Parcialmente pago';
}

export function upcomingEmptyMessage(days: DashboardUpcomingDays): string {
  return `Nenhum vencimento nos próximos ${days} dias.`;
}

/** Data civil YYYY-MM-DD → pt-BR, sem Date() (evita fuso). */
export function formatCivilDatePtBr(value: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) {
    return value;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}
