import type { Prisma } from '../../../generated/prisma/client.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { civilMonthKey, listInclusiveMonthKeysFromKeys } from '../../analytics/domain/civil-calendar.js';
import type { AnalyticsService } from '../../analytics/services/analytics.service.js';
import { monthlyBilling } from '../../analytics/domain/monthly-cash-flow.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';
import type { ContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { DashboardCategoryFilter } from '../../analytics/domain/dashboard-home-filters.js';
import type { DashboardSituation } from '../../analytics/domain/dashboard-home-filters.js';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/application-error.js';
import { resolveOperationalTenantId } from '../domain/operational-tenant.js';
import {
  calculateRevenueGoalProgress,
  listRevenueGoalHistoryMonthKeys,
  type RevenueGoalProgress,
} from '../domain/revenue-goal-math.js';
import type { RevenueGoalRepository } from '../repositories/revenue-goal.repository.js';
import type {
  DashboardCashFlowForecastResponse,
  DashboardCategoriesResponse,
  DashboardCostCentersResponse,
  DashboardExecutiveInsightsResponse,
  DashboardExpenseCompositionResponse,
  DashboardMonthEndCashPressureResponse,
  DashboardOverviewResponse,
  DashboardReceivableCompositionResponse,
  DashboardMonthlyCashFlowResponse,
  DashboardMonthlyExpenseResponse,
  DashboardMonthlyRevenueResponse,
  DashboardRevenueGoalResponse,
  DashboardUpcomingDays,
  DashboardUpcomingResponse,
} from '../domain/types.js';
import { toDashboardCashFlowForecastResponse } from '../http/to-dashboard-cash-flow-forecast-response.js';
import { toDashboardExecutiveInsightsResponse } from '../http/to-dashboard-executive-insights-response.js';
import { toDashboardMonthEndCashPressureResponse } from '../http/to-dashboard-month-end-cash-pressure-response.js';
import { toDashboardExpenseCompositionResponse } from '../http/to-dashboard-expense-composition-response.js';
import { toDashboardMonthlyCashFlowResponse } from '../http/to-dashboard-monthly-cash-flow-response.js';
import { toDashboardMonthlyExpenseResponse } from '../http/to-dashboard-monthly-expense-response.js';
import { toDashboardMonthlyRevenueResponse } from '../http/to-dashboard-monthly-revenue-response.js';
import { toDashboardOverviewResponse } from '../http/to-dashboard-overview-response.js';
import { toDashboardReceivableCompositionResponse } from '../http/to-dashboard-receivable-composition-response.js';
import { toDashboardRevenueGoalResponse } from '../http/to-dashboard-revenue-goal-response.js';
import { toDashboardUpcomingResponse } from '../http/to-dashboard-upcoming-response.js';
import { toExpensesReportResponse } from '../../reports/http/to-expenses-report-response.js';
import { toRevenueReportResponse } from '../../reports/http/to-revenue-report-response.js';
import type { ExpensesReportResponse, RevenueReportResponse } from '../../reports/domain/types.js';

/** Competências exibidas no histórico compacto da meta, incluindo a selecionada. */
export const REVENUE_GOAL_HISTORY_MONTHS = 6;

export type DashboardOverviewFacade = {
  listCostCenters(auth: AuthenticatedRequestContext): Promise<DashboardCostCentersResponse>;
  listCategories(auth: AuthenticatedRequestContext): Promise<DashboardCategoriesResponse>;
  getOverview(
    auth: AuthenticatedRequestContext,
    costCenterId?: string | null,
  ): Promise<DashboardOverviewResponse>;
  getUpcoming(
    auth: AuthenticatedRequestContext,
    nDays: DashboardUpcomingDays,
    costCenterId?: string | null,
  ): Promise<DashboardUpcomingResponse>;
  getCashFlowForecast(
    auth: AuthenticatedRequestContext,
    costCenterId?: string | null,
    categoryId?: string | null,
  ): Promise<DashboardCashFlowForecastResponse>;
  getExpenseComposition(
    auth: AuthenticatedRequestContext,
    costCenterId?: string | null,
  ): Promise<DashboardExpenseCompositionResponse>;
  getReceivableComposition(
    auth: AuthenticatedRequestContext,
    costCenterId?: string | null,
  ): Promise<DashboardReceivableCompositionResponse>;
  getMonthlyRevenue(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    costCenterId?: string | null,
    situation?: DashboardSituation | null,
    categoryId?: string | null,
  ): Promise<DashboardMonthlyRevenueResponse>;
  getRevenueReport(
    auth: AuthenticatedRequestContext,
    fromKey: string,
    toKey: string,
    costCenterId?: string | null,
    situation?: DashboardSituation | null,
    categoryId?: string | null,
  ): Promise<RevenueReportResponse>;
  getExpensesReport(
    auth: AuthenticatedRequestContext,
    fromKey: string,
    toKey: string,
    costCenterId?: string | null,
    situation?: DashboardSituation | null,
    categoryId?: string | null,
  ): Promise<ExpensesReportResponse>;
  getMonthlyExpenses(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    costCenterId?: string | null,
    situation?: DashboardSituation | null,
    categoryId?: string | null,
  ): Promise<DashboardMonthlyExpenseResponse>;
  getMonthlyCashFlow(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    costCenterId?: string | null,
    categoryId?: string | null,
  ): Promise<DashboardMonthlyCashFlowResponse>;
  getMonthlyExecutiveInsights(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    costCenterId?: string | null,
    situation?: DashboardSituation | null,
    categoryId?: string | null,
  ): Promise<DashboardExecutiveInsightsResponse>;
  getMonthEndCashPressure(
    auth: AuthenticatedRequestContext,
    costCenterId?: string | null,
    categoryId?: string | null,
  ): Promise<DashboardMonthEndCashPressureResponse>;
  getRevenueGoal(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    historyMonths?: number,
  ): Promise<DashboardRevenueGoalResponse>;
  upsertRevenueGoal(
    auth: AuthenticatedRequestContext,
    monthKey: string,
    targetAmount: Prisma.Decimal,
    historyMonths?: number,
  ): Promise<DashboardRevenueGoalResponse>;
};

export type DashboardOverviewFacadeDependencies = {
  readonly analytics: AnalyticsService;
  readonly integrations: ContaAzulIntegrationRepository;
  readonly revenueGoals: RevenueGoalRepository;
  readonly costCenters: CostCenterReadRepository;
  readonly categories: FinancialCategoryReadRepository;
  /** CASH-3B. Ausente nas rotas de Relatórios, que não expõem caixa. */
  readonly cashFlow?: MonthlyCashFlowService;
};

export function createDashboardOverviewFacade(
  deps: DashboardOverviewFacadeDependencies,
): DashboardOverviewFacade {
  return {
    async listCostCenters(auth) {
      const tenantId = requireOperationalTenantId(auth);
      const items = await deps.costCenters.listByTenant(tenantId);
      return { items };
    },

    async listCategories(auth) {
      const tenantId = requireOperationalTenantId(auth);
      const rows = await deps.categories.listByTenant(tenantId);
      return {
        items: rows.map((row) => ({
          id: row.id,
          name: row.name,
          type: row.type,
        })),
      };
    },

    async getOverview(auth, costCenterId = null) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const [snapshot, integration] = await Promise.all([
        deps.analytics.getFinancialStockSnapshot({
          tenantId,
          ...costCenterFilter(resolved),
        }),
        deps.integrations.findPublicByTenantId(tenantId),
      ]);
      return toDashboardOverviewResponse(snapshot, integration);
    },

    async getUpcoming(auth, nDays, costCenterId = null) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const filter = costCenterFilter(resolved);
      const [receivables, payables] = await Promise.all([
        deps.analytics.getUpcomingReceivables({ tenantId, nDays, ...filter }),
        deps.analytics.getUpcomingPayables({ tenantId, nDays, ...filter }),
      ]);
      return toDashboardUpcomingResponse(nDays, receivables, payables);
    },

    async getCashFlowForecast(auth, costCenterId = null, categoryId = null) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const forecast = await deps.analytics.getCashFlowForecast({
        tenantId,
        ...costCenterFilter(resolved),
        ...categoryFilterSpread(categoryFilter),
      });
      return toDashboardCashFlowForecastResponse(forecast);
    },

    async getExpenseComposition(auth, costCenterId = null) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const composition = await deps.analytics.getOpenPayablesCategoryComposition({
        tenantId,
        ...costCenterFilter(resolved),
      });
      return toDashboardExpenseCompositionResponse(composition);
    },

    async getReceivableComposition(auth, costCenterId = null) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const composition = await deps.analytics.getOpenReceivablesCategoryComposition({
        tenantId,
        ...costCenterFilter(resolved),
      });
      return toDashboardReceivableCompositionResponse(composition);
    },

    async getMonthlyRevenue(
      auth,
      monthKey,
      costCenterId = null,
      situation = null,
      categoryId = null,
    ) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const revenue = await deps.analytics.getMonthlyCompetenceRevenue({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
        ...costCenterFilter(resolved),
        ...homeFilterSpread(situation, categoryFilter),
      });
      return toDashboardMonthlyRevenueResponse(revenue);
    },

    async getRevenueReport(
      auth,
      fromKey,
      toKey,
      costCenterId = null,
      situation = null,
      categoryId = null,
    ) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const monthKeys = listInclusiveMonthKeysFromKeys(fromKey, toKey);
      const months = await Promise.all(
        monthKeys.map((monthKey) =>
          deps.analytics.getMonthlyCompetenceRevenue({
            tenantId,
            monthKey,
            ...costCenterFilter(resolved),
            ...homeFilterSpread(situation, categoryFilter),
          }),
        ),
      );
      return toRevenueReportResponse(fromKey, toKey, months);
    },

    async getExpensesReport(
      auth,
      fromKey,
      toKey,
      costCenterId = null,
      situation = null,
      categoryId = null,
    ) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const monthKeys = listInclusiveMonthKeysFromKeys(fromKey, toKey);
      const months = await Promise.all(
        monthKeys.map((monthKey) =>
          deps.analytics.getMonthlyCompetenceExpenses({
            tenantId,
            monthKey,
            ...costCenterFilter(resolved),
            ...homeFilterSpread(situation, categoryFilter),
          }),
        ),
      );
      return toExpensesReportResponse(fromKey, toKey, months);
    },

    async getMonthlyExpenses(
      auth,
      monthKey,
      costCenterId = null,
      situation = null,
      categoryId = null,
    ) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const expense = await deps.analytics.getMonthlyCompetenceExpenses({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
        ...costCenterFilter(resolved),
        ...homeFilterSpread(situation, categoryFilter),
      });
      return toDashboardMonthlyExpenseResponse(expense);
    },

    async getMonthlyCashFlow(auth, monthKey, costCenterId = null, categoryId = null) {
      const cashFlow = requireCashFlow(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const flow = await cashFlow.getMonthlyCashFlow({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
        ...costCenterFilter(resolved),
        ...categoryFilterSpread(categoryFilter),
      });
      return toDashboardMonthlyCashFlowResponse(flow);
    },

    async getMonthlyExecutiveInsights(
      auth,
      monthKey,
      costCenterId = null,
      situation = null,
      categoryId = null,
    ) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const insights = await deps.analytics.getMonthlyExecutiveInsights({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
        ...costCenterFilter(resolved),
        ...homeFilterSpread(situation, categoryFilter),
      });
      return toDashboardExecutiveInsightsResponse(insights);
    },

    async getMonthEndCashPressure(auth, costCenterId = null, categoryId = null) {
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const pressure = await deps.analytics.getMonthEndCashPressure({
        tenantId,
        ...costCenterFilter(resolved),
        ...categoryFilterSpread(categoryFilter),
      });
      return toDashboardMonthEndCashPressureResponse(pressure);
    },

    /**
     * Meta permanece consolidada da empresa — `costCenter`, `situation` e
     * `category` na query são ignorados (actual/target sempre company-level).
     */
    async getRevenueGoal(auth, monthKey, historyMonths = REVENUE_GOAL_HISTORY_MONTHS) {
      const tenantId = requireOperationalTenantId(auth);
      return loadRevenueGoal(deps, tenantId, monthKey, historyMonths);
    },

    async upsertRevenueGoal(
      auth,
      monthKey,
      targetAmount,
      historyMonths = REVENUE_GOAL_HISTORY_MONTHS,
    ) {
      const tenantId = requireOperationalTenantId(auth);
      await deps.revenueGoals.upsert(tenantId, monthKey, targetAmount);
      return loadRevenueGoal(deps, tenantId, monthKey, historyMonths);
    },
  };
}

