import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { assertTenantId } from '../../finance/repositories/read-query.js';
import { civilTodayInSaoPaulo } from '../domain/analytical-timezone.js';
import {
  CASH_FLOW_FORECAST_HORIZON_DAYS,
  calculateCashFlowForecast,
} from '../domain/cash-flow-forecast.js';
import {
  addCivilDays,
  civilMonthBounds,
  civilMonthBoundsFromKey,
} from '../domain/civil-calendar.js';
import { buildMonthlyExecutiveInsights } from '../domain/monthly-executive-insights.js';
import { buildDailyCompetenceTotals } from '../domain/daily-competence-series.js';
import { buildMonthEndCashPressureResult } from '../domain/month-end-cash-pressure.js';
import { calculateInstallmentStockSnapshot } from '../domain/installment-snapshot.js';
import {
  calculateMonthlyCompetenceRevenue,
  collectMonthlyRevenueCategoryExternalIds,
} from '../domain/monthly-competence-revenue.js';
import {
  classifyOpenPayablesByCategory,
  classifyOpenReceivablesByCategory,
  collectPayableCategoryExternalIds,
  presentOpenPayablesCategoryComposition,
} from '../domain/payable-category-composition.js';
import { calculateReceivableDelinquency } from '../domain/receivable-delinquency.js';
import type {
  CashFlowForecast,
  FinancialStockSnapshot,
  GetFinancialStockSnapshotInput,
  GetUpcomingInstallmentsInput,
  OpenPayablesCategoryCompositionResult,
  OpenReceivablesCategoryCompositionResult,
  GetMonthlyCompetenceRevenueInput,
  MonthlyCompetenceExpenseResult,
  MonthlyCompetenceRevenueResult,
  MonthEndCashPressureResult,
  UpcomingInstallments,
} from '../domain/types.js';
import {
  assertNDays,
  mapUpcomingInstallments,
  summarizeUpcomingWindow,
} from '../domain/upcoming.js';

export type AnalyticsService = {
  getFinancialStockSnapshot(input: GetFinancialStockSnapshotInput): Promise<FinancialStockSnapshot>;
  getUpcomingReceivables(input: GetUpcomingInstallmentsInput): Promise<UpcomingInstallments>;
  getUpcomingPayables(input: GetUpcomingInstallmentsInput): Promise<UpcomingInstallments>;
  getCashFlowForecast(input: GetFinancialStockSnapshotInput): Promise<CashFlowForecast>;
  getOpenPayablesCategoryComposition(
    input: GetFinancialStockSnapshotInput,
  ): Promise<OpenPayablesCategoryCompositionResult>;
  getOpenReceivablesCategoryComposition(
    input: GetFinancialStockSnapshotInput,
  ): Promise<OpenReceivablesCategoryCompositionResult>;
  getMonthlyCompetenceRevenue(
    input: GetMonthlyCompetenceRevenueInput,
  ): Promise<MonthlyCompetenceRevenueResult>;
  getMonthlyCompetenceExpenses(
    input: GetMonthlyCompetenceRevenueInput,
  ): Promise<MonthlyCompetenceExpenseResult>;
  getMonthlyExecutiveInsights(
    input: GetMonthlyCompetenceRevenueInput,
  ): Promise<import('../domain/monthly-executive-insights.js').MonthlyExecutiveInsightsResult>;
  getMonthEndCashPressure(
    input: GetFinancialStockSnapshotInput,
  ): Promise<MonthEndCashPressureResult>;
};

export type AnalyticsServiceDependencies = {
  readonly receivables: ReceivableReadRepository;
  readonly payables: PayableReadRepository;
  readonly categories: FinancialCategoryReadRepository;
};

