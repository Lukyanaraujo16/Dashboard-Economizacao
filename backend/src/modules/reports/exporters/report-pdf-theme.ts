/** Paleta estável para PDF (impressão clara). Não segue dark/light do navegador. */
export const REPORT_PDF_THEME = {
  pageWidth: 595.28,
  pageHeight: 841.89,
  margin: 48,
  footerReserve: 56,
  primary: '#141452',
  accent: '#C9A227',
  textPrimary: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#64748B',
  textOnPrimary: '#FFFFFF',
  surface: '#FFFFFF',
  kpiFill: '#F7F8FC',
  rowAlt: '#F4F6FB',
  chipFill: '#EEF1F7',
  border: '#D5DCE8',
  divider: '#E2E8F0',
  emptyFill: '#F8FAFC',
} as const;

export const REPORT_PDF_CONTENT_WIDTH =
  REPORT_PDF_THEME.pageWidth - REPORT_PDF_THEME.margin * 2;

export type ReportPdfTheme = typeof REPORT_PDF_THEME;
