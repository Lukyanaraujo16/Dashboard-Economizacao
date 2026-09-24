import {
  EMPTY_COMPOSITION_PDF_NOTICE,
  EMPTY_REVENUE_PDF_NOTICE,
  formatReportPdfPeriod,
  toReportPdfFilterChips,
} from './report-pdf-presentation.js';
import { renderSharedReportPdf, type ReportPdfDocumentSpec } from './report-pdf-layout.js';
import {
  buildExportPdfTransactions,
  resolveExportCashDetails,
} from './report-export-cash-details.js';
import {
  REVENUE_REPORT_TITLE,
  compositionKindLabel,
  formatCoveragePtBr,
  formatGeneratedAtPtBr,
  formatMoneyPtBr,
  formatMonthKeyPtBr,
  isRevenueReportEmpty,
  type RevenueExportContext,
} from './revenue-export-presentation.js';

export async function renderRevenueReportPdf(context: RevenueExportContext): Promise<Buffer> {
  const { report } = context;
  return renderSharedReportPdf({
    title: REVENUE_REPORT_TITLE,
    companyName: context.companyName,
    periodLabel: formatReportPdfPeriod(report.from, report.to),
    generatedAtLabel: formatGeneratedAtPtBr(context.generatedAt),
    filters: toReportPdfFilterChips({
      costCenter: context.filters.costCenter,
      situation: '—',
      category: context.filters.category,
    }).filter((chip) => chip.label !== 'Situação'),
    logo: context.pdfBranding?.logo ?? null,
    kpis: [
      { label: 'Faturamento', value: formatMoneyPtBr(report.receivables.total) },
      { label: 'Entradas realizadas', value: formatMoneyPtBr(report.receivables.received) },
      { label: 'A receber', value: formatMoneyPtBr(report.receivables.outstanding) },
      { label: 'Vencido', value: formatMoneyPtBr(report.receivables.overdue) },
      { label: 'Cobertura', value: formatCoveragePtBr(report.receivables.coverageRate) },
    ],
    emptyNotice: isRevenueReportEmpty(report) ? EMPTY_REVENUE_PDF_NOTICE : null,
    composition: {
      title: 'Composição das entradas realizadas',
      columns: [
        { header: 'Categoria', width: 160, align: 'left' },
        { header: 'Tipo', width: 80, align: 'left' },
        { header: 'Entradas', width: 100, align: 'right' },
        { header: 'Participação', width: 100, align: 'right' },
      ],
      rows: report.receivables.items.map((item) => [
        item.name,
        compositionKindLabel(item.kind),
        formatMoneyPtBr(item.amount),
        formatCoveragePtBr(item.percentage),
      ]),
      emptyMessage: EMPTY_COMPOSITION_PDF_NOTICE,
    },
    monthly: {
      title: 'Entradas por mês civil (caixa)',
      columns: [
        { header: 'Mês', width: 90, align: 'left' },
        { header: 'Faturamento', width: 82, align: 'right' },
        { header: 'Entradas', width: 82, align: 'right' },
        { header: 'A receber', width: 82, align: 'right' },
        { header: 'Vencido', width: 81, align: 'right' },
        { header: 'Cobertura', width: 82, align: 'right' },
      ],
      rows: report.months.map((month) => [
        formatMonthKeyPtBr(month.monthKey),
        formatMoneyPtBr(month.receivables.total),
        formatMoneyPtBr(month.receivables.received),
        formatMoneyPtBr(month.receivables.outstanding),
        formatMoneyPtBr(month.receivables.overdue),
        formatCoveragePtBr(month.receivables.coverageRate),
      ]),
      emptyMessage: 'Não há meses neste recorte.',
    },
    transactions: toPdfTransactions(
      buildExportPdfTransactions(
        'revenue',
        resolveExportCashDetails('revenue', context.cashDetails),
        formatMoneyPtBr,
      ),
    ),
  });
}

function toPdfTransactions(
  spec: ReturnType<typeof buildExportPdfTransactions>,
): NonNullable<ReportPdfDocumentSpec['transactions']> {
  return {
    title: spec.title,
    blocks: spec.blocks.map((block) => ({
      title: block.title,
      summary: block.summary,
      unavailableMessage: block.unavailableMessage,
      table: {
        title: block.title,
        columns: block.columns,
        rows: block.rows,
        emptyMessage: block.emptyMessage,
      },
    })),
  };
}
