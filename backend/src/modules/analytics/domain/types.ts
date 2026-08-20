import type { FinancialInstallmentStatus, Prisma } from '../../../generated/prisma/client.js';

export type InstallmentStockSnapshot = {
  readonly open: Prisma.Decimal;
  readonly overdue: Prisma.Decimal;
  readonly upcoming: Prisma.Decimal;
};

export type ReceivableDelinquency = {
  readonly overdueUnpaid: Prisma.Decimal;
  readonly openUnpaid: Prisma.Decimal;
  readonly rate: Prisma.Decimal | null;
};

export type FinancialStockSnapshot = {
  readonly tenantId: string;
  readonly today: Date;
  readonly receivables: InstallmentStockSnapshot;
  readonly payables: InstallmentStockSnapshot;
  readonly receivableDelinquency: ReceivableDelinquency;
};

export type GetFinancialStockSnapshotInput = {
  readonly tenantId: string;
  readonly now?: Date;
  readonly integrationId?: string;
};

export type GetMonthlyCompetenceRevenueInput = GetFinancialStockSnapshotInput & {
  /** Mês civil de competência (`YYYY-MM`). Ausente = mês corrente. */
  readonly monthKey?: string;
};

export type GetUpcomingInstallmentsInput = GetFinancialStockSnapshotInput & {
  readonly nDays: number;
};

export type UpcomingInstallment = {
  readonly id: string;
  readonly dueDate: Date;
  readonly unpaid: Prisma.Decimal;
  readonly status: FinancialInstallmentStatus;
};

export type UpcomingInstallments = {
  readonly tenantId: string;
  readonly today: Date;
  readonly nDays: number;
  readonly from: Date;
  readonly to: Date;
  readonly items: readonly UpcomingInstallment[];
};

export type ForecastBucket = {
  readonly key: string;
  readonly inflows: Prisma.Decimal;
  readonly outflows: Prisma.Decimal;
  readonly net: Prisma.Decimal;
};

export type CashFlowForecast = {
  readonly tenantId: string;
  readonly today: Date;
  readonly horizonDays: number;
  readonly from: Date;
  readonly to: Date;
  readonly buckets: readonly ForecastBucket[];
};

export type OpenPayablesCategoryCompositionResult = {
  readonly tenantId: string;
  readonly today: Date;
  readonly total: Prisma.Decimal;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly {
    readonly kind: 'category' | 'other' | 'uncategorized' | 'imprecise';
    readonly name: string;
    readonly amount: Prisma.Decimal;
    readonly percentage: Prisma.Decimal;
  }[];
};

export type OpenReceivablesCategoryCompositionResult = OpenPayablesCategoryCompositionResult;

export type MonthlyCompetenceDailyPoint = {
  readonly date: Date;
  readonly amount: Prisma.Decimal;
  readonly received: Prisma.Decimal;
  readonly outstanding: Prisma.Decimal;
};

export type MonthlyCompetenceRevenueResult = {
  readonly tenantId: string;
  readonly today: Date;
  readonly monthKey: string;
  readonly from: Date;
  readonly to: Date;
  readonly total: Prisma.Decimal;
  readonly received: Prisma.Decimal;
  readonly outstanding: Prisma.Decimal;
  readonly overdue: Prisma.Decimal;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly {
    readonly kind: 'category' | 'other' | 'uncategorized' | 'imprecise';
    readonly name: string;
    readonly amount: Prisma.Decimal;
    readonly received: Prisma.Decimal;
    readonly outstanding: Prisma.Decimal;
    readonly percentage: Prisma.Decimal;
  }[];
  /** Dia = competenceDate; valor = Σ total. Não é caixa. */
  readonly daily: readonly MonthlyCompetenceDailyPoint[];
};

export type MonthlyCompetenceExpenseResult = MonthlyCompetenceRevenueResult;

export type ExecutiveInsightsResult =
  import('./monthly-executive-insights.js').MonthlyExecutiveInsightsResult;

export type MonthEndCashPressureResult =
  import('./month-end-cash-pressure.js').MonthEndCashPressureResult;
