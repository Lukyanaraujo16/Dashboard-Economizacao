import type { DashboardMonthlyRevenueCompositionItem } from '../../dashboard/domain/types.js';
import type { RevenueReportResponse } from '../domain/types.js';
import type { ReportExportCashDetailsBundle } from './report-export-cash-details.js';
import type { ReportPdfBranding } from './report-pdf-presentation.js';

const MONTHS_PT = [
  'jan',
  'fev',
  'mar',
  'abr',
  'mai',
  'jun',
  'jul',
  'ago',
  'set',
  'out',
  'nov',
  'dez',
] as const;

export const PRODUCT_NAME = 'Dashboard Economização';
export const REVENUE_REPORT_TITLE = 'Relatório financeiro — Regime de caixa';
export const REVENUE_REPORT_SUBTITLE = 'Entradas';
export const EMPTY_REVENUE_REPORT_NOTICE =
  'Não há entradas de caixa no intervalo selecionado.';

export type RevenueExportFilters = {
  readonly costCenter: string;
  readonly situation: string;
  readonly category: string;
};

export type RevenueExportContext = {
  readonly report: RevenueReportResponse;
  readonly companyName: string;
  readonly generatedAt: Date;
  readonly filters: RevenueExportFilters;
  /** Somente PDF. XLSX ignora. Ausente = wordmark, sem logo. */
  readonly pdfBranding?: ReportPdfBranding;
  /** Universo canônico da Fase 2. Ausente = seção/aba vazia disponível. */
  readonly cashDetails?: ReportExportCashDetailsBundle;
};

export function formatMonthKeyPtBr(key: string): string {
  const match = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!match) {
    return key;
  }
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return key;
  }
  return `${MONTHS_PT[monthIndex]}/${match[1]}`;
}

export function revenueReportPeriodLabel(fromKey: string, toKey: string): string {
  if (fromKey === toKey) {
    return formatMonthKeyPtBr(fromKey);
  }
  return `${formatMonthKeyPtBr(fromKey)} — ${formatMonthKeyPtBr(toKey)}`;
}

export function formatMoneyPtBr(value: string | null): string {
  if (value === null) {
    return '—';
  }
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(amount);
}

/** Mesma semântica da UI: null → "—"; não inventa 0%. */
export function formatCoveragePtBr(rate: string | null): string {
  if (rate === null) {
    return '—';
  }
  if (/^-?0+(\.0+)?$/.test(rate.trim())) {
    return '0%';
  }
  const amount = Number(rate);
  if (!Number.isFinite(amount)) {
    return '—';
  }
  return `${new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(amount)}%`;
}

export function formatGeneratedAtPtBr(at: Date): string {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
    timeZone: 'America/Sao_Paulo',
  }).format(at);
}

export function compositionKindLabel(
  kind: DashboardMonthlyRevenueCompositionItem['kind'],
): string {
  if (kind === 'category') {
    return 'Categoria';
  }
  if (kind === 'other') {
    return 'Outros';
  }
  if (kind === 'uncategorized') {
    return 'Sem categoria';
  }
  return 'Impreciso';
}

export function situationFilterLabel(situation: string): string {
  if (situation === 'settled') {
    return 'Quitado';
  }
  if (situation === 'open') {
    return 'Em aberto';
  }
  if (situation === 'overdue') {
    return 'Vencido';
  }
  return 'Todas';
}

export function isRevenueReportEmpty(report: RevenueReportResponse): boolean {
  const received = report.receivables.received;
  const outstanding = report.receivables.outstanding;
  const hasMovement =
    (received !== null && !/^-?0+(\.0+)?$/.test(received)) ||
    (outstanding !== null && !/^-?0+(\.0+)?$/.test(outstanding));
  return !hasMovement && report.receivables.items.length === 0;
}

export function parseDecimalNumber(value: string | null): number | null {
  if (value === null) {
    return null;
  }
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : null;
}
