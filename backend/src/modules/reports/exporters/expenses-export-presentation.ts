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

export const EXPENSES_REPORT_TITLE = 'Relatório de Despesas';
export const EMPTY_EXPENSES_REPORT_NOTICE =
  'Não há despesa de competência no intervalo selecionado.';

export type ExpensesExportFilters = RevenueExportFilters;

export type ExpensesExportContext = {
  readonly report: ExpensesReportResponse;
  readonly companyName: string;
  readonly generatedAt: Date;
  readonly filters: ExpensesExportFilters;
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
  return report.payables.items.length === 0 || /^-?0+(\.0+)?$/.test(report.payables.total);
}
