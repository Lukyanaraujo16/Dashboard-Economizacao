import type { DashboardCashRealizedCategoryComposition } from '../../services/dashboard/monthly-cash-flow.types';
import { formatDayPt, parseAmount, type DailyPoint } from './v2/chart-math';
import type { CategoryRankingItem } from './v2/category-ranking';

/** Converte composição realizada do MonthlyCashFlow em itens de ranking. */
export function cashCompositionToRankingItems(
  composition: DashboardCashRealizedCategoryComposition | null,
): readonly CategoryRankingItem[] {
  if (!composition) {
    return [];
  }
  return composition.items.map((item) => ({
    name: item.name,
    amount: item.amount,
    percentage: item.percentage,
  }));
}

/** Dia com maior valor absoluto na série (ignora zeros). */
export function peakNonZeroDailyPoint(
  points: readonly DailyPoint[] | undefined,
): DailyPoint | null {
  if (!points || points.length === 0) {
    return null;
  }
  let peak: DailyPoint | null = null;
  let peakAbs = 0;
  for (const point of points) {
    const abs = Math.abs(parseAmount(point.amount));
    if (abs > peakAbs) {
      peakAbs = abs;
      peak = point;
    }
  }
  return peakAbs > 0 ? peak : null;
}

/** Quantidade de dias com valor não zero na série. */
export function countNonZeroDailyPoints(points: readonly DailyPoint[] | undefined): number {
  if (!points) {
    return 0;
  }
  return points.filter((point) => Math.abs(parseAmount(point.amount)) > 0).length;
}

/** Rótulo curto do dia para resumos de modal (ex.: `19 ago`). */
export function formatPeakDayLabel(date: string): string {
  return formatDayPt(date);
}
