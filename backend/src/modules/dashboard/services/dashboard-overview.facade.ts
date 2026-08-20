import type { AnalyticsService } from '../../analytics/services/analytics.service.js';
import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';
import type { ContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import { ForbiddenError } from '../../../shared/errors/application-error.js';
import { resolveOperationalTenantId } from '../domain/operational-tenant.js';
import type {
  DashboardCashFlowForecastResponse,
  DashboardExecutiveInsightsResponse,
  DashboardExpenseCompositionResponse,
  DashboardMonthEndCashPressureResponse,
  DashboardOverviewResponse,
  DashboardReceivableCompositionResponse,
  DashboardMonthlyExpenseResponse,
  DashboardMonthlyRevenueResponse,
  DashboardUpcomingDays,
  DashboardUpcomingResponse,
} from '../domain/types.js';
import { toDashboardCashFlowForecastResponse } from '../http/to-dashboard-cash-flow-forecast-response.js';
import { toDashboardExecutiveInsightsResponse } from '../http/to-dashboard-executive-insights-response.js';
import { toDashboardMonthEndCashPressureResponse } from '../http/to-dashboard-month-end-cash-pressure-response.js';
import { toDashboardExpenseCompositionResponse } from '../http/to-dashboard-expense-composition-response.js';
import { toDashboardMonthlyExpenseResponse } from '../http/to-dashboard-monthly-expense-response.js';
import { toDashboardMonthlyRevenueResponse } from '../http/to-dashboard-monthly-revenue-response.js';
import { toDashboardOverviewResponse } from '../http/to-dashboard-overview-response.js';
import { toDashboardReceivableCompositionResponse } from '../http/to-dashboard-receivable-composition-response.js';
import { toDashboardUpcomingResponse } from '../http/to-dashboard-upcoming-response.js';

export type DashboardOverviewFacade = {
  getOverview(auth: AuthenticatedRequestContext): Promise<DashboardOverviewResponse>;
  getUpcoming(
    auth: AuthenticatedRequestContext,
    nDays: DashboardUpcomingDays,
  ): Promise<DashboardUpcomingResponse>;
  getCashFlowForecast(
    auth: AuthenticatedRequestContext,
  ): Promise<DashboardCashFlowForecastResponse>;
  getExpenseComposition(
    auth: AuthenticatedRequestContext,
  ): Promise<DashboardExpenseCompositionResponse>;
  getReceivableComposition(
    auth: AuthenticatedRequestContext,
  ): Promise<DashboardReceivableCompositionResponse>;
  getMonthlyRevenue(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
  ): Promise<DashboardMonthlyRevenueResponse>;
  getMonthlyExpenses(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
  ): Promise<DashboardMonthlyExpenseResponse>;
  getMonthlyExecutiveInsights(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
  ): Promise<DashboardExecutiveInsightsResponse>;
  getMonthEndCashPressure(
    auth: AuthenticatedRequestContext,
  ): Promise<DashboardMonthEndCashPressureResponse>;
};

export type DashboardOverviewFacadeDependencies = {
  readonly analytics: AnalyticsService;
  readonly integrations: ContaAzulIntegrationRepository;
};

export function createDashboardOverviewFacade(
  deps: DashboardOverviewFacadeDependencies,
): DashboardOverviewFacade {
  return {
    async getOverview(auth) {
      const tenantId = requireOperationalTenantId(auth);
      const [snapshot, integration] = await Promise.all([
        deps.analytics.getFinancialStockSnapshot({ tenantId }),
        deps.integrations.findPublicByTenantId(tenantId),
      ]);
      return toDashboardOverviewResponse(snapshot, integration);
    },

    async getUpcoming(auth, nDays) {
      const tenantId = requireOperationalTenantId(auth);
      const [receivables, payables] = await Promise.all([
        deps.analytics.getUpcomingReceivables({ tenantId, nDays }),
        deps.analytics.getUpcomingPayables({ tenantId, nDays }),
      ]);
      return toDashboardUpcomingResponse(nDays, receivables, payables);
    },

    async getCashFlowForecast(auth) {
      const tenantId = requireOperationalTenantId(auth);
      const forecast = await deps.analytics.getCashFlowForecast({ tenantId });
      return toDashboardCashFlowForecastResponse(forecast);
    },

    async getExpenseComposition(auth) {
      const tenantId = requireOperationalTenantId(auth);
      const composition = await deps.analytics.getOpenPayablesCategoryComposition({ tenantId });
      return toDashboardExpenseCompositionResponse(composition);
    },

    async getReceivableComposition(auth) {
      const tenantId = requireOperationalTenantId(auth);
      const composition = await deps.analytics.getOpenReceivablesCategoryComposition({ tenantId });
      return toDashboardReceivableCompositionResponse(composition);
    },

    async getMonthlyRevenue(auth, monthKey) {
      const tenantId = requireOperationalTenantId(auth);
      const revenue = await deps.analytics.getMonthlyCompetenceRevenue({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
      });
      return toDashboardMonthlyRevenueResponse(revenue);
    },

    async getMonthlyExpenses(auth, monthKey) {
      const tenantId = requireOperationalTenantId(auth);
      const expense = await deps.analytics.getMonthlyCompetenceExpenses({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
      });
      return toDashboardMonthlyExpenseResponse(expense);
    },

    async getMonthlyExecutiveInsights(auth, monthKey) {
      const tenantId = requireOperationalTenantId(auth);
      const insights = await deps.analytics.getMonthlyExecutiveInsights({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
      });
      return toDashboardExecutiveInsightsResponse(insights);
    },

    async getMonthEndCashPressure(auth) {
      const tenantId = requireOperationalTenantId(auth);
      const pressure = await deps.analytics.getMonthEndCashPressure({ tenantId });
      return toDashboardMonthEndCashPressureResponse(pressure);
    },
  };
}

function requireOperationalTenantId(auth: AuthenticatedRequestContext): string {
  const tenantId = resolveOperationalTenantId(auth);
  if (tenantId === null) {
    throw new ForbiddenError('Sem contexto de empresa para a Dashboard.');
  }
  return tenantId;
}
