import type { DashboardExpenseCompositionItem } from '../../services/dashboard/expense-composition.types';
import { decimalAbsScaled } from './dashboard-forecast-view';

const FULL_SCALE = decimalAbsScaled('100');

/** Largura da barra 0–100 a partir do percentual já calculado no backend. */
export function compositionBarWidth(percentage: string): number {
  if (FULL_SCALE === 0n) {
    return 0;
  }
  const pct = (decimalAbsScaled(percentage) * 100n) / FULL_SCALE;
  const asNumber = Number(pct);
  if (!Number.isFinite(asNumber) || asNumber < 0) {
    return 0;
  }
  return asNumber > 100 ? 100 : asNumber;
}

export function isExpenseCompositionEmpty(
  items: readonly DashboardExpenseCompositionItem[],
  total: string,
): boolean {
  return items.length === 0 || decimalAbsScaled(total) === 0n;
}