export function createAnalyticsService(deps: AnalyticsServiceDependencies): AnalyticsService {
  return {
    async getFinancialStockSnapshot(input) {
      const { tenantId, today, scope } = resolveScope(input);
      const [receivableRows, payableRows] = await Promise.all([
        deps.receivables.findActiveByTenant(scope),
        deps.payables.findActiveByTenant(scope),
      ]);
      const receivables = calculateInstallmentStockSnapshot(receivableRows, today);
      return {
        tenantId,
        today,
        receivables,
        payables: calculateInstallmentStockSnapshot(payableRows, today),
        receivableDelinquency: calculateReceivableDelinquency(receivables),
      };
    },

    async getOpenPayablesCategoryComposition(input) {
      return loadOpenPayablesCategoryComposition(deps, input);
    },

    async getOpenReceivablesCategoryComposition(input) {
      return loadOpenReceivablesCategoryComposition(deps, input);
    },

    async getMonthlyCompetenceRevenue(input) {
      return loadMonthlyCompetenceRevenue(deps, input);
    },

    async getMonthlyCompetenceExpenses(input) {
      return loadMonthlyCompetenceExpenses(deps, input);
    },

    async getMonthlyExecutiveInsights(input) {
      const [revenue, expense] = await Promise.all([
        loadMonthlyCompetenceRevenue(deps, input),
        loadMonthlyCompetenceExpenses(deps, input),
      ]);
      return buildMonthlyExecutiveInsights({
        tenantId: revenue.tenantId,
        today: revenue.today,
        monthKey: revenue.monthKey,
        from: revenue.from,
        to: revenue.to,
        revenue,
        expense,
      });
    },

    async getMonthEndCashPressure(input) {
      const { tenantId, today, scope } = resolveScope(input);
      const { to, monthKey } = civilMonthBounds(today);
      const [receivables, payables] = await Promise.all([
        loadDueDateWindow(deps.receivables.findActiveByDueDateRange, scope, today, to),
        loadDueDateWindow(deps.payables.findActiveByDueDateRange, scope, today, to),
      ]);
      return buildMonthEndCashPressureResult({
        tenantId,
        today,
        monthKey,
        from: today,
        to,
        summary: summarizeUpcomingWindow(receivables, payables),
      });
    },

    async getUpcomingReceivables(input) {
      return loadUpcoming(deps.receivables.findActiveByDueDateRange, input);
    },

    async getUpcomingPayables(input) {
      return loadUpcoming(deps.payables.findActiveByDueDateRange, input);
    },

    async getCashFlowForecast(input) {
      return loadCashFlowForecast(deps, input);
    },
  };
}

function resolveScope(input: GetFinancialStockSnapshotInput) {
  assertTenantId(input.tenantId);
  const now = input.now ?? new Date();
  return {
    tenantId: input.tenantId,
    today: civilTodayInSaoPaulo(now),
    scope: { tenantId: input.tenantId, integrationId: input.integrationId },
  };
}

async function loadOpenPayablesCategoryComposition(
  deps: AnalyticsServiceDependencies,
  input: GetFinancialStockSnapshotInput,
): Promise<OpenPayablesCategoryCompositionResult> {
  const { tenantId, today, scope } = resolveScope(input);
  const payables = await deps.payables.findActiveByTenant(scope);
  const externalIds = collectPayableCategoryExternalIds(payables);
  const categories = await deps.categories.findByTenantAndExternalIds({
    ...scope,
    externalIds,
  });
  const classified = classifyOpenPayablesByCategory(payables, categories);
  const presented = presentOpenPayablesCategoryComposition(classified);
  return {
    tenantId,
    today,
    total: presented.total,
    classified: presented.classified,
    uncategorized: presented.uncategorized,
    imprecise: presented.imprecise,
    coverageRate: presented.coverageRate,
    items: presented.items.map((item) => ({
      kind: item.kind,
      name: item.name,
      amount: item.amount,
      percentage: item.percentage,
    })),
  };
}

async function loadOpenReceivablesCategoryComposition(
  deps: AnalyticsServiceDependencies,
  input: GetFinancialStockSnapshotInput,
): Promise<OpenReceivablesCategoryCompositionResult> {
  const { tenantId, today, scope } = resolveScope(input);
  const receivables = await deps.receivables.findActiveByTenant(scope);
  const externalIds = collectPayableCategoryExternalIds(receivables);
  const categories = await deps.categories.findByTenantAndExternalIds({
    ...scope,
    externalIds,
  });
  const classified = classifyOpenReceivablesByCategory(receivables, categories);
  const presented = presentOpenPayablesCategoryComposition(classified);
  return {
    tenantId,
    today,
    total: presented.total,
    classified: presented.classified,
    uncategorized: presented.uncategorized,
    imprecise: presented.imprecise,
    coverageRate: presented.coverageRate,
    items: presented.items.map((item) => ({
      kind: item.kind,
      name: item.name,
      amount: item.amount,
      percentage: item.percentage,
    })),
  };
}

