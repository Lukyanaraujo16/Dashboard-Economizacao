import type { FinancialCategoryVisibilityMode } from '../../finance/domain/financial-category-visibility.js';
import type { DashboardCostCenterListPeriod } from '../http/parse-dashboard-cost-center-list-period.js';
import { resolveCostCenterListVisibility } from './resolve-cost-center-list-visibility.js';

/**
 * 11-C — regra temporal do seletor de categorias.
 *
 * Dashboard (`month`): passado → historical; atual/futuro → active_only.
 * Relatórios (`from`/`to`): permanece historical.
 *
 * O seletor de centros em Relatórios passou a `active_only`; categorias
 * não acompanham essa mudança e preservam o contrato 11-C.
 */
export function resolveFinancialCategoryListVisibility(
  period: Pick<DashboardCostCenterListPeriod, 'context' | 'monthKey'>,
  now: Date = new Date(),
): FinancialCategoryVisibilityMode {
  if (period.context === 'reports_range') {
    return 'historical';
  }
  return resolveCostCenterListVisibility(period, now);
}
