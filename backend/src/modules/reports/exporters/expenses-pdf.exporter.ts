import {
  EMPTY_COMPOSITION_PDF_NOTICE,
  EMPTY_EXPENSES_PDF_NOTICE,
  formatReportPdfPeriod,
  toReportPdfFilterChips,
} from './report-pdf-presentation.js';
import { renderSharedReportPdf } from './report-pdf-layout.js';
import {
  EXPENSES_REPORT_TITLE,
  compositionKindLabel,
  formatCoveragePtBr,
  formatGeneratedAtPtBr,
  formatMoneyPtBr,
  formatMonthKeyPtBr,
  isExpensesReportEmpty,
  type ExpensesExportContext,
} from './expenses-export-presentation.js';

export async function renderExpensesReportPdf(context: ExpensesExportContext): Promise<Buffer> {
  const { report } = context;
  return renderSharedReportPdf({
    title: EXPENSES_REPORT_TITLE,
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
      { label: 'Despesas', value: formatMoneyPtBr(report.payables.total) },
      { label: 'Saídas realizadas', value: formatMoneyPtBr(report.payables.paid) },
      { label: 'A pagar', value: formatMoneyPtBr(report.payables.outstanding) },
      { label: 'Vencido', value: formatMoneyPtBr(report.payables.overdue) },
      { label: 'Cobertura', value: formatCoveragePtBr(report.payables.coverageRate) },
    ],
    emptyNotice: isExpensesReportEmpty(report) ? EMPTY_EXPENSES_PDF_NOTICE : null,
    composition: {
      title: 'Composição das saídas realizadas',
      columns: [
        { header: 'Categoria', width: 160, align: 'left' },
        { header: 'Tipo', width: 80, align: 'left' },
        { header: 'Saídas', width: 100, align: 'right' },
        { header: 'Participação', width: 100, align: 'right' },
      ],
      rows: report.payables.items.map((item) => [
        item.name,
        compositionKindLabel(item.kind),
        formatMoneyPtBr(item.amount),
        formatCoveragePtBr(item.percentage),
      ]),
      emptyMessage: EMPTY_COMPOSITION_PDF_NOTICE,
    },
    monthly: {
      title: 'Saídas por mês civil (caixa)',
      columns: [
        { header: 'Mês', width: 90, align: 'left' },
        { header: 'Despesas', width: 82, align: 'right' },
        { header: 'Saídas', width: 82, align: 'right' },
        { header: 'A pagar', width: 82, align: 'right' },
        { header: 'Vencido', width: 81, align: 'right' },
        { header: 'Cobertura', width: 82, align: 'right' },
      ],
      rows: report.months.map((month) => [
        formatMonthKeyPtBr(month.monthKey),
        formatMoneyPtBr(month.payables.total),
        formatMoneyPtBr(month.payables.paid),
        formatMoneyPtBr(month.payables.outstanding),
        formatMoneyPtBr(month.payables.overdue),
        formatCoveragePtBr(month.payables.coverageRate),
      ]),
      emptyMessage: 'Não há meses neste recorte.',
    },
  });
}
