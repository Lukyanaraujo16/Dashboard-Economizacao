import type { ReportExportFormat } from '../http/parse-report-export-format.js';

const MONTH_KEY = /^\d{4}-(0[1-9]|1[0-2])$/;

/**
 * Nome previsível e ASCII-only. from/to já validados como YYYY-MM.
 * Não interpola nome de empresa nem input HTTP cru.
 */
export function buildRevenueExportFilename(
  fromKey: string,
  toKey: string,
  format: ReportExportFormat,
): string {
  if (!MONTH_KEY.test(fromKey) || !MONTH_KEY.test(toKey)) {
    throw new Error('filename de exportação exige from/to no formato YYYY-MM.');
  }
  const extension = format === 'pdf' ? 'pdf' : 'xlsx';
  return `relatorio-receita-${fromKey}-a-${toKey}.${extension}`;
}

export function revenueExportContentDisposition(filename: string): string {
  if (!/^relatorio-receita-\d{4}-\d{2}-a-\d{4}-\d{2}\.(pdf|xlsx)$/.test(filename)) {
    throw new Error('Content-Disposition recusou filename inseguro.');
  }
  return `attachment; filename="${filename}"`;
}

export function buildExpensesExportFilename(
  fromKey: string,
  toKey: string,
  format: ReportExportFormat,
): string {
  if (!MONTH_KEY.test(fromKey) || !MONTH_KEY.test(toKey)) {
    throw new Error('filename de exportação exige from/to no formato YYYY-MM.');
  }
  const extension = format === 'pdf' ? 'pdf' : 'xlsx';
  return `relatorio-despesas-${fromKey}-a-${toKey}.${extension}`;
}

export function expensesExportContentDisposition(filename: string): string {
  if (!/^relatorio-despesas-\d{4}-\d{2}-a-\d{4}-\d{2}\.(pdf|xlsx)$/.test(filename)) {
    throw new Error('Content-Disposition recusou filename inseguro.');
  }
  return `attachment; filename="${filename}"`;
}
