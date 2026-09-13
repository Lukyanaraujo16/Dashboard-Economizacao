import type { FinancialCategoryVisibilityMode } from '../../finance/domain/financial-category-visibility.js';
import type { DashboardCostCenterListPeriod } from '../http/parse-dashboard-cost-center-list-period.js';
import { resolveCostCenterListVisibility } from './resolve-cost-center-list-visibility.js';

/**
 * 11-C — mesma regra temporal homologada em 11-A.1 para centros de custo.
 *
 * Dashboard (`month`): passado → historical; atual/futuro → active_only.
 * Relatórios (`from`/`to`): sempre historical.
 */
export function resolveFinancialCategoryListVisibility(
  period: Pick<DashboardCostCenterListPeriod, 'context' | 'monthKey'>,
  now: Date = new Date(),
): FinancialCategoryVisibilityMode {
  return resolveCostCenterListVisibility(period, now);
}
