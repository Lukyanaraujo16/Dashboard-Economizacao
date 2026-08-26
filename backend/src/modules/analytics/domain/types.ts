import type { FinancialInstallmentStatus, Prisma } from '../../../generated/prisma/client.js';
import type {
  DashboardCategoryFilter,
  DashboardSituation,
} from './dashboard-home-filters.js';

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
  /** Filtro opcional por CostCenter.id do tenant. */
  readonly costCenterId?: string;
  /** F11-B: categoria nomeada precisa (já resolvida no tenant). */
  readonly categoryFilter?: DashboardCategoryFilter;
};

export type GetMonthlyCompetenceRevenueInput = GetFinancialStockSnapshotInput & {
  /** Mês civil de competência (`YYYY-MM`). Ausente = mês corrente. */
  readonly monthKey?: string;
  /** F11-B: settled | open | overdue. Ausente = todas. */
  readonly situation?: DashboardSituation;
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
  /** null quando filtrado por centro (sem split pago/em aberto seguro). */
  readonly received: Prisma.Decimal | null;
  /** null quando filtrado por centro (sem split pago/em aberto seguro). */
  readonly outstanding: Prisma.Decimal | null;
};

export type MonthlyCompetenceRevenueResult = {
  readonly tenantId: string;
  readonly today: Date;
  readonly monthKey: string;
  readonly from: Date;
  readonly to: Date;
  /**
   * false = filtro por centro: totais via allocation.amount;
   * received/outstanding/overdue null (PARCIAL).
   */
  readonly costCenterCashSplit: boolean;
  readonly total: Prisma.Decimal;
  readonly received: Prisma.Decimal | null;
  readonly outstanding: Prisma.Decimal | null;
  readonly overdue: Prisma.Decimal | null;
  readonly classified: Prisma.Decimal;
  readonly uncategorized: Prisma.Decimal;
  readonly imprecise: Prisma.Decimal;
  readonly coverageRate: Prisma.Decimal | null;
  readonly items: readonly {
    readonly kind: 'category' | 'other' | 'uncategorized' | 'imprecise';
    /** Id interno de categoria / bucket — não vai para o HTTP (§12c). */
    readonly key: string;
    readonly name: string;
    readonly amount: Prisma.Decimal;
    readonly received: Prisma.Decimal | null;
    readonly outstanding: Prisma.Decimal | null;
    readonly percentage: Prisma.Decimal;
  }[];
  /** Dia = competenceDate; valor = Σ total (ou Σ allocation.amount). Não é caixa. */
  readonly daily: readonly MonthlyCompetenceDailyPoint[];
};

export type MonthlyCompetenceExpenseResult = MonthlyCompetenceRevenueResult;

export type ExecutiveInsightsResult =
  import('./monthly-executive-insights.js').MonthlyExecutiveInsightsResult;

export type MonthEndCashPressureResult =
  import('./month-end-cash-pressure.js').MonthEndCashPressureResult;

export type MonthlyCashFlowDailyRealizedPoint = {
  readonly date: Date;
  readonly inflows: Prisma.Decimal | null;
  readonly outflows: Prisma.Decimal | null;
  readonly result: Prisma.Decimal | null;
};

export type MonthlyCashFlowDailyExpectedPoint = {
  readonly date: Date;
  readonly receivables: Prisma.Decimal | null;
  readonly payables: Prisma.Decimal | null;
  readonly result: Prisma.Decimal | null;
};

export type MonthlyCashFlowTotals = {
  readonly inflows: Prisma.Decimal | null;
  readonly outflows: Prisma.Decimal | null;
  readonly result: Prisma.Decimal | null;
};

export type MonthlyCashFlowExpected = {
  readonly receivables: Prisma.Decimal | null;
  readonly payables: Prisma.Decimal | null;
  readonly result: Prisma.Decimal | null;
};

export type MonthlyCashFlowOverdue = {
  readonly receivables: Prisma.Decimal | null;
  readonly payables: Prisma.Decimal | null;
  readonly ofMonth: {
    readonly receivables: Prisma.Decimal | null;
    readonly payables: Prisma.Decimal | null;
  };
};

/** Read model de caixa CASH-3A. Sem HTTP. Fluxo = ledger; estoque = unpaid atual. */
export type MonthlyCashFlow = {
  readonly tenantId: string;
  readonly today: Date;
  readonly monthKey: string;
  readonly from: Date;
  readonly to: Date;
  readonly costCenterCashSplit: boolean;
  readonly realized: MonthlyCashFlowTotals;
  readonly expected: MonthlyCashFlowExpected;
  readonly overdue: MonthlyCashFlowOverdue;
  /**
   * Mês corrente: inflows / (inflows + expected.receivables).
   * Passado/futuro ou denominador 0 ou split unavailable → null.
   * Não é Faturamento. Faturamento = monthlyBilling(flow) =
   * realized.inflows + expected.receivables (vencido fora).
   */
  readonly coverage: Prisma.Decimal | null;
  readonly daily: {
    readonly realized: readonly MonthlyCashFlowDailyRealizedPoint[];
    readonly expected: readonly MonthlyCashFlowDailyExpectedPoint[];
  };
};

export type GetMonthlyCashFlowInput = GetFinancialStockSnapshotInput & {
  /** Mês civil (`YYYY-MM`). Ausente = mês corrente em America/Sao_Paulo. */
  readonly monthKey?: string;
};
