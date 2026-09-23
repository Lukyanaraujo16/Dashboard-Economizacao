import type { Prisma } from '../../../generated/prisma/client.js';
import { civilTodayInSaoPaulo } from '../../analytics/domain/analytical-timezone.js';
import { civilMonthKey, listInclusiveMonthKeysFromKeys } from '../../analytics/domain/civil-calendar.js';
import type { AnalyticsService } from '../../analytics/services/analytics.service.js';
import { monthlyBilling } from '../../analytics/domain/monthly-cash-flow.js';
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import type { ExpectedReceivableDetailsService } from '../../analytics/services/expected-receivable-details.service.js';
import type { ExpectedPayableDetailsService } from '../../analytics/services/expected-payable-details.service.js';
import type {
  CashRealizedDetailsService,
  GetCashRealizedDetailsInput,
} from '../../analytics/services/cash-realized-details.service.js';
import type {
  CashRealizedCategoryKind,
  CashRealizedDetailsDirection,
} from '../../analytics/domain/cash-realized-details.js';
import type {
  CashExpectedHorizonService,
  GetCashExpectedHorizonInput,
} from '../../analytics/services/cash-expected-horizon.service.js';
import type { CashExpectedHorizonMonths } from '../../analytics/domain/cash-expected-horizon.js';
import type { AuthenticatedRequestContext } from '../../auth/domain/authentication-context.js';
import type { ContaAzulIntegrationRepository } from '../../integrations/conta-azul/repositories/integration.repository.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { DashboardCategoryFilter } from '../../analytics/domain/dashboard-home-filters.js';
import type { DashboardSituation } from '../../analytics/domain/dashboard-home-filters.js';
import { ForbiddenError, NotFoundError } from '../../../shared/errors/application-error.js';
import { resolveOperationalTenantId } from '../domain/operational-tenant.js';
import { resolveCostCenterListVisibility } from '../domain/resolve-cost-center-list-visibility.js';
import { resolveFinancialCategoryListVisibility } from '../domain/resolve-financial-category-list-visibility.js';
import {
  calculateRevenueGoalProgress,
  listRevenueGoalHistoryMonthKeys,
  type RevenueGoalProgress,
} from '../domain/revenue-goal-math.js';
import type { RevenueGoalRepository } from '../repositories/revenue-goal.repository.js';
import type {
  DashboardCashFlowForecastResponse,
  DashboardCashBalanceHistoryResponse,
  DashboardCashMovementHistoryResponse,
  DashboardCashExpectedHorizonResponse,
  DashboardCategoriesResponse,
  DashboardCostCentersResponse,
  DashboardExecutiveInsightsResponse,
  DashboardExpenseCompositionResponse,
  DashboardMonthEndCashPressureResponse,
  DashboardOverviewResponse,
  DashboardReceivableCompositionResponse,
  DashboardMonthlyCashFlowResponse,
  DashboardExpectedReceivableDetailsResponse,
  DashboardExpectedPayableDetailsResponse,
  DashboardReceivableStockDetailsResponse,
  DashboardPayableStockDetailsResponse,
  DashboardCashRealizedDetailsResponse,
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
import { toDashboardExpectedReceivableDetailsResponse } from '../http/to-dashboard-expected-receivable-details-response.js';
import { toDashboardExpectedPayableDetailsResponse } from '../http/to-dashboard-expected-payable-details-response.js';
import { toDashboardReceivableStockDetailsResponse } from '../http/to-dashboard-receivable-stock-details-response.js';
import { toDashboardPayableStockDetailsResponse } from '../http/to-dashboard-payable-stock-details-response.js';
import { toDashboardCashRealizedDetailsResponse } from '../http/to-dashboard-cash-realized-details-response.js';
import { toDashboardMonthlyCashFlowResponse } from '../http/to-dashboard-monthly-cash-flow-response.js';
import { toDashboardCashMovementHistoryResponse } from '../http/to-dashboard-cash-movement-history-response.js';
import { toDashboardCashExpectedHorizonResponse } from '../http/to-dashboard-cash-expected-horizon-response.js';
import { toDashboardMonthlyExpenseResponse } from '../http/to-dashboard-monthly-expense-response.js';
import { toDashboardMonthlyRevenueResponse } from '../http/to-dashboard-monthly-revenue-response.js';
import { toDashboardOverviewResponse } from '../http/to-dashboard-overview-response.js';
import { toDashboardReceivableCompositionResponse } from '../http/to-dashboard-receivable-composition-response.js';
import { toDashboardRevenueGoalResponse } from '../http/to-dashboard-revenue-goal-response.js';
import { toDashboardUpcomingResponse } from '../http/to-dashboard-upcoming-response.js';
import { toExpensesReportResponse } from '../../reports/http/to-expenses-report-response.js';
import { toRevenueReportResponse } from '../../reports/http/to-revenue-report-response.js';
import type { ExpensesReportResponse, RevenueReportResponse } from '../../reports/domain/types.js';
import type { CashBalanceHistoryService } from './cash-balance-history.service.js';

/** Competências exibidas no histórico compacto da meta, incluindo a selecionada. */
export const REVENUE_GOAL_HISTORY_MONTHS = 6;

/** Movimentação financeira Mensal: janela fixa de 12 meses (Correção 08-B). */
export const CASH_MOVEMENT_HISTORY_MONTHS = 12;

export type DashboardOverviewFacade = {
  listCostCenters(
    auth: AuthenticatedRequestContext,
    period: {
      readonly from: Date;
      readonly to: Date;
      readonly monthKey: string | null;
      readonly context: 'dashboard_month' | 'reports_range';
    },
  ): Promise<DashboardCostCentersResponse>;
  listCategories(
    auth: AuthenticatedRequestContext,
    period: {
      readonly from: Date;
      readonly to: Date;
      readonly monthKey: string | null;
      readonly context: 'dashboard_month' | 'reports_range';
    },
  ): Promise<DashboardCategoriesResponse>;
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
  getCashMovementHistory(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    costCenterId?: string | null,
    categoryId?: string | null,
  ): Promise<DashboardCashMovementHistoryResponse>;
  getCashExpectedHorizon(
    auth: AuthenticatedRequestContext,
    input: {
      readonly monthKey: string | null;
      readonly horizon: CashExpectedHorizonMonths;
      readonly costCenterId?: string | null;
      readonly categoryId?: string | null;
    },
  ): Promise<DashboardCashExpectedHorizonResponse>;
  getCashBalanceHistory(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
  ): Promise<DashboardCashBalanceHistoryResponse>;
  getExpectedReceivableDetails(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    costCenterId?: string | null,
    categoryId?: string | null,
  ): Promise<DashboardExpectedReceivableDetailsResponse>;
  getExpectedPayableDetails(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    costCenterId?: string | null,
    categoryId?: string | null,
  ): Promise<DashboardExpectedPayableDetailsResponse>;
  getReceivableStockDetails(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    costCenterId?: string | null,
    categoryId?: string | null,
  ): Promise<DashboardReceivableStockDetailsResponse>;
  getPayableStockDetails(
    auth: AuthenticatedRequestContext,
    monthKey: string | null,
    costCenterId?: string | null,
    categoryId?: string | null,
  ): Promise<DashboardPayableStockDetailsResponse>;
  getCashRealizedDetails(
    auth: AuthenticatedRequestContext,
    input: {
      readonly monthKey: string | null;
      readonly direction: CashRealizedDetailsDirection;
      readonly categoryKey: string;
      readonly categoryKind?: CashRealizedCategoryKind | null;
      readonly costCenterId?: string | null;
      readonly categoryId?: string | null;
      readonly limit?: number;
      readonly offset?: number;
    },
  ): Promise<DashboardCashRealizedDetailsResponse>;
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
  /** Previsto multi-mês à frente (horizonte 3|6|12). */
  readonly cashExpectedHorizon?: CashExpectedHorizonService;
  /** Detalhe lazy do A receber (CASH-4 receivable details). */
  readonly expectedReceivableDetails?: ExpectedReceivableDetailsService;
  /** Detalhe lazy de Contas a pagar (CASH-5 payable details). */
  readonly expectedPayableDetails?: ExpectedPayableDetailsService;
  /** 12-B — detalhe lazy de baixas realizadas por categoryKey. */
  readonly cashRealizedDetails?: CashRealizedDetailsService;
  /** 08-C2 — histórico de saldo bancário por snapshots. */
  readonly cashBalanceHistory?: CashBalanceHistoryService;
};

export function createDashboardOverviewFacade(
  deps: DashboardOverviewFacadeDependencies,
): DashboardOverviewFacade {
  return {
    async listCostCenters(auth, period) {
      const tenantId = requireOperationalTenantId(auth);
      const visibility = resolveCostCenterListVisibility(period);
      const items = await deps.costCenters.listVisibleForPeriod(
        tenantId,
        { from: period.from, to: period.to },
        { visibility },
      );
      return { items };
    },

    async listCategories(auth, period) {
      const tenantId = requireOperationalTenantId(auth);
      const visibility = resolveFinancialCategoryListVisibility(period);
      const rows = await deps.categories.listVisibleForPeriod(
        tenantId,
        { from: period.from, to: period.to },
        { visibility },
      );
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
      void situation; // CASH-6: situation não se aplica ao realizado
      const cashFlow = requireCashFlow(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const monthKeys = listInclusiveMonthKeysFromKeys(fromKey, toKey);
      // CASH-6: mesmo motor da Home. `situation` ignorado — não se aplica ao realizado.
      const months = await Promise.all(
        monthKeys.map((monthKey) =>
          cashFlow.getMonthlyCashFlow({
            tenantId,
            monthKey,
            ...costCenterFilter(resolved),
            ...categoryFilterSpread(categoryFilter),
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
      void situation; // CASH-6: situation não se aplica ao realizado
      const cashFlow = requireCashFlow(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const monthKeys = listInclusiveMonthKeysFromKeys(fromKey, toKey);
      const months = await Promise.all(
        monthKeys.map((monthKey) =>
          cashFlow.getMonthlyCashFlow({
            tenantId,
            monthKey,
            ...costCenterFilter(resolved),
            ...categoryFilterSpread(categoryFilter),
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

    /**
     * Histórico de 12 meses de caixa realizado (Correção 08-B).
     * Estratégia A: N× MonthlyCashFlowService — mesma semântica da Home.
     */
    async getCashMovementHistory(auth, monthKey, costCenterId = null, categoryId = null) {
      const cashFlow = requireCashFlow(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const endMonth = monthKey ?? civilMonthKey(civilTodayInSaoPaulo(new Date()));
      const monthKeys = listRevenueGoalHistoryMonthKeys(endMonth, CASH_MOVEMENT_HISTORY_MONTHS);
      const flows = await Promise.all(
        monthKeys.map((key) =>
          cashFlow.getMonthlyCashFlow({
            tenantId,
            monthKey: key,
            ...costCenterFilter(resolved),
            ...categoryFilterSpread(categoryFilter),
          }),
        ),
      );
      return toDashboardCashMovementHistoryResponse(flows);
    },

    async getCashExpectedHorizon(auth, input) {
      const service = requireCashExpectedHorizon(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, input.costCenterId ?? null);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, input.categoryId ?? null);
      const horizonInput: GetCashExpectedHorizonInput = {
        tenantId,
        horizon: input.horizon,
        ...(input.monthKey === null ? {} : { monthKey: input.monthKey }),
        ...costCenterFilter(resolved),
        ...categoryFilterSpread(categoryFilter),
      };
      const result = await service.getCashExpectedHorizon(horizonInput);
      return toDashboardCashExpectedHorizonResponse(result);
    },

    async getCashBalanceHistory(auth, monthKey) {
      const service = requireCashBalanceHistory(deps);
      const tenantId = requireOperationalTenantId(auth);
      return service.getCashBalanceHistory({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
      });
    },

    async getExpectedReceivableDetails(auth, monthKey, costCenterId = null, categoryId = null) {
      const detailsService = requireExpectedReceivableDetails(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const details = await detailsService.getExpectedReceivableDetails({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
        ...costCenterFilter(resolved),
        ...categoryFilterSpread(categoryFilter),
      });
      return toDashboardExpectedReceivableDetailsResponse(details);
    },

    async getExpectedPayableDetails(auth, monthKey, costCenterId = null, categoryId = null) {
      const detailsService = requireExpectedPayableDetails(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const details = await detailsService.getExpectedPayableDetails({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
        ...costCenterFilter(resolved),
        ...categoryFilterSpread(categoryFilter),
      });
      return toDashboardExpectedPayableDetailsResponse(details);
    },

    async getReceivableStockDetails(auth, monthKey, costCenterId = null, categoryId = null) {
      const detailsService = requireExpectedReceivableDetails(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const details = await detailsService.getReceivableStockDetails({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
        ...costCenterFilter(resolved),
        ...categoryFilterSpread(categoryFilter),
      });
      return toDashboardReceivableStockDetailsResponse(details);
    },

    async getPayableStockDetails(auth, monthKey, costCenterId = null, categoryId = null) {
      const detailsService = requireExpectedPayableDetails(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, costCenterId);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, categoryId);
      const details = await detailsService.getPayableStockDetails({
        tenantId,
        ...(monthKey === null ? {} : { monthKey }),
        ...costCenterFilter(resolved),
        ...categoryFilterSpread(categoryFilter),
      });
      return toDashboardPayableStockDetailsResponse(details);
    },

    async getCashRealizedDetails(auth, input) {
      const detailsService = requireCashRealizedDetails(deps);
      const tenantId = requireOperationalTenantId(auth);
      const resolved = await resolveCostCenterId(deps, tenantId, input.costCenterId ?? null);
      const categoryFilter = await resolveCategoryFilter(deps, tenantId, input.categoryId ?? null);
      const details = await detailsService.getCashRealizedDetails({
        tenantId,
        direction: input.direction,
        categoryKey: input.categoryKey,
        ...(input.categoryKind === undefined || input.categoryKind === null
          ? {}
          : { categoryKind: input.categoryKind }),
        ...(input.monthKey === null ? {} : { monthKey: input.monthKey }),
        ...costCenterFilter(resolved),
        ...categoryFilterSpread(categoryFilter),
        ...(input.limit === undefined ? {} : { limit: input.limit }),
        ...(input.offset === undefined ? {} : { offset: input.offset }),
      } satisfies GetCashRealizedDetailsInput);
      return toDashboardCashRealizedDetailsResponse(details);
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

function requireExpectedReceivableDetails(
  deps: DashboardOverviewFacadeDependencies,
): ExpectedReceivableDetailsService {
  if (!deps.expectedReceivableDetails) {
    throw new Error(
      'ExpectedReceivableDetailsService é obrigatório para receivables/expected-details.',
    );
  }
  return deps.expectedReceivableDetails;
}

function requireExpectedPayableDetails(
  deps: DashboardOverviewFacadeDependencies,
): ExpectedPayableDetailsService {
  if (!deps.expectedPayableDetails) {
    throw new Error(
      'ExpectedPayableDetailsService é obrigatório para payables/expected-details.',
    );
  }
  return deps.expectedPayableDetails;
}

function requireCashRealizedDetails(
  deps: DashboardOverviewFacadeDependencies,
): CashRealizedDetailsService {
  if (!deps.cashRealizedDetails) {
    throw new Error(
      'CashRealizedDetailsService é obrigatório para cash-realized/details.',
    );
  }
  return deps.cashRealizedDetails;
}

function requireCashFlow(deps: DashboardOverviewFacadeDependencies): MonthlyCashFlowService {
  if (!deps.cashFlow) {
    throw new Error(
      'MonthlyCashFlowService é obrigatório para monthly-cash-flow e relatórios de caixa.',
    );
  }
  return deps.cashFlow;
}

function requireCashExpectedHorizon(
  deps: DashboardOverviewFacadeDependencies,
): CashExpectedHorizonService {
  if (!deps.cashExpectedHorizon) {
    throw new Error(
      'CashExpectedHorizonService é obrigatório para cash-expected-horizon.',
    );
  }
  return deps.cashExpectedHorizon;
}

function requireCashBalanceHistory(
  deps: DashboardOverviewFacadeDependencies,
): CashBalanceHistoryService {
  if (!deps.cashBalanceHistory) {
    throw new Error(
      'CashBalanceHistoryService é obrigatório para cash-balance-history.',
    );
  }
  return deps.cashBalanceHistory;
}

function requireOperationalTenantId(auth: AuthenticatedRequestContext): string {
  const tenantId = resolveOperationalTenantId(auth);
  if (tenantId === null) {
    throw new ForbiddenError('Sem contexto de empresa para a Dashboard.');
  }
  return tenantId;
}