/** Realizado da Meta = MonthlyCashFlow.billing (caixa), company-level — sem filtro CC. */
async function loadBillingActual(
  deps: DashboardOverviewFacadeDependencies,
  tenantId: string,
  monthKey: string | null,
): Promise<{ readonly monthKey: string; readonly actual: Prisma.Decimal }> {
  const flow = await requireCashFlow(deps).getMonthlyCashFlow({
    tenantId,
    ...(monthKey === null ? {} : { monthKey }),
  });
  const billing = monthlyBilling(flow);
  if (billing === null) {
    // Sem costCenterId o split company-level não deveria anular billing.
    // Não converter null → progresso 0%: falha explícita.
    throw new Error('Faturamento de caixa indisponível para a meta (billing null).');
  }
  return { monthKey: flow.monthKey, actual: billing };
}

async function loadRevenueGoal(
  deps: DashboardOverviewFacadeDependencies,
  tenantId: string,
  monthKey: string | null,
  historyMonths: number,
): Promise<DashboardRevenueGoalResponse> {
  const selectedActual = await loadBillingActual(deps, tenantId, monthKey);
  const referenceMonthKey = civilMonthKey(civilTodayInSaoPaulo(new Date()));
  const historyKeys = listRevenueGoalHistoryMonthKeys(selectedActual.monthKey, historyMonths);
  const goals = await deps.revenueGoals.listByTenantMonths(tenantId, historyKeys);
  const targetsByMonth = new Map(goals.map((goal) => [goal.monthKey, goal.targetAmount] as const));

  const actuals = await Promise.all(
    historyKeys.map(async (key) =>
      key === selectedActual.monthKey ? selectedActual : loadBillingActual(deps, tenantId, key),
    ),
  );

  const history: readonly RevenueGoalProgress[] = actuals.map((entry) =>
    calculateRevenueGoalProgress({
      monthKey: entry.monthKey,
      target: targetsByMonth.get(entry.monthKey) ?? null,
      actual: entry.actual,
      referenceMonthKey,
    }),
  );

  const selected = calculateRevenueGoalProgress({
    monthKey: selectedActual.monthKey,
    target: targetsByMonth.get(selectedActual.monthKey) ?? null,
    actual: selectedActual.actual,
    referenceMonthKey,
  });

  return toDashboardRevenueGoalResponse(selected, history);
}

