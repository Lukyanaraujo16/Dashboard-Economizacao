import ExcelJS from 'exceljs';
import type { Row, Worksheet } from 'exceljs';

type Workbook = ExcelJS.Workbook;

import {
  EMPTY_EXPENSES_REPORT_NOTICE,
  EXPENSES_REPORT_TITLE,
  PRODUCT_NAME,
  compositionKindLabel,
  formatGeneratedAtPtBr,
  formatMonthKeyPtBr,
  isExpensesReportEmpty,
  parseDecimalNumber,
  revenueReportPeriodLabel,
  type ExpensesExportContext,
} from './expenses-export-presentation.js';
import {
  buildExportLancamentosRows,
  exportPartyColumnLabel,
  resolveExportCashDetails,
} from './report-export-cash-details.js';
import { sanitizeSpreadsheetText } from './sanitize-spreadsheet-text.js';

export async function renderExpensesReportXlsx(context: ExpensesExportContext): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = PRODUCT_NAME;
  workbook.created = context.generatedAt;
  workbook.modified = context.generatedAt;

  addSummarySheet(workbook, context);
  addMonthlySheet(workbook, context);
  addCategoriesSheet(workbook, context);
  addLancamentosSheet(workbook, context);

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function addSummarySheet(workbook: Workbook, context: ExpensesExportContext): void {
  const sheet = workbook.addWorksheet('Resumo', { views: [{ showGridLines: false }] });
  sheet.columns = [{ width: 22 }, { width: 36 }];
  const { report, companyName, generatedAt, filters } = context;
  const rows: ReadonlyArray<readonly [string, string | number | null]> = [
    ['Relatório', EXPENSES_REPORT_TITLE],
    ['Empresa', companyName],
    ['Período', revenueReportPeriodLabel(report.from, report.to)],
    ['Gerado em', formatGeneratedAtPtBr(generatedAt)],
    ['Centro de custo', filters.costCenter],
    ['Categoria', filters.category],
    ['Despesas', parseDecimalNumber(report.payables.total)],
    ['Saídas realizadas', parseDecimalNumber(report.payables.paid)],
    ['A pagar', parseDecimalNumber(report.payables.outstanding)],
    ['Vencido', parseDecimalNumber(report.payables.overdue)],
    ['Cobertura (%)', parseDecimalNumber(report.payables.coverageRate)],
  ];
  rows.forEach((row, index) => {
    writeLabelValue(sheet, index + 1, row[0], row[1], index >= 6 && index <= 9);
  });
  if (isExpensesReportEmpty(report)) {
    const notice = sheet.getCell('A14');
    notice.value = EMPTY_EXPENSES_REPORT_NOTICE;
    notice.font = { italic: true };
  }
}

function addMonthlySheet(workbook: Workbook, context: ExpensesExportContext): void {
  const sheet = workbook.addWorksheet('Mensal');
  sheet.columns = [
    { header: 'Mês', key: 'month', width: 14 },
    { header: 'Despesas', key: 'total', width: 16 },
    { header: 'Saídas realizadas', key: 'paid', width: 20 },
    { header: 'A pagar', key: 'outstanding', width: 16 },
    { header: 'Vencido', key: 'overdue', width: 16 },
    { header: 'Cobertura (%)', key: 'coverage', width: 16 },
  ];
  styleHeader(sheet);
  for (const month of context.report.months) {
    const row = sheet.addRow({
      month: sanitizeSpreadsheetText(formatMonthKeyPtBr(month.monthKey)),
      total: parseDecimalNumber(month.payables.total),
      paid: parseDecimalNumber(month.payables.paid),
      outstanding: parseDecimalNumber(month.payables.outstanding),
      overdue: parseDecimalNumber(month.payables.overdue),
      coverage: parseDecimalNumber(month.payables.coverageRate),
    });
    applyMoneyFormats(row, [2, 3, 4, 5]);
  }
}

function addCategoriesSheet(workbook: Workbook, context: ExpensesExportContext): void {
  const sheet = workbook.addWorksheet('Categorias');
  sheet.columns = [
    { header: 'Categoria', key: 'name', width: 28 },
    { header: 'Tipo', key: 'kind', width: 16 },
    { header: 'Saídas realizadas', key: 'total', width: 20 },
    { header: 'Participação (%)', key: 'percentage', width: 18 },
  ];
  styleHeader(sheet);
  for (const item of context.report.payables.items) {
    const row = sheet.addRow({
      name: sanitizeSpreadsheetText(item.name),
      kind: sanitizeSpreadsheetText(compositionKindLabel(item.kind)),
      total: parseDecimalNumber(item.amount),
      percentage: parseDecimalNumber(item.percentage),
    });
    applyMoneyFormats(row, [3]);
  }
}

function addLancamentosSheet(workbook: Workbook, context: ExpensesExportContext): void {
  const sheet = workbook.addWorksheet('Lançamentos');
  const partyHeader = exportPartyColumnLabel('expenses');
  sheet.columns = [
    { header: 'Data', key: 'date', width: 14 },
    { header: 'Descrição', key: 'description', width: 36 },
    { header: partyHeader, key: 'party', width: 28 },
    { header: 'Categoria', key: 'category', width: 28 },
    { header: 'Centro de custo', key: 'costCenter', width: 28 },
    { header: 'Situação', key: 'situation', width: 16 },
    { header: 'Valor', key: 'amount', width: 16 },
  ];
  styleHeader(sheet);
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = {
    from: { row: 1, column: 1 },
    to: { row: 1, column: 7 },
  };
  const rows = buildExportLancamentosRows(
    'expenses',
    resolveExportCashDetails('expenses', context.cashDetails),
  );
  for (const item of rows) {
    const row = sheet.addRow({
      date: sanitizeSpreadsheetText(item.date),
      description: sanitizeSpreadsheetText(item.description),
      party: sanitizeSpreadsheetText(item.party),
      category: sanitizeSpreadsheetText(item.category),
      costCenter: sanitizeSpreadsheetText(item.costCenter),
      situation: sanitizeSpreadsheetText(item.situation),
      amount: item.amount,
    });
    applyMoneyFormats(row, [7]);
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
