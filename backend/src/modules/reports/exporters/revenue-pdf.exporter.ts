import {
  EMPTY_COMPOSITION_PDF_NOTICE,
  EMPTY_REVENUE_PDF_NOTICE,
  formatReportPdfPeriod,
  toReportPdfFilterChips,
} from './report-pdf-presentation.js';
import { renderSharedReportPdf } from './report-pdf-layout.js';
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
    filters: toReportPdfFilterChips(context.filters),
    logo: context.pdfBranding?.logo ?? null,
    kpis: [
      { label: 'Receita', value: formatMoneyPtBr(report.receivables.total) },
      { label: 'Recebido', value: formatMoneyPtBr(report.receivables.received) },
      { label: 'A receber', value: formatMoneyPtBr(report.receivables.outstanding) },
      { label: 'Vencido', value: formatMoneyPtBr(report.receivables.overdue) },
      { label: 'Cobertura', value: formatCoveragePtBr(report.receivables.coverageRate) },
    ],
    emptyNotice: isRevenueReportEmpty(report) ? EMPTY_REVENUE_PDF_NOTICE : null,
    composition: {
      title: 'Composição por categoria',
      columns: [
        { header: 'Categoria', width: 138, align: 'left' },
        { header: 'Tipo', width: 72, align: 'left' },
        { header: 'Total', width: 72, align: 'right' },
        { header: 'Recebido', width: 72, align: 'right' },
        { header: 'A receber', width: 72, align: 'right' },
        { header: 'Participação', width: 73, align: 'right' },
      ],
      rows: report.receivables.items.map((item) => [
        item.name,
        compositionKindLabel(item.kind),
        formatMoneyPtBr(item.amount),
        formatMoneyPtBr(item.received),
        formatMoneyPtBr(item.outstanding),
        formatCoveragePtBr(item.percentage),
      ]),
      emptyMessage: EMPTY_COMPOSITION_PDF_NOTICE,
    },
    monthly: {
      title: 'Receita por mês de competência',
      columns: [
        { header: 'Mês', width: 90, align: 'left' },
        { header: 'Receita', width: 82, align: 'right' },
        { header: 'Recebido', width: 82, align: 'right' },
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
  });
}
