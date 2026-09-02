export type DashboardOverviewMoneySnapshot = {
  readonly open: string;
  readonly overdue: string;
  readonly upcoming: string;
};

export type DashboardOverviewDelinquency = {
  readonly overdueUnpaid: string;
  readonly openUnpaid: string;
  readonly rate: string | null;
};

export type DashboardOverviewIntegration = {
  readonly status: 'CONNECTED' | 'DISCONNECTED' | 'ERROR';
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastErrorCode: string | null;
};

export type DashboardOverviewResponse = {
  readonly today: string;
  readonly receivables: DashboardOverviewMoneySnapshot;
  readonly payables: DashboardOverviewMoneySnapshot;
  readonly delinquency: DashboardOverviewDelinquency;
  readonly integration: DashboardOverviewIntegration;
};

export const DASHBOARD_UPCOMING_ALLOWED_DAYS = [7, 15, 30] as const;

export type DashboardUpcomingDays = (typeof DASHBOARD_UPCOMING_ALLOWED_DAYS)[number];

export type DashboardUpcomingInstallmentStatus = 'OPEN' | 'OVERDUE' | 'PARTIALLY_PAID';

export type DashboardUpcomingItem = {
  readonly id: string;
  readonly dueDate: string;
  readonly unpaid: string;
  readonly status: DashboardUpcomingInstallmentStatus;
};

export type DashboardUpcomingSummary = {
  readonly receivable: string;
  readonly payable: string;
  readonly net: string;
};

export type DashboardUpcomingResponse = {
  readonly today: string;
  readonly nDays: DashboardUpcomingDays;
  readonly from: string;
  readonly to: string;
  readonly summary: DashboardUpcomingSummary;
  readonly receivables: { readonly items: readonly DashboardUpcomingItem[] };
  readonly payables: { readonly items: readonly DashboardUpcomingItem[] };
};

export type DashboardForecastBucket = {
  readonly key: string;
  readonly inflows: string;
  readonly outflows: string;
  readonly net: string;
};

export type DashboardCashFlowForecastResponse = {
  readonly today: string;
  readonly from: string;
  readonly to: string;
  readonly horizonDays: number;
  readonly buckets: readonly DashboardForecastBucket[];
};

export type DashboardExpenseCompositionKind = 'category' | 'other' | 'uncategorized' | 'imprecise';

export type DashboardExpenseCompositionItem = {
  readonly kind: DashboardExpenseCompositionKind;
  readonly name: string;
  readonly amount: string;
  readonly percentage: string;
};

export type DashboardExpenseCompositionResponse = {
  readonly today: string;
  readonly payables: {
    readonly total: string;
    readonly classified: string;
    readonly uncategorized: string;
    readonly imprecise: string;
    readonly coverageRate: string | null;
    readonly items: readonly DashboardExpenseCompositionItem[];
  };
};

export type DashboardReceivableCompositionResponse = {
  readonly today: string;
  readonly receivables: {
    readonly total: string;
    readonly classified: string;
    readonly uncategorized: string;
    readonly imprecise: string;
    readonly coverageRate: string | null;
    readonly items: readonly DashboardExpenseCompositionItem[];
  };
};

export type DashboardMonthlyRevenueCompositionItem = {
  readonly kind: DashboardExpenseCompositionKind;
  readonly name: string;
  readonly amount: string;
  /** null com `costCenterCashSplit: false` (PARCIAL). */
  readonly received: string | null;
  /** null com `costCenterCashSplit: false` (PARCIAL). */
  readonly outstanding: string | null;
  readonly percentage: string;
};

export type DashboardCompetenceDailyPoint = {
  readonly date: string;
  readonly amount: string;
  /** Σ paid snapshot; null com filtro de centro. */
  readonly received: string | null;
  /** Σ unpaid snapshot; null com filtro de centro. */
  readonly outstanding: string | null;
};

export type DashboardMonthlyRevenueResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  /**
   * false = filtro por centro (totais via allocation.amount; cash split null).
   * Ausente/`true` = consolidado (comportamento histórico).
   */
  readonly costCenterCashSplit?: boolean;
  readonly receivables: {
    readonly total: string;
    readonly received: string | null;
    readonly outstanding: string | null;
    readonly overdue: string | null;
    readonly classified: string;
    readonly uncategorized: string;
    readonly imprecise: string;
    readonly coverageRate: string | null;
    readonly items: readonly DashboardMonthlyRevenueCompositionItem[];
    /** Dia = competenceDate; Σ total (ou allocation). Não é caixa. */
    readonly daily: readonly DashboardCompetenceDailyPoint[];
  };
};

export type DashboardMonthlyExpenseCompositionItem = {
  readonly kind: DashboardExpenseCompositionKind;
  readonly name: string;
  readonly amount: string;
  /** null com `costCenterCashSplit: false` (PARCIAL). */
  readonly paid: string | null;
  /** null com `costCenterCashSplit: false` (PARCIAL). */
  readonly outstanding: string | null;
  readonly percentage: string;
};

export type DashboardMonthlyExpenseResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly costCenterCashSplit?: boolean;
  readonly payables: {
    readonly total: string;
    readonly paid: string | null;
    readonly outstanding: string | null;
    readonly overdue: string | null;
    readonly classified: string;
    readonly uncategorized: string;
    readonly imprecise: string;
    readonly coverageRate: string | null;
    readonly items: readonly DashboardMonthlyExpenseCompositionItem[];
    /** Dia = competenceDate; Σ total (ou allocation). Não é caixa. */
    readonly daily: readonly DashboardCompetenceDailyPoint[];
  };
};

