import type { CostCenterAllocationReadRepository } from '../../finance/repositories/cost-center-allocation-read.repository.js';
import type { FinancialCategoryReadRepository } from '../../finance/repositories/financial-category-read.repository.js';
import type { PayableReadRepository } from '../../finance/repositories/payable-read.repository.js';
import type { ReceivableReadRepository } from '../../finance/repositories/receivable-read.repository.js';
import { assertTenantId } from '../../finance/repositories/read-query.js';
import { applyDashboardHomeFilters } from '../domain/dashboard-home-filters.js';
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
import {
  buildDailyCompetenceAllocationTotals,
  calculateMonthlyCompetenceFromAllocations,
  toAllocationExposureInstallments,
  toAllocationMonthlySources,
} from '../domain/cost-center-allocation-math.js';
import { buildMonthlyExecutiveInsights } from '../domain/monthly-executive-insights.js';
import { buildDailyCompetenceTotals } from '../domain/daily-competence-series.js';
import { buildMonthEndCashPressureResult } from '../domain/month-end-cash-pressure.js';
import { calculateInstallmentPendingStock } from '../domain/installment-snapshot.js';
import type { InstallmentSnapshotInput } from '../domain/installment-snapshot.js';
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
  readonly costCenterAllocations?: CostCenterAllocationReadRepository;
};

export function createAnalyticsService(deps: AnalyticsServiceDependencies): AnalyticsService {
  return {
    async getFinancialStockSnapshot(input) {
      const { tenantId, today, scope, costCenterId } = resolveScope(input);
      if (costCenterId !== undefined) {
        const allocations = requireAllocations(deps);
        const [receivableRows, payableRows] = await Promise.all([
          allocations.findActiveReceivableAllocations({ ...scope, costCenterId }),
          allocations.findActivePayableAllocations({ ...scope, costCenterId }),
        ]);
        return buildOfficialStockSnapshot(
          tenantId,
          today,
          toAllocationExposureInstallments(receivableRows),
          toAllocationExposureInstallments(payableRows),
        );
      }
      const [receivableRows, payableRows] = await Promise.all([
        deps.receivables.findActiveByTenant(scope),
        deps.payables.findActiveByTenant(scope),
      ]);
      return buildOfficialStockSnapshot(tenantId, today, receivableRows, payableRows);
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
      const { tenantId, today, scope, costCenterId } = resolveScope(input);
      const { to, monthKey } = civilMonthBounds(today);
      if (costCenterId !== undefined) {
        const allocations = requireAllocations(deps);
        const [receivableRows, payableRows] = await Promise.all([
          allocations.findActiveReceivableAllocationsByDueDate({
            ...scope,
            costCenterId,
            from: today,
            to,
          }),
          allocations.findActivePayableAllocationsByDueDate({
            ...scope,
            costCenterId,
            from: today,
            to,
          }),
        ]);
        const receivables = applyDashboardHomeFilters(
          toAllocationExposureInstallments(receivableRows).filter((row) =>
            row.unpaid.greaterThan(0),
          ),
          categoryOnlyDashboardFilters(input, 'REVENUE', today),
        ).map((row) => ({
          id: row.id,
          dueDate: row.dueDate,
          unpaid: row.unpaid,
          status: row.status,
        }));
        const payables = applyDashboardHomeFilters(
          toAllocationExposureInstallments(payableRows).filter((row) => row.unpaid.greaterThan(0)),
          categoryOnlyDashboardFilters(input, 'EXPENSE', today),
        ).map((row) => ({
          id: row.id,
          dueDate: row.dueDate,
          unpaid: row.unpaid,
          status: row.status,
        }));
        return buildMonthEndCashPressureResult({
          tenantId,
          today,
          monthKey,
          from: today,
          to,
          summary: summarizeUpcomingWindow(receivables, payables),
        });
      }
      const [receivableRecords, payableRecords] = await Promise.all([
        deps.receivables.findActiveByDueDateRange({ ...scope, from: today, to }),
        deps.payables.findActiveByDueDateRange({ ...scope, from: today, to }),
      ]);
      return buildMonthEndCashPressureResult({
        tenantId,
        today,
        monthKey,
        from: today,
        to,
        summary: summarizeUpcomingWindow(
          mapUpcomingInstallments(
            applyDashboardHomeFilters(
              receivableRecords,
              categoryOnlyDashboardFilters(input, 'REVENUE', today),
            ),
          ),
          mapUpcomingInstallments(
            applyDashboardHomeFilters(
              payableRecords,
              categoryOnlyDashboardFilters(input, 'EXPENSE', today),
            ),
          ),
        ),
      });
    },

    async getUpcomingReceivables(input) {
      return loadUpcoming(deps, 'receivable', input);
    },

    async getUpcomingPayables(input) {
      return loadUpcoming(deps, 'payable', input);
    },

    async getCashFlowForecast(input) {
      return loadCashFlowForecast(deps, input);
    },
  };
}

