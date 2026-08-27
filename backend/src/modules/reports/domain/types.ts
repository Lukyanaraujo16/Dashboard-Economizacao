import type {
  DashboardMonthlyExpenseCompositionItem,
  DashboardMonthlyRevenueCompositionItem,
} from '../../dashboard/domain/types.js';

/** Ponto diário de caixa no relatório (data = occurredOn / dueDate conforme série). */
export type ReportsCashDailyPoint = {
  readonly date: string;
  readonly amount: string;
  readonly received: string | null;
  readonly outstanding: string | null;
};

/** Totais do intervalo — entradas de caixa (CASH-6). */
export type RevenueReportReceivables = {
  /** Faturamento = realized.inflows + expected.receivables. null = unavailable. */
  readonly total: string | null;
  /** Entradas realizadas. */
  readonly received: string | null;
  /** A receber no prazo. */
  readonly outstanding: string | null;
  /** Vencido ofMonth no intervalo. */
  readonly overdue: string | null;
  readonly classified: string;
  readonly uncategorized: string;
  readonly imprecise: string;
  readonly coverageRate: string | null;
  readonly items: readonly DashboardMonthlyRevenueCompositionItem[];
};

export type RevenueReportMonth = {
  readonly monthKey: string;
  readonly receivables: RevenueReportReceivables & {
    readonly daily: readonly ReportsCashDailyPoint[];
  };
};

/** Resposta de `GET /reports/revenue` (CASH-6). `from`/`to` = YYYY-MM. */
export type RevenueReportResponse = {
  readonly today: string;
  readonly from: string;
  readonly to: string;
  /**
   * false = algum mês do intervalo com filtro de centro (cash split null).
   * Ausente = consolidado em todos os meses.
   */
  readonly costCenterCashSplit?: boolean;
  readonly receivables: RevenueReportReceivables;
  readonly months: readonly RevenueReportMonth[];
};

export type { DashboardMonthlyRevenueCompositionItem };

/** Totais do intervalo — saídas de caixa (CASH-6). */
export type ExpensesReportPayables = {
  /** Despesas = realized.outflows + expected.payables. null = unavailable. */
  readonly total: string | null;
  /** Saídas realizadas. */
  readonly paid: string | null;
  readonly outstanding: string | null;
  readonly overdue: string | null;
  readonly classified: string;
  readonly uncategorized: string;
  readonly imprecise: string;
  readonly coverageRate: string | null;
  readonly items: readonly DashboardMonthlyExpenseCompositionItem[];
};

export type ExpensesReportMonth = {
  readonly monthKey: string;
  readonly payables: ExpensesReportPayables & {
    readonly daily: readonly ReportsCashDailyPoint[];
  };
};

/** Resposta de `GET /reports/expenses` (CASH-6). `from`/`to` = YYYY-MM. */
export type ExpensesReportResponse = {
  readonly today: string;
  readonly from: string;
  readonly to: string;
  readonly costCenterCashSplit?: boolean;
  readonly payables: ExpensesReportPayables;
  readonly months: readonly ExpensesReportMonth[];
};