async function loadMonthlyCompetenceRevenue(
  deps: AnalyticsServiceDependencies,
  input: GetMonthlyCompetenceRevenueInput,
): Promise<MonthlyCompetenceRevenueResult> {
  const { tenantId, today, scope } = resolveScope(input);
  const { from, to, monthKey } =
    input.monthKey === undefined
      ? civilMonthBounds(today)
      : civilMonthBoundsFromKey(input.monthKey);
  const receivables = await deps.receivables.findMonthlyCompetenceRevenue({
    ...scope,
    from,
    to,
  });
  const externalIds = collectMonthlyRevenueCategoryExternalIds(receivables);
  const categories = await deps.categories.findByTenantAndExternalIds({
    ...scope,
    externalIds,
  });
  const calculated = calculateMonthlyCompetenceRevenue(receivables, categories, today);
  return {
    tenantId,
    today,
    monthKey,
    from,
    to,
    total: calculated.total,
    received: calculated.received,
    outstanding: calculated.outstanding,
    overdue: calculated.overdue,
    classified: calculated.classified,
    uncategorized: calculated.uncategorized,
    imprecise: calculated.imprecise,
    coverageRate: calculated.coverageRate,
    items: calculated.items.map((item) => ({
      kind: item.kind,
      name: item.name,
      amount: item.amount,
      received: item.received,
      outstanding: item.outstanding,
      percentage: item.percentage,
    })),
    daily: buildDailyCompetenceTotals(receivables, from, to),
  };
}

async function loadMonthlyCompetenceExpenses(
  deps: AnalyticsServiceDependencies,
  input: GetMonthlyCompetenceRevenueInput,
): Promise<MonthlyCompetenceExpenseResult> {
  const { tenantId, today, scope } = resolveScope(input);
  const { from, to, monthKey } =
    input.monthKey === undefined
      ? civilMonthBounds(today)
      : civilMonthBoundsFromKey(input.monthKey);
  const payables = await deps.payables.findMonthlyCompetenceExpenses({
    ...scope,
    from,
    to,
  });
  const externalIds = collectMonthlyRevenueCategoryExternalIds(payables);
  const categories = await deps.categories.findByTenantAndExternalIds({
    ...scope,
    externalIds,
  });
  const calculated = calculateMonthlyCompetenceRevenue(
    payables,
    categories,
    today,
    undefined,
    'EXPENSE',
  );
  return {
    tenantId,
    today,
    monthKey,
    from,
    to,
    total: calculated.total,
    received: calculated.received,
    outstanding: calculated.outstanding,
    overdue: calculated.overdue,
    classified: calculated.classified,
    uncategorized: calculated.uncategorized,
    imprecise: calculated.imprecise,
    coverageRate: calculated.coverageRate,
    items: calculated.items.map((item) => ({
      kind: item.kind,
      name: item.name,
      amount: item.amount,
      received: item.received,
      outstanding: item.outstanding,
      percentage: item.percentage,
    })),
    daily: buildDailyCompetenceTotals(payables, from, to),
  };
}

async function loadCashFlowForecast(
  deps: AnalyticsServiceDependencies,
  input: GetFinancialStockSnapshotInput,
): Promise<CashFlowForecast> {
  const { tenantId, today, scope } = resolveScope(input);
  const from = today;
  const to = addCivilDays(today, CASH_FLOW_FORECAST_HORIZON_DAYS);
  const [receivables, payables] = await Promise.all([
    deps.receivables.findActiveByDueDateRange({ ...scope, from, to }),
    deps.payables.findActiveByDueDateRange({ ...scope, from, to }),
  ]);
  return {
    tenantId,
    today,
    ...calculateCashFlowForecast(receivables, payables, from, to),
  };
}

async function loadDueDateWindow(
  findActiveByDueDateRange: ReceivableReadRepository['findActiveByDueDateRange'],
  scope: { readonly tenantId: string; readonly integrationId?: string },
  from: Date,
  to: Date,
): Promise<ReturnType<typeof mapUpcomingInstallments>> {
  const records = await findActiveByDueDateRange({ ...scope, from, to });
  return mapUpcomingInstallments(records);
}

async function loadUpcoming(
  findActiveByDueDateRange: ReceivableReadRepository['findActiveByDueDateRange'],
  input: GetUpcomingInstallmentsInput,
): Promise<UpcomingInstallments> {
  assertNDays(input.nDays);
  const { tenantId, today, scope } = resolveScope(input);
  const from = today;
  const to = addCivilDays(today, input.nDays);
  const records = await findActiveByDueDateRange({ ...scope, from, to });
  return {
    tenantId,
    today,
    nDays: input.nDays,
    from,
    to,
    items: mapUpcomingInstallments(records),
  };
}