function buildOfficialStockSnapshot(
  tenantId: string,
  today: Date,
  receivableRows: readonly InstallmentSnapshotInput[],
  payableRows: readonly InstallmentSnapshotInput[],
): FinancialStockSnapshot {
  const receivablePending = calculateInstallmentPendingStock(receivableRows, today);
  const payablePending = calculateInstallmentPendingStock(payableRows, today);
  const receivables = {
    open: receivablePending.open,
    overdue: receivablePending.overdue,
    upcoming: receivablePending.dueToday.plus(receivablePending.upcoming),
  };
  const payables = {
    open: payablePending.open,
    overdue: payablePending.overdue,
    upcoming: payablePending.dueToday.plus(payablePending.upcoming),
  };
  return {
    tenantId,
    today,
    receivables,
    payables,
    receivableDelinquency: calculateReceivableDelinquency(receivables),
    pending: {
      receivables: receivablePending,
      payables: payablePending,
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
    costCenterId: input.costCenterId,
  };
}

function requireAllocations(
  deps: AnalyticsServiceDependencies,
): CostCenterAllocationReadRepository {
  if (deps.costCenterAllocations === undefined) {
    throw new Error('Repositório de alocações de centro de custo não configurado.');
  }
  return deps.costCenterAllocations;
}

async function loadOpenPayablesCategoryComposition(
  deps: AnalyticsServiceDependencies,
  input: GetFinancialStockSnapshotInput,
): Promise<OpenPayablesCategoryCompositionResult> {
  const { tenantId, today, scope, costCenterId } = resolveScope(input);
  const payables =
    costCenterId === undefined
      ? await deps.payables.findActiveByTenant(scope)
      : toAllocationExposureInstallments(
          await requireAllocations(deps).findActivePayableAllocations({
            ...scope,
            costCenterId,
          }),
        );
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
  const { tenantId, today, scope, costCenterId } = resolveScope(input);
  const receivables =
    costCenterId === undefined
      ? await deps.receivables.findActiveByTenant(scope)
      : toAllocationExposureInstallments(
          await requireAllocations(deps).findActiveReceivableAllocations({
            ...scope,
            costCenterId,
          }),
        );
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
  const { tenantId, today, scope, costCenterId } = resolveScope(input);
  const { from, to, monthKey } =
    input.monthKey === undefined
      ? civilMonthBounds(today)
      : civilMonthBoundsFromKey(input.monthKey);

  if (costCenterId !== undefined) {
    const allocationRows = await requireAllocations(deps).findReceivableAllocationsForCompetence({
      ...scope,
      costCenterId,
      from,
      to,
    });
    const sources = applyDashboardHomeFilters(
      toAllocationMonthlySources(allocationRows),
      monthlyDashboardFilters(input, 'REVENUE', today),
    );
    const externalIds = collectMonthlyRevenueCategoryExternalIds(
      sources.map((row) => ({ categoryExternalIds: row.categoryExternalIds })),
    );
    const categories = await deps.categories.findByTenantAndExternalIds({
      ...scope,
      externalIds,
    });
    const calculated = calculateMonthlyCompetenceFromAllocations(
      sources,
      categories,
      'REVENUE',
      today,
    );
    return {
      tenantId,
      today,
      monthKey,
      from,
      to,
      costCenterCashSplit: calculated.costCenterCashSplit,
      total: calculated.total,
      received: calculated.received,
      outstanding: calculated.outstanding,
      overdue: calculated.overdue,
      classified: calculated.classified,
      uncategorized: calculated.uncategorized,
      imprecise: calculated.imprecise,
      coverageRate: calculated.coverageRate,
      items: calculated.items,
      daily: buildDailyCompetenceAllocationTotals(sources, from, to, today),
    };
  }

  const receivables = applyDashboardHomeFilters(
    await deps.receivables.findMonthlyCompetenceRevenue({
      ...scope,
      from,
      to,
    }),
    monthlyDashboardFilters(input, 'REVENUE', today),
  );
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
    costCenterCashSplit: true,
    total: calculated.total,
    received: calculated.received,
    outstanding: calculated.outstanding,
    overdue: calculated.overdue,
    classified: calculated.classified,
    uncategorized: calculated.uncategorized,
    imprecise: calculated.imprecise,
    coverageRate: calculated.coverageRate,
    items: calculated.items,
    daily: buildDailyCompetenceTotals(receivables, from, to),
  };
}

