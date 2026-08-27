import type { ExpensesReportResponse } from '../domain/types.js';
import {
  compositionKindLabel,
  formatCoveragePtBr,
  formatGeneratedAtPtBr,
  formatMoneyPtBr,
  formatMonthKeyPtBr,
  parseDecimalNumber,
  PRODUCT_NAME,
  revenueReportPeriodLabel,
  situationFilterLabel,
  type RevenueExportFilters,
} from './revenue-export-presentation.js';
import type { ReportPdfBranding } from './report-pdf-presentation.js';

export const EXPENSES_REPORT_TITLE = 'Relatório financeiro — Regime de caixa';
export const EXPENSES_REPORT_SUBTITLE = 'Saídas';
export const EMPTY_EXPENSES_REPORT_NOTICE =
  'Não há saídas de caixa no intervalo selecionado.';

export type ExpensesExportFilters = RevenueExportFilters;

export type ExpensesExportContext = {
  readonly report: ExpensesReportResponse;
  readonly companyName: string;
  readonly generatedAt: Date;
  readonly filters: ExpensesExportFilters;
  /** Somente PDF. XLSX ignora. Ausente = wordmark, sem logo. */
  readonly pdfBranding?: ReportPdfBranding;
};

export {
  compositionKindLabel,
  formatCoveragePtBr,
  formatGeneratedAtPtBr,
  formatMoneyPtBr,
  formatMonthKeyPtBr,
  parseDecimalNumber,
  PRODUCT_NAME,
  revenueReportPeriodLabel,
  situationFilterLabel,
};

export function isExpensesReportEmpty(report: ExpensesReportResponse): boolean {
  const paid = report.payables.paid;
  const outstanding = report.payables.outstanding;
  const hasMovement =
    (paid !== null && !/^-?0+(\.0+)?$/.test(paid)) ||
    (outstanding !== null && !/^-?0+(\.0+)?$/.test(outstanding));
  return !hasMovement && report.payables.items.length === 0;
}
