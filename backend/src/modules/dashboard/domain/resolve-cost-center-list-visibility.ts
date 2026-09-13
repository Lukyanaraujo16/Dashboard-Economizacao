import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { civilMonthKey } from '../../analytics/domain/civil-calendar.js';
import type { CostCenterVisibilityMode } from '../../finance/domain/cost-center-visibility.js';
import type { DashboardCostCenterListPeriod } from '../http/parse-dashboard-cost-center-list-period.js';

/**
 * 11-A.1 — resolve modo de visibilidade do seletor.
 *
 * Dashboard (`month`):
 * - mês passado  → historical
 * - mês atual    → active_only
 * - mês futuro   → active_only
 *
 * Relatórios (`from`/`to`):
 * - sempre historical (mesmo se o range incluir o mês atual)
 */
export function resolveCostCenterListVisibility(
  period: Pick<DashboardCostCenterListPeriod, 'context' | 'monthKey'>,
  now: Date = new Date(),
): CostCenterVisibilityMode {
  if (period.context === 'reports_range') {
    return 'historical';
  }

  const currentMonthKey = civilMonthKey(civilTodayInSaoPaulo(now));
  const selectedMonthKey = period.monthKey ?? currentMonthKey;
  if (selectedMonthKey < currentMonthKey) {
    return 'historical';
  }
  return 'active_only';
}
