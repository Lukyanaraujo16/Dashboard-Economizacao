import PDFDocument from 'pdfkit';

import { PRODUCT_NAME } from './revenue-export-presentation.js';
import {
  REPORT_PDF_CONTENT_WIDTH as CONTENT_WIDTH,
  REPORT_PDF_THEME as THEME,
} from './report-pdf-theme.js';
import type { ReportPdfFilterChip } from './report-pdf-presentation.js';

export type ReportPdfKpi = {
  readonly label: string;
  readonly value: string;
};

export type ReportPdfTableColumn = {
  readonly header: string;
  readonly width: number;
  readonly align: 'left' | 'right';
};

export type ReportPdfTableSpec = {
  readonly title: string;
  readonly columns: readonly ReportPdfTableColumn[];
  readonly rows: readonly (readonly string[])[];
  readonly emptyMessage: string;
};

export type ReportPdfDocumentSpec = {
  readonly title: string;
  readonly companyName: string;
  readonly periodLabel: string;
  readonly generatedAtLabel: string;
  readonly filters: readonly ReportPdfFilterChip[];
  readonly logo: Buffer | null;
  readonly kpis: readonly ReportPdfKpi[];
  readonly emptyNotice: string | null;
  readonly composition: ReportPdfTableSpec;
  readonly monthly: ReportPdfTableSpec;
};

const MARGIN = THEME.margin;
const LOGO_MAX_WIDTH = 180;
const LOGO_MAX_HEIGHT = 36;

export async function renderSharedReportPdf(spec: ReportPdfDocumentSpec): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      compress: false,
      bufferPages: true,
      margins: {
        top: MARGIN,
        left: MARGIN,
        right: MARGIN,
        bottom: THEME.footerReserve,
      },
      info: {
        Title: spec.title,
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

    drawDocument(doc, spec);
    const range = doc.bufferedPageRange();
    for (let index = 0; index < range.count; index += 1) {
      doc.switchToPage(range.start + index);
      drawFooter(doc, spec.generatedAtLabel, index + 1, range.count);
    }
    doc.end();
  });
}

function drawDocument(doc: PDFKit.PDFDocument, spec: ReportPdfDocumentSpec): void {
  drawHeader(doc, spec);
  drawKpiCards(doc, spec.kpis);
  if (spec.emptyNotice) {
    drawEmptyNotice(doc, spec.emptyNotice);
  }
  drawSectionTable(doc, spec.composition);
  drawSectionTable(doc, spec.monthly);
}

