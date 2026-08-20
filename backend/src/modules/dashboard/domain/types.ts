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
  readonly received: string;
  readonly outstanding: string;
  readonly percentage: string;
};

export type DashboardCompetenceDailyPoint = {
  readonly date: string;
  readonly amount: string;
  /** Σ paid snapshot dos títulos com competenceDate neste dia. Não é caixa do dia. */
  readonly received: string;
  /** Σ unpaid snapshot dos títulos com competenceDate neste dia. */
  readonly outstanding: string;
};

export type DashboardMonthlyRevenueResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly receivables: {
    readonly total: string;
    readonly received: string;
    readonly outstanding: string;
    readonly overdue: string;
    readonly classified: string;
    readonly uncategorized: string;
    readonly imprecise: string;
    readonly coverageRate: string | null;
    readonly items: readonly DashboardMonthlyRevenueCompositionItem[];
    /** Dia = competenceDate; Σ total. Não é caixa. */
    readonly daily: readonly DashboardCompetenceDailyPoint[];
  };
};

export type DashboardMonthlyExpenseCompositionItem = {
  readonly kind: DashboardExpenseCompositionKind;
  readonly name: string;
  readonly amount: string;
  readonly paid: string;
  readonly outstanding: string;
  readonly percentage: string;
};

export type DashboardMonthlyExpenseResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly payables: {
    readonly total: string;
    readonly paid: string;
    readonly outstanding: string;
    readonly overdue: string;
    readonly classified: string;
    readonly uncategorized: string;
    readonly imprecise: string;
    readonly coverageRate: string | null;
    readonly items: readonly DashboardMonthlyExpenseCompositionItem[];
    /** Dia = competenceDate; Σ total. Não é caixa. */
    readonly daily: readonly DashboardCompetenceDailyPoint[];
  };
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