async function loadMonthlyCompetenceExpenses(
  deps: AnalyticsServiceDependencies,
  input: GetMonthlyCompetenceRevenueInput,
): Promise<MonthlyCompetenceExpenseResult> {
  const { tenantId, today, scope, costCenterId } = resolveScope(input);
  const { from, to, monthKey } =
    input.monthKey === undefined
      ? civilMonthBounds(today)
      : civilMonthBoundsFromKey(input.monthKey);

  if (costCenterId !== undefined) {
    const allocationRows = await requireAllocations(deps).findPayableAllocationsForCompetence({
      ...scope,
      costCenterId,
      from,
      to,
    });
    const sources = applyDashboardHomeFilters(
      toAllocationMonthlySources(allocationRows),
      monthlyDashboardFilters(input, 'EXPENSE', today),
    );
    const externalIds = collectMonthlyRevenueCategoryExternalIds(
      sources.map((row) => ({ categoryExternalIds: row.categoryExternalIds })),
    );
    const categories = await deps.categories.findByTenantAndExternalIds({
      ...scope,
      externalIds,
    });
    const calculated = calculateMonthlyCompetenceFromAllocations(
      sources,
      categories,
      'EXPENSE',
      today,
    );
    return {
      tenantId,
      today,
      monthKey,
      from,
      to,
      costCenterCashSplit: calculated.costCenterCashSplit,
      total: calculated.total,
      received: calculated.received,
      outstanding: calculated.outstanding,
      overdue: calculated.overdue,
      classified: calculated.classified,
      uncategorized: calculated.uncategorized,
      imprecise: calculated.imprecise,
      coverageRate: calculated.coverageRate,
      items: calculated.items,
      daily: buildDailyCompetenceAllocationTotals(sources, from, to, today),
    };
  }

  const payables = applyDashboardHomeFilters(
    await deps.payables.findMonthlyCompetenceExpenses({
      ...scope,
      from,
      to,
    }),
    monthlyDashboardFilters(input, 'EXPENSE', today),
  );
  const externalIds = collectMonthlyRevenueCategoryExternalIds(payables);
  const categories = await deps.categories.findByTenantAndExternalIds({
    ...scope,
    externalIds,
  });
  const calculated = calculateMonthlyCompetenceRevenue(
    payables,
    categories,
    today,
    'EXPENSE',
  );
  return {
    tenantId,
    today,
    monthKey,
    from,
    to,
    costCenterCashSplit: true,
    total: calculated.total,
    received: calculated.received,
    outstanding: calculated.outstanding,
    overdue: calculated.overdue,
    classified: calculated.classified,
    uncategorized: calculated.uncategorized,
    imprecise: calculated.imprecise,
    coverageRate: calculated.coverageRate,
    items: calculated.items,
    daily: buildDailyCompetenceTotals(payables, from, to),
  };
}

