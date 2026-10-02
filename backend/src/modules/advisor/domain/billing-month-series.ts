import { Prisma } from '../../../generated/prisma/client.js';
import {
  MAX_REPORT_INCLUSIVE_MONTHS,
  listForwardInclusiveMonthKeys,
  shiftCivilMonthKey,
} from '../../analytics/domain/civil-calendar.js';

/** Mesmo teto inclusivo dos relatórios mensais. */
export const BILLING_SERIES_MAX_MONTHS = MAX_REPORT_INCLUSIVE_MONTHS;

export const BILLING_SERIES_FACT_KIND = 'BILLING_MONTH_SERIES';

export type BillingSeriesMonthFact = {
  readonly monthKey: string;
  readonly billing: string | null;
  readonly available: boolean;
};

/**
 * Meses civis inclusivos terminando em `endMonthKey`, do mais antigo ao mais recente.
 * `count` 3 e fim 2026-10 → 2026-08, 2026-09, 2026-10.
 */
export function listBillingSeriesMonthKeys(
  endMonthKey: string,
  count: number,
): readonly string[] {
  if (!Number.isInteger(count) || count < 1 || count > BILLING_SERIES_MAX_MONTHS) {
    throw new Error('janela de faturamento inválida.');
  }
  const start = shiftCivilMonthKey(endMonthKey, -(count - 1));
  return listForwardInclusiveMonthKeys(start, count);
}

/**
 * Média oficial em centavos (HALF UP). O chamador só invoca com a janela completa.
 */
export function officialBillingAverage(values: readonly Prisma.Decimal[]): Prisma.Decimal {
  const sum = values.reduce((total, value) => total.plus(value), new Prisma.Decimal(0));
  return sum.dividedBy(values.length).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
}