export type DashboardCostCenterItem = {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly active: boolean;
};

export type DashboardCostCentersResponse = {
  readonly items: readonly DashboardCostCenterItem[];
};

export type DashboardCategoryItem = {
  readonly id: string;
  readonly name: string;
  readonly type: 'REVENUE' | 'EXPENSE' | 'UNKNOWN';
};

export type DashboardCategoriesResponse = {
  readonly items: readonly DashboardCategoryItem[];
};

export type DashboardExecutiveInsightId =
  | 'revenue-expense-total'
  | 'revenue-expense-balance'
  | 'top-revenue-category'
  | 'top-expense-category'
  | 'expense-classification-gap';

export type DashboardExecutiveInsightsResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly insights: readonly {
    readonly id: DashboardExecutiveInsightId;
    readonly body: string;
  }[];
};

export type DashboardRevenueGoalStatus =
  | 'NO_TARGET'
  | 'IN_PROGRESS'
  | 'NOT_ACHIEVED'
  | 'ACHIEVED'
  | 'EXCEEDED'
  | 'PLANNED';

export type DashboardRevenueGoalHistoryPoint = {
  readonly monthKey: string;
  /** null = competência sem meta cadastrada. */
  readonly target: string | null;
  readonly actual: string;
  readonly achievementRate: string | null;
  readonly status: DashboardRevenueGoalStatus;
};

/**
 * Meta mensal de faturamento (F2 / CASH-4B). `actual` = MonthlyCashFlow.billing
 * (caixa, company-level); `achievementRate` já vem × 100.
 */
export type DashboardRevenueGoalResponse = {
  readonly monthKey: string;
  readonly target: string | null;
  readonly actual: string;
  readonly achievementRate: string | null;
  readonly remaining: string | null;
  readonly exceeded: string | null;
  readonly status: DashboardRevenueGoalStatus;
  readonly history: readonly DashboardRevenueGoalHistoryPoint[];
};

export type DashboardMonthEndCashPressureResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly summary: {
    readonly receivable: string;
    readonly payable: string;
    readonly net: string;
  };
};

/** Totais de caixa. null = costCenterCashSplit unavailable. */
export type DashboardMonthlyCashFlowMoney = {
  readonly inflows: string | null;
  readonly outflows: string | null;
  readonly result: string | null;
};

export type DashboardMonthlyCashFlowExpected = {
  readonly receivables: string | null;
  readonly payables: string | null;
  readonly result: string | null;
};

export type DashboardMonthlyCashFlowOverdue = {
  readonly receivables: string | null;
  readonly payables: string | null;
  readonly ofMonth: {
    readonly receivables: string | null;
    readonly payables: string | null;
  };
};

export type DashboardMonthlyCashFlowDailyRealizedPoint = {
  readonly date: string;
  readonly inflows: string | null;
  readonly outflows: string | null;
  readonly result: string | null;
};

export type DashboardMonthlyCashFlowDailyExpectedPoint = {
  readonly date: string;
  readonly receivables: string | null;
  readonly payables: string | null;
  readonly result: string | null;
};

/**
 * GET /dashboard/monthly-cash-flow (CASH-3B).
 * `billing` = monthlyBilling(flow) = realized.inflows + expected.receivables.
 * Vencido não entra. Monetário em string, como os demais GETs da Dashboard.
 * CASH-4C-CAT: `realizedByCategory` = composição D8 do caixa realizado.
 */
export type DashboardCashRealizedCategoryItem = {
  readonly kind: 'category' | 'other' | 'uncategorized' | 'imprecise';
  readonly name: string;
  readonly amount: string;
  readonly percentage: string;
};

export type DashboardCashRealizedCategoryComposition = {
  readonly total: string;
  readonly classified: string;
  readonly uncategorized: string;
  readonly imprecise: string;
  readonly coverageRate: string | null;
  readonly items: readonly DashboardCashRealizedCategoryItem[];
};

export type DashboardMonthlyCashFlowResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly costCenterCashSplit: boolean;
  readonly billing: string | null;
  readonly realized: DashboardMonthlyCashFlowMoney;
  readonly realizedByCategory: {
    readonly inflows: DashboardCashRealizedCategoryComposition | null;
    readonly outflows: DashboardCashRealizedCategoryComposition | null;
  };
  readonly expected: DashboardMonthlyCashFlowExpected;
  readonly overdue: DashboardMonthlyCashFlowOverdue;
  readonly coverage: string | null;
  readonly daily: {
    readonly realized: readonly DashboardMonthlyCashFlowDailyRealizedPoint[];
    readonly expected: readonly DashboardMonthlyCashFlowDailyExpectedPoint[];
  };
};

/** GET /dashboard/receivables/expected-details — itens do KPI A receber (lazy). */
export type DashboardExpectedReceivableDetailItem = {
  readonly id: string;
  readonly externalId: string;
  readonly dueDate: string;
  readonly amount: string;
  readonly description: string | null;
  readonly customerName: string | null;
  readonly categoryNames: readonly string[];
};

export type DashboardExpectedReceivableDetailsResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly available: boolean;
  readonly total: string | null;
  readonly items: readonly DashboardExpectedReceivableDetailItem[];
};
