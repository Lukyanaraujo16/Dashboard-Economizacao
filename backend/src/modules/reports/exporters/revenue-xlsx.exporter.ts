import { Workbook, type Row, type Worksheet } from 'exceljs';

import {
  EMPTY_REVENUE_REPORT_NOTICE,
  PRODUCT_NAME,
  REVENUE_REPORT_TITLE,
  compositionKindLabel,
  formatGeneratedAtPtBr,
  formatMonthKeyPtBr,
  isRevenueReportEmpty,
  parseDecimalNumber,
  revenueReportPeriodLabel,
  type RevenueExportContext,
} from './revenue-export-presentation.js';
import { sanitizeSpreadsheetText } from './sanitize-spreadsheet-text.js';

export async function renderRevenueReportXlsx(context: RevenueExportContext): Promise<Buffer> {
  const workbook = new Workbook();
  workbook.creator = PRODUCT_NAME;
  workbook.created = context.generatedAt;
  workbook.modified = context.generatedAt;

  addSummarySheet(workbook, context);
  addMonthlySheet(workbook, context);
  addCategoriesSheet(workbook, context);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addSummarySheet(workbook: Workbook, context: RevenueExportContext): void {
  const sheet = workbook.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 22 }, { width: 36 }];
  const { report, companyName, generatedAt, filters } = context;
  const rows: ReadonlyArray<readonly [string, string | number | null]> = [
    ['Relatório', REVENUE_REPORT_TITLE],
    ['Empresa', companyName],
    ['Período', revenueReportPeriodLabel(report.from, report.to)],
    ['Gerado em', formatGeneratedAtPtBr(generatedAt)],
    ['Centro de custo', filters.costCenter],
    ['Situação', filters.situation],
    ['Categoria', filters.category],
    ['Receita', parseDecimalNumber(report.receivables.total)],
    ['Recebido', parseDecimalNumber(report.receivables.received)],
    ['A receber', parseDecimalNumber(report.receivables.outstanding)],
    ['Vencido', parseDecimalNumber(report.receivables.overdue)],
    ['Cobertura (%)', parseDecimalNumber(report.receivables.coverageRate)],
  ];
  rows.forEach((row, index) => {
    writeLabelValue(sheet, index + 1, row[0], row[1], index >= 7 && index <= 10);
  });
  if (isRevenueReportEmpty(report)) {
    const notice = sheet.getCell('A14');
    notice.value = EMPTY_REVENUE_REPORT_NOTICE;
    notice.font = { italic: true };
  }
}

function addMonthlySheet(workbook: Workbook, context: RevenueExportContext): void {
  const sheet = workbook.addWorksheet('Mensal');
  sheet.columns = [
    { header: 'Mês', key: 'month', width: 14 },
    { header: 'Receita', key: 'total', width: 16 },
    { header: 'Recebido', key: 'received', width: 16 },
    { header: 'A receber', key: 'outstanding', width: 16 },
    { header: 'Vencido', key: 'overdue', width: 16 },
    { header: 'Cobertura (%)', key: 'coverage', width: 16 },
  ];
  styleHeader(sheet);
  for (const month of context.report.months) {
    const row = sheet.addRow({
      month: sanitizeSpreadsheetText(formatMonthKeyPtBr(month.monthKey)),
      total: parseDecimalNumber(month.receivables.total),
      received: parseDecimalNumber(month.receivables.received),
      outstanding: parseDecimalNumber(month.receivables.outstanding),
      overdue: parseDecimalNumber(month.receivables.overdue),
      coverage: parseDecimalNumber(month.receivables.coverageRate),
    });
    applyMoneyFormats(row, [2, 3, 4, 5]);
  }
}

function addCategoriesSheet(workbook: Workbook, context: RevenueExportContext): void {
  const sheet = workbook.addWorksheet('Categorias');
  sheet.columns = [
    { header: 'Categoria', key: 'name', width: 28 },
    { header: 'Tipo', key: 'kind', width: 16 },
    { header: 'Total', key: 'total', width: 16 },
    { header: 'Recebido', key: 'received', width: 16 },
    { header: 'A receber', key: 'outstanding', width: 16 },
    { header: 'Participação (%)', key: 'percentage', width: 18 },
  ];
  styleHeader(sheet);
  for (const item of context.report.receivables.items) {
    const row = sheet.addRow({
      name: sanitizeSpreadsheetText(item.name),
      kind: sanitizeSpreadsheetText(compositionKindLabel(item.kind)),
      total: parseDecimalNumber(item.amount),
      received: parseDecimalNumber(item.received),
      outstanding: parseDecimalNumber(item.outstanding),
      percentage: parseDecimalNumber(item.percentage),
    });
    applyMoneyFormats(row, [3, 4, 5]);
  }
}

function writeLabelValue(
  sheet: Worksheet,
  rowNumber: number,
  label: string,
  value: string | number | null,
  money: boolean,
): void {
  const labelCell = sheet.getCell(rowNumber, 1);
  labelCell.value = label;
  labelCell.font = { bold: true };
  const valueCell = sheet.getCell(rowNumber, 2);
  if (typeof value === 'number') {
    valueCell.value = value;
    if (money) {
      valueCell.numFmt = '#,##0.00';
    }
    return;
  }
  if (value === null) {
    valueCell.value = null;
    return;
  }
  valueCell.value = sanitizeSpreadsheetText(value);
}

function styleHeader(sheet: Worksheet): void {
  const header = sheet.getRow(1);
  header.font = { bold: true };
}

function applyMoneyFormats(row: Row, columns: readonly number[]): void {
  for (const column of columns) {
    const cell = row.getCell(column);
    if (typeof cell.value === 'number') {
      cell.numFmt = '#,##0.00';
    }
  }
}
