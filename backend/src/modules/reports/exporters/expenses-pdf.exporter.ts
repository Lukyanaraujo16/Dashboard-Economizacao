import PDFDocument from 'pdfkit';

import {
  EMPTY_EXPENSES_REPORT_NOTICE,
  EXPENSES_REPORT_TITLE,
  PRODUCT_NAME,
  compositionKindLabel,
  formatCoveragePtBr,
  formatGeneratedAtPtBr,
  formatMoneyPtBr,
  formatMonthKeyPtBr,
  isExpensesReportEmpty,
  revenueReportPeriodLabel,
  type ExpensesExportContext,
} from './expenses-export-presentation.js';

const MARGIN = 48;
const PAGE_WIDTH = 595.28;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

export async function renderExpensesReportPdf(context: ExpensesExportContext): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: MARGIN,
      compress: false,
      bufferPages: true,
      info: {
        Title: EXPENSES_REPORT_TITLE,
        Author: PRODUCT_NAME,
        Creator: PRODUCT_NAME,
      },
    });
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    doc.on('error', reject);
    doc.on('end', () => {
      resolve(Buffer.concat(chunks));
    });

    drawDocument(doc, context);
    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);
      drawFooter(doc, index + 1, range.count);
    }
    doc.end();
  });
}

function drawDocument(doc: PDFKit.PDFDocument, context: ExpensesExportContext): void {
  const { report, companyName, generatedAt, filters } = context;

  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(11).text(PRODUCT_NAME, MARGIN, MARGIN, {
    width: CONTENT_WIDTH,
  });
  doc.moveDown(0.35);
  doc.fontSize(18).text(EXPENSES_REPORT_TITLE, { width: CONTENT_WIDTH });
  doc.moveDown(0.6);
  doc.font('Helvetica').fontSize(10).fillColor('#374151');
  kv(doc, 'Empresa', companyName);
  kv(doc, 'Período', revenueReportPeriodLabel(report.from, report.to));
  kv(doc, 'Gerado em', formatGeneratedAtPtBr(generatedAt));
  kv(doc, 'Centro de custo', filters.costCenter);
  kv(doc, 'Situação', filters.situation);
  kv(doc, 'Categoria', filters.category);

  doc.moveDown(0.8);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Resumo', { width: CONTENT_WIDTH });
  doc.moveDown(0.35);
  doc.font('Helvetica').fontSize(10).fillColor('#111827');
  kv(doc, 'Despesas', formatMoneyPtBr(report.payables.total));
  kv(doc, 'Pago', formatMoneyPtBr(report.payables.paid));
  kv(doc, 'A pagar', formatMoneyPtBr(report.payables.outstanding));
  kv(doc, 'Vencido', formatMoneyPtBr(report.payables.overdue));
  kv(doc, 'Cobertura', formatCoveragePtBr(report.payables.coverageRate));

  if (isExpensesReportEmpty(report)) {
    doc.moveDown(0.8);
    doc.font('Helvetica-Oblique').fillColor('#6B7280').text(EMPTY_EXPENSES_REPORT_NOTICE, {
      width: CONTENT_WIDTH,
    });
  }

  doc.moveDown(0.9);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Composição por categoria', {
    width: CONTENT_WIDTH,
  });
  doc.moveDown(0.35);
  drawTable(doc, ['Categoria', 'Tipo', 'Total', 'Pago', 'A pagar', 'Participação'], [128, 72, 70, 70, 70, 89], [
    ...report.payables.items.map((item) => [
      item.name,
      compositionKindLabel(item.kind),
      formatMoneyPtBr(item.amount),
      formatMoneyPtBr(item.paid),
      formatMoneyPtBr(item.outstanding),
      formatCoveragePtBr(item.percentage),
    ]),
  ]);

  doc.moveDown(0.9);
  doc.fillColor('#111827').font('Helvetica-Bold').fontSize(12).text('Despesas por mês de competência', {
    width: CONTENT_WIDTH,
  });
  doc.moveDown(0.35);
  drawTable(
    doc,
    ['Mês', 'Despesas', 'Pago', 'A pagar', 'Vencido', 'Cobertura'],
    [90, 80, 80, 80, 80, 89],
    report.months.map((month) => [
      formatMonthKeyPtBr(month.monthKey),
      formatMoneyPtBr(month.payables.total),
      formatMoneyPtBr(month.payables.paid),
      formatMoneyPtBr(month.payables.outstanding),
      formatMoneyPtBr(month.payables.overdue),
      formatCoveragePtBr(month.payables.coverageRate),
    ]),
  );
}

function kv(doc: PDFKit.PDFDocument, label: string, value: string): void {
  const y = doc.y;
  doc.font('Helvetica-Bold').fillColor('#6B7280').text(`${label}:`, MARGIN, y, { width: 110, continued: false });
  doc.font('Helvetica').fillColor('#111827').text(value, MARGIN + 114, y, { width: CONTENT_WIDTH - 114 });
}

function drawTable(
  doc: PDFKit.PDFDocument,
  headers: readonly string[],
  widths: readonly number[],
  rows: readonly (readonly string[])[],
): void {
  const startX = MARGIN;
  const rowHeight = 18;
  const ensureSpace = (needed: number) => {
    if (doc.y + needed > doc.page.height - MARGIN - 24) {
      doc.addPage();
    }
  };

  ensureSpace(rowHeight + 4);
  const headerY = doc.y;
  let x = startX;
  doc.font('Helvetica-Bold').fontSize(8).fillColor('#6B7280');
  headers.forEach((header, index) => {
    doc.text(header, x, headerY, { width: widths[index], lineBreak: false });
    x += widths[index] ?? 0;
  });
  doc.y = headerY + 12;
  doc.moveTo(startX, doc.y).lineTo(startX + CONTENT_WIDTH, doc.y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
  doc.moveDown(0.35);

  if (rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor('#6B7280').text('Sem linhas neste recorte.', {
      width: CONTENT_WIDTH,
    });
    return;
  }

  doc.font('Helvetica').fontSize(8).fillColor('#111827');
  for (const row of rows) {
    ensureSpace(rowHeight);
    const y = doc.y;
    let cellX = startX;
    let maxHeight = 0;
    row.forEach((cell, index) => {
      const width = widths[index] ?? 70;
      const height = doc.heightOfString(cell, { width });
      maxHeight = Math.max(maxHeight, height);
      doc.text(cell, cellX, y, { width, continued: false });
      cellX += width;
    });
    doc.y = y + Math.max(maxHeight, 12) + 4;
  }
}

function drawFooter(doc: PDFKit.PDFDocument, page: number, total: number): void {
  const bottom = doc.page.margins.bottom;
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  doc.page.margins.bottom = 0;
  const y = doc.page.height - 32;
  doc.font('Helvetica').fontSize(8).fillColor('#9CA3AF');
  doc.text(`${PRODUCT_NAME} — documento confidencial`, MARGIN, y, {
    width: CONTENT_WIDTH / 2,
    lineBreak: false,
  });
  doc.text(`Página ${page} de ${total}`, MARGIN, y, {
    width: CONTENT_WIDTH,
    align: 'right',
    lineBreak: false,
  });
  doc.page.margins.bottom = bottom;
  doc.page.margins.left = left;
  doc.page.margins.right = right;
}
