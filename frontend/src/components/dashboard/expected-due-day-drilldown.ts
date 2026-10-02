import type { DashboardInstallmentStockSituation } from '../../services/dashboard/receivable-stock-details.types';
import { sumDecimalStrings, type DailyPoint } from './v2/chart-math';

/**
 * Título que pode compor a barra “no prazo por dia de vencimento”.
 * `dueDate` é a chave civil YYYY-MM-DD (contrato @db.Date), não um instante UTC.
 */
export type ExpectedDueDayTitle = {
  readonly dueDate: string;
  readonly amount: string;
  readonly situation: DashboardInstallmentStockSituation;
};

const CIVIL_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCivilDueDateKey(value: string): boolean {
  return CIVIL_DATE.test(value.trim());
}

/**
 * Títulos em aberto no prazo cujo vencimento civil é o dia selecionado.
 * Vencidos ficam de fora: a barra do gráfico não os inclui.
 */
export function titlesComposingExpectedDueDay<T extends ExpectedDueDayTitle>(
  items: readonly T[],
  civilDate: string,
): readonly T[] {
  const date = civilDate.trim();
  if (!isCivilDueDateKey(date)) {
    return [];
  }
  return items.filter((item) => item.dueDate.trim() === date && item.situation !== 'OVERDUE');
}

/** Soma dos títulos exibidos no dia, em centavos. Vazio = 0,00. */
export function sumExpectedDueDayAmounts(items: readonly { readonly amount: string }[]): string {
  return sumDecimalStrings(items.map((item) => item.amount));
}

/**
 * Valor da barra naquele dia.
 * Ausência (dia fora da série) permanece null — não vira zero.
 */
export function expectedDueDayChartAmount(
  points: readonly DailyPoint[] | undefined,
  civilDate: string,
): string | null {
  const date = civilDate.trim();
  const point = points?.find((item) => item.date === date);
  return point === undefined ? null : point.amount;
}

/** Compara totais monetários em centavos, sem float. */
export function expectedDueDayAmountsReconcile(titlesAmount: string, chartAmount: string): boolean {
  return sumDecimalStrings([titlesAmount]) === sumDecimalStrings([chartAmount]);
}