function drawHeader(doc: PDFKit.PDFDocument, spec: ReportPdfDocumentSpec): void {
  const top = doc.y;
  const brandHeight = drawBrandMark(doc, spec.logo, top);
  const barY = top + brandHeight + 10;
  doc.rect(MARGIN, barY, CONTENT_WIDTH, 2).fill(THEME.accent);
  doc.y = barY + 14;

  doc
    .fillColor(THEME.primary)
    .font('Helvetica-Bold')
    .fontSize(16)
    .text(spec.title.toLocaleUpperCase('pt-BR'), MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.55);

  const metaY = doc.y;
  const colGap = 12;
  const colW = (CONTENT_WIDTH - colGap * 2) / 3;
  const meta = [
    { label: 'Empresa', value: spec.companyName },
    { label: 'Período', value: spec.periodLabel },
    { label: 'Gerado em', value: spec.generatedAtLabel },
  ] as const;
  let metaValueBottom = metaY + 12;
  meta.forEach((item, index) => {
    const x = MARGIN + index * (colW + colGap);
    doc.font('Helvetica').fontSize(8).fillColor(THEME.textMuted).text(item.label, x, metaY, {
      width: colW,
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(10)
      .fillColor(THEME.textPrimary)
      .text(item.value, x, metaY + 12, { width: colW });
    metaValueBottom = Math.max(metaValueBottom, doc.y);
  });
  doc.y = metaValueBottom + 10;
  drawFilterChips(doc, spec.filters);
  doc.moveDown(0.35);
}

function drawBrandMark(doc: PDFKit.PDFDocument, logo: Buffer | null, y: number): number {
  if (logo) {
    try {
      doc.image(logo, MARGIN, y, { fit: [LOGO_MAX_WIDTH, LOGO_MAX_HEIGHT] });
      return LOGO_MAX_HEIGHT;
    } catch {
      // Asset corrompido ou formato não suportado (ex.: WebP): wordmark.
    }
  }
  doc
    .fillColor(THEME.primary)
    .font('Helvetica-Bold')
    .fontSize(10)
    .text(PRODUCT_NAME, MARGIN, y, { width: CONTENT_WIDTH });
  return 14;
}

function drawFilterChips(doc: PDFKit.PDFDocument, filters: readonly ReportPdfFilterChip[]): void {
  let x = MARGIN;
  let y = doc.y;
  const rowH = 16;
  doc.font('Helvetica').fontSize(8);
  for (const filter of filters) {
    const text = `${filter.label}: ${filter.value}`;
    const width = Math.min(Math.ceil(doc.widthOfString(text) + 12), CONTENT_WIDTH);
    if (x > MARGIN && x + width > MARGIN + CONTENT_WIDTH) {
      x = MARGIN;
      y += rowH + 4;
    }
    if (y + rowH > contentBottom(doc)) {
      doc.addPage();
      x = MARGIN;
      y = doc.y;
    }
    doc.roundedRect(x, y, width, rowH, 3).fill(THEME.chipFill);
    doc.fillColor(THEME.textSecondary).text(text, x + 6, y + 4, {
      width: width - 12,
      lineBreak: false,
    });
    x += width + 6;
  }
  doc.y = y + rowH + 8;
}

function drawKpiCards(doc: PDFKit.PDFDocument, kpis: readonly ReportPdfKpi[]): void {
  if (kpis.length === 0) {
    return;
  }
  const gap = 7;
  const cardW = (CONTENT_WIDTH - gap * (kpis.length - 1)) / kpis.length;
  const innerW = cardW - 16;
  doc.font('Helvetica-Bold').fontSize(9);
  let valueHeight = 11;
  for (const kpi of kpis) {
    valueHeight = Math.max(valueHeight, doc.heightOfString(kpi.value, { width: innerW }));
  }
  const cardH = 18 + valueHeight + 12;
  ensureSpace(doc, cardH + 8);
  const y = doc.y;
  kpis.forEach((kpi, index) => {
    const x = MARGIN + index * (cardW + gap);
    doc.rect(x, y, cardW, cardH).fill(THEME.kpiFill);
    doc.rect(x, y, 2.5, cardH).fill(THEME.primary);
    doc.font('Helvetica').fontSize(7).fillColor(THEME.textMuted).text(kpi.label, x + 8, y + 7, {
      width: innerW,
    });
    doc
      .font('Helvetica-Bold')
      .fontSize(9)
      .fillColor(THEME.primary)
      .text(kpi.value, x + 8, y + 18, { width: innerW });
  });
  doc.y = y + cardH + 14;
}

function drawEmptyNotice(doc: PDFKit.PDFDocument, notice: string): void {
  const height = Math.max(28, doc.font('Helvetica-Oblique').fontSize(9).heightOfString(notice, {
    width: CONTENT_WIDTH - 16,
  }) + 16);
  ensureSpace(doc, height + 8);
  const y = doc.y;
  doc.rect(MARGIN, y, CONTENT_WIDTH, height).fill(THEME.emptyFill);
  doc
    .font('Helvetica-Oblique')
    .fontSize(9)
    .fillColor(THEME.textSecondary)
    .text(notice, MARGIN + 8, y + 8, { width: CONTENT_WIDTH - 16 });
  doc.y = y + height + 12;
}

function drawSectionTable(doc: PDFKit.PDFDocument, table: ReportPdfTableSpec): void {
  const titleHeight = 18;
  const headerHeight = 18;
  ensureSpace(doc, titleHeight + headerHeight + 20);
  doc
    .fillColor(THEME.primary)
    .font('Helvetica-Bold')
    .fontSize(11)
    .text(table.title, MARGIN, doc.y, { width: CONTENT_WIDTH });
  doc.moveDown(0.35);
  drawTable(doc, table);
  doc.moveDown(0.65);
}

function drawTable(doc: PDFKit.PDFDocument, table: ReportPdfTableSpec): void {
  const headerHeight = 18;
  ensureSpace(doc, headerHeight + 18);
  drawTableHeader(doc, table.columns);

  if (table.rows.length === 0) {
    ensureSpace(doc, 22);
    doc
      .font('Helvetica-Oblique')
      .fontSize(9)
      .fillColor(THEME.textMuted)
      .text(table.emptyMessage, MARGIN, doc.y + 4, { width: CONTENT_WIDTH });
    doc.y += 22;
    return;
  }

  table.rows.forEach((row, rowIndex) => {
    doc.font('Helvetica').fontSize(8);
    const cellHeights = row.map((cell, index) => {
      const width = (table.columns[index]?.width ?? 70) - 8;
      return doc.heightOfString(cell, { width });
    });
    const rowH = Math.max(16, ...cellHeights) + 8;
    if (doc.y + rowH > contentBottom(doc)) {
      doc.addPage();
      drawTableHeader(doc, table.columns);
    }
    const y = doc.y;
    if (rowIndex % 2 === 0) {
      doc.rect(MARGIN, y, CONTENT_WIDTH, rowH).fill(THEME.rowAlt);
    }
    let x = MARGIN;
    row.forEach((cell, index) => {
      const column = table.columns[index];
      const width = column?.width ?? 70;
      doc.font('Helvetica').fontSize(8).fillColor(THEME.textPrimary).text(cell, x + 4, y + 4, {
        width: width - 8,
        align: column?.align ?? 'left',
      });
      x += width;
    });
    doc.y = y + rowH;
  });
}

function drawTableHeader(doc: PDFKit.PDFDocument, columns: readonly ReportPdfTableColumn[]): void {
  const y = doc.y;
  const headerHeight = 18;
  doc.rect(MARGIN, y, CONTENT_WIDTH, headerHeight).fill(THEME.primary);
  let x = MARGIN;
  columns.forEach((column) => {
    doc
      .font('Helvetica-Bold')
      .fontSize(8)
      .fillColor(THEME.textOnPrimary)
      .text(column.header, x + 4, y + 5, {
        width: column.width - 8,
        align: column.align,
        lineBreak: false,
      });
    x += column.width;
  });
  doc.y = y + headerHeight;
}

function drawFooter(
  doc: PDFKit.PDFDocument,
  generatedAtLabel: string,
  page: number,
  total: number,
): void {
  const bottom = doc.page.margins.bottom;
  const left = doc.page.margins.left;
  const right = doc.page.margins.right;
  doc.page.margins.bottom = 0;
  const y = doc.page.height - 44;
  doc
    .moveTo(MARGIN, y - 8)
    .lineTo(MARGIN + CONTENT_WIDTH, y - 8)
    .strokeColor(THEME.divider)
    .lineWidth(0.5)
    .stroke();
  doc.font('Helvetica-Bold').fontSize(8).fillColor(THEME.textSecondary).text(PRODUCT_NAME, MARGIN, y, {
    width: CONTENT_WIDTH / 2,
    lineBreak: false,
  });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(THEME.textMuted)
    .text(`Página ${page} de ${total}`, MARGIN, y, {
      width: CONTENT_WIDTH,
      align: 'right',
      lineBreak: false,
    });
  doc
    .font('Helvetica')
    .fontSize(8)
    .fillColor(THEME.textMuted)
    .text(`Relatório gerado em ${generatedAtLabel}`, MARGIN, y + 12, {
      width: CONTENT_WIDTH,
      lineBreak: false,
    });
  doc.page.margins.bottom = bottom;
  doc.page.margins.left = left;
  doc.page.margins.right = right;
}

function contentBottom(doc: PDFKit.PDFDocument): number {
  return doc.page.height - doc.page.margins.bottom;
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  if (doc.y + needed > contentBottom(doc)) {
    doc.addPage();
  }
}