async function resolveCategoryFilter(
  deps: DashboardOverviewFacadeDependencies,
  tenantId: string,
  categoryId: string | null | undefined,
): Promise<DashboardCategoryFilter | undefined> {
  if (categoryId === null || categoryId === undefined) {
    return undefined;
  }
  const found = await deps.categories.findByIdForTenant(tenantId, categoryId);
  if (found === null) {
    throw new NotFoundError('Categoria não encontrada.');
  }
  return { externalId: found.externalId, type: found.type };
}

function homeFilterSpread(
  situation: DashboardSituation | null | undefined,
  categoryFilter: DashboardCategoryFilter | undefined,
): {
  readonly situation?: DashboardSituation;
  readonly categoryFilter?: DashboardCategoryFilter;
} {
  return {
    ...(situation ? { situation } : {}),
    ...categoryFilterSpread(categoryFilter),
  };
}

function categoryFilterSpread(
  categoryFilter: DashboardCategoryFilter | undefined,
): { readonly categoryFilter: DashboardCategoryFilter } | Record<string, never> {
  return categoryFilter === undefined ? {} : { categoryFilter };
}

async function resolveCostCenterId(
  deps: DashboardOverviewFacadeDependencies,
  tenantId: string,
  costCenterId: string | null | undefined,
): Promise<string | undefined> {
  if (costCenterId === null || costCenterId === undefined) {
    return undefined;
  }
  const found = await deps.costCenters.findByIdForTenant(tenantId, costCenterId);
  if (found === null) {
    throw new NotFoundError('Centro de custo não encontrado.');
  }
  return found.id;
}

function costCenterFilter(
  costCenterId: string | undefined,
): { readonly costCenterId: string } | Record<string, never> {
  return costCenterId === undefined ? {} : { costCenterId };
}

function requireCashFlow(deps: DashboardOverviewFacadeDependencies): MonthlyCashFlowService {
  if (!deps.cashFlow) {
    throw new Error('MonthlyCashFlowService é obrigatório para GET /dashboard/monthly-cash-flow.');
  }
  return deps.cashFlow;
}

function requireOperationalTenantId(auth: AuthenticatedRequestContext): string {
  const tenantId = resolveOperationalTenantId(auth);
  if (tenantId === null) {
    throw new ForbiddenError('Sem contexto de empresa para a Dashboard.');
  }
  return tenantId;
}
