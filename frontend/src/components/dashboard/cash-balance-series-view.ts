import type {
  DashboardCashBalanceDailyPoint,
  DashboardCashBalanceMonthlyPoint,
} from '../../services/dashboard/cash-balance-history.types';

/** Mapa date → balance (string decimal oficial). Sem inventar zero. */
export function balanceByDate(
  points: readonly DashboardCashBalanceDailyPoint[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const point of points) {
    map.set(point.date, point.balance);
  }
  return map;
}

/** Mapa monthKey → balance (string decimal oficial). Sem inventar zero. */
export function balanceByMonthKey(
  points: readonly DashboardCashBalanceMonthlyPoint[],
): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  for (const point of points) {
    map.set(point.monthKey, point.balance);
  }
  return map;
}

/** YYYY-MM-DD → dd/mm/aaaa para copy de cobertura parcial. */
export function formatCivilDatePtBr(date: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match) {
    return date;
  }
  return `${match[3]}/${match[2]}/${match[1]}`;
}
