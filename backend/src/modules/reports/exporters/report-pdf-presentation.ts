const MONTHS_SHORT_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
] as const;

const MONTHS_LONG_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
] as const;

export const EMPTY_REVENUE_PDF_NOTICE =
  'Não há entradas de caixa para o período e filtros selecionados.';

export const EMPTY_EXPENSES_PDF_NOTICE =
  'Não há saídas de caixa para o período e filtros selecionados.';

export const EMPTY_COMPOSITION_PDF_NOTICE = 'Não há composição por categoria neste recorte.';

export type ReportPdfBranding = {
  readonly logo: Buffer | null;
};

export type ReportPdfFilterChip = {
  readonly label: string;
  readonly value: string;
};

export function formatReportPdfPeriod(fromKey: string, toKey: string): string {
  if (fromKey === toKey) {
    return formatMonthLongPtBr(fromKey);
  }
  return `${formatMonthShortPtBr(fromKey)} a ${formatMonthShortPtBr(toKey)}`;
}

export function formatMonthShortPtBr(key: string): string {
  const parsed = parseMonthKey(key);
  if (!parsed) {
    return key;
  }
  return `${MONTHS_SHORT_PT[parsed.monthIndex]}/${parsed.year}`;
}

export function formatMonthLongPtBr(key: string): string {
  const parsed = parseMonthKey(key);
  if (!parsed) {
    return key;
  }
  return `${MONTHS_LONG_PT[parsed.monthIndex]} de ${parsed.year}`;
}

export function toReportPdfFilterChips(filters: {
  readonly costCenter: string;
  readonly situation: string;
  readonly category: string;
}): readonly ReportPdfFilterChip[] {
  return [
    { label: 'Centro de custo', value: filters.costCenter },
    { label: 'Situação', value: filters.situation },
    { label: 'Categoria', value: filters.category },
  ];
}

function parseMonthKey(key: string): { readonly year: string; readonly monthIndex: number } | null {
  const match = /^(\d{4})-(\d{2})$/.exec(key.trim());
  if (!match) {
    return null;
  }
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) {
    return null;
  }
  return { year: match[1] ?? '', monthIndex };
}
