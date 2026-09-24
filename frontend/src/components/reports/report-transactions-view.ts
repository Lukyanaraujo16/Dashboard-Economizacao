import type { ReportType } from '../../lib/reports-query';
import { REPORT_TYPE_EXPENSES } from '../../lib/reports-query';
import type {
  ReportCashDetailItem,
  ReportCashDetailSituation,
} from '../../services/reports/details.types';

export const REPORT_TRANSACTIONS_PAGE_SIZE = 25;

export const REPORT_DETAIL_SITUATIONS: readonly ReportCashDetailSituation[] = [
  'REALIZED',
  'EXPECTED',
  'OVERDUE',
];

export function reportTransactionsSectionTitle(): string {
  return 'Lançamentos do período';
}

export function reportTransactionsBlockTitle(
  type: ReportType,
  situation: ReportCashDetailSituation,
): string {
  if (situation === 'REALIZED') {
    return type === REPORT_TYPE_EXPENSES ? 'Saídas realizadas' : 'Entradas realizadas';
  }
  if (situation === 'EXPECTED') {
    return type === REPORT_TYPE_EXPENSES ? 'A pagar' : 'A receber';
  }
  return 'Vencido';
}

export function reportTransactionsSituationLabel(
  type: ReportType,
  situation: ReportCashDetailSituation,
): string {
  if (situation === 'REALIZED') {
    return 'Realizado';
  }
  if (situation === 'EXPECTED') {
    return type === REPORT_TYPE_EXPENSES ? 'A pagar' : 'A receber';
  }
  return 'Vencido';
}

export function reportTransactionsSituationBadgeVariant(
  situation: ReportCashDetailSituation,
): 'success' | 'info' | 'danger' {
  if (situation === 'REALIZED') {
    return 'success';
  }
  if (situation === 'EXPECTED') {
    return 'info';
  }
  return 'danger';
}

export function reportTransactionsPartyColumnLabel(type: ReportType): string {
  return type === REPORT_TYPE_EXPENSES ? 'Fornecedor' : 'Cliente';
}

export function reportTransactionsEmptyMessage(
  type: ReportType,
  situation: ReportCashDetailSituation,
): string {
  if (situation === 'REALIZED') {
    return type === REPORT_TYPE_EXPENSES
      ? 'Nenhuma saída realizada no período.'
      : 'Nenhuma entrada realizada no período.';
  }
  if (situation === 'EXPECTED') {
    return type === REPORT_TYPE_EXPENSES
      ? 'Nenhum valor a pagar no período.'
      : 'Nenhum valor a receber no período.';
  }
  return 'Nenhum título vencido no período.';
}

export function reportTransactionsUnavailableMessage(): string {
  return 'Detalhamento indisponível para este filtro porque o rateio por centro de custo não está completo.';
}

export function reportTransactionsLoadErrorMessage(type: ReportType): string {
  return type === REPORT_TYPE_EXPENSES
    ? 'Não foi possível carregar os lançamentos de despesas.'
    : 'Não foi possível carregar os lançamentos de receita.';
}

export function formatReportLaunchCount(count: number): string {
  return count === 1 ? '1 lançamento' : `${count} lançamentos`;
}

export function displayOptionalText(value: string | null | undefined): string {
  const trimmed = value?.trim();
  return trimmed ? trimmed : '—';
}

export function formatJoinedNames(names: readonly string[]): string {
  const cleaned = names.map((name) => name.trim()).filter((name) => name.length > 0);
  return cleaned.length === 0 ? '—' : cleaned.join(' · ');
}

export function reportCashDetailRowKey(item: ReportCashDetailItem): string {
  if (item.situation === 'REALIZED' && item.settlementExternalId) {
    return `settlement:${item.settlementExternalId}`;
  }
  return `installment:${item.installmentExternalId}`;
}

export function mergeReportCashDetailItems(
  previous: readonly ReportCashDetailItem[],
  next: readonly ReportCashDetailItem[],
): readonly ReportCashDetailItem[] {
  const seen = new Set(previous.map(reportCashDetailRowKey));
  const merged = [...previous];
  for (const item of next) {
    const key = reportCashDetailRowKey(item);
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    merged.push(item);
  }
  return merged;
}