async function loadCashFlowForecast(
  deps: AnalyticsServiceDependencies,
  input: GetFinancialStockSnapshotInput,
): Promise<CashFlowForecast> {
  const { tenantId, today, scope, costCenterId } = resolveScope(input);
  const from = today;
  const to = addCivilDays(today, CASH_FLOW_FORECAST_HORIZON_DAYS);
  if (costCenterId !== undefined) {
    const allocations = requireAllocations(deps);
    const [receivableRows, payableRows] = await Promise.all([
      allocations.findActiveReceivableAllocationsByDueDate({ ...scope, costCenterId, from, to }),
      allocations.findActivePayableAllocationsByDueDate({ ...scope, costCenterId, from, to }),
    ]);
    return {
      tenantId,
      today,
      ...calculateCashFlowForecast(
        applyDashboardHomeFilters(
          toAllocationExposureInstallments(receivableRows),
          categoryOnlyDashboardFilters(input, 'REVENUE', today),
        ),
        applyDashboardHomeFilters(
          toAllocationExposureInstallments(payableRows),
          categoryOnlyDashboardFilters(input, 'EXPENSE', today),
        ),
        from,
        to,
      ),
    };
  }
  const [receivables, payables] = await Promise.all([
    deps.receivables.findActiveByDueDateRange({ ...scope, from, to }),
    deps.payables.findActiveByDueDateRange({ ...scope, from, to }),
  ]);
  return {
    tenantId,
    today,
    ...calculateCashFlowForecast(
      applyDashboardHomeFilters(receivables, categoryOnlyDashboardFilters(input, 'REVENUE', today)),
      applyDashboardHomeFilters(payables, categoryOnlyDashboardFilters(input, 'EXPENSE', today)),
      from,
      to,
    ),
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
  deps: AnalyticsServiceDependencies,
  side: 'receivable' | 'payable',
  input: GetUpcomingInstallmentsInput,
): Promise<UpcomingInstallments> {
  assertNDays(input.nDays);
  const { tenantId, today, scope, costCenterId } = resolveScope(input);
  const from = today;
  const to = addCivilDays(today, input.nDays);
  if (costCenterId !== undefined) {
    const allocations = requireAllocations(deps);
    const rows =
      side === 'receivable'
        ? await allocations.findActiveReceivableAllocationsByDueDate({
            ...scope,
            costCenterId,
            from,
            to,
          })
        : await allocations.findActivePayableAllocationsByDueDate({
            ...scope,
            costCenterId,
            from,
            to,
          });
    const exposure = toAllocationExposureInstallments(rows);
    return {
      tenantId,
      today,
      nDays: input.nDays,
      from,
      to,
      items: exposure
        .filter((row) => row.unpaid.greaterThan(0))
        .map((row) => ({
          id: row.id,
          dueDate: row.dueDate,
          unpaid: row.unpaid,
          status: row.status,
        })),
    };
  }
  const records =
    side === 'receivable'
      ? await deps.receivables.findActiveByDueDateRange({ ...scope, from, to })
      : await deps.payables.findActiveByDueDateRange({ ...scope, from, to });
  return {
    tenantId,
    today,
    nDays: input.nDays,
    from,
    to,
    items: mapUpcomingInstallments(records),
  };
}

function monthlyDashboardFilters(
  input: GetMonthlyCompetenceRevenueInput,
  expectedType: 'REVENUE' | 'EXPENSE',
  today: Date,
) {
  return {
    situation: input.situation ?? null,
    categoryFilter: input.categoryFilter ?? null,
    expectedType,
    today,
  };
}

function categoryOnlyDashboardFilters(
  input: GetFinancialStockSnapshotInput,
  expectedType: 'REVENUE' | 'EXPENSE',
  today: Date,
) {
  return {
    situation: null,
    categoryFilter: input.categoryFilter ?? null,
    expectedType,
    today,
  };
}
