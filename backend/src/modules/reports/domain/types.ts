import type {
  DashboardMonthlyExpenseResponse,
  DashboardMonthlyRevenueCompositionItem,
  DashboardMonthlyRevenueResponse,
} from '../../dashboard/domain/types.js';

/** Totais do intervalo — mesmo shape de §12c sem a série diária. */
export type RevenueReportReceivables = Omit<
  DashboardMonthlyRevenueResponse['receivables'],
  'daily'
>;

export type RevenueReportMonth = {
  readonly monthKey: string;
  readonly receivables: DashboardMonthlyRevenueResponse['receivables'];
};

/** Resposta de `GET /reports/revenue` (F12-A §17.5). `from`/`to` = YYYY-MM. */
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

/** Totais do intervalo — mesmo shape de §12c despesas sem a série diária. */
export type ExpensesReportPayables = Omit<
  DashboardMonthlyExpenseResponse['payables'],
  'daily'
>;

export type ExpensesReportMonth = {
  readonly monthKey: string;
  readonly payables: DashboardMonthlyExpenseResponse['payables'];
};

/** Resposta de `GET /reports/expenses` (F12-D §17.5). `from`/`to` = YYYY-MM. */
export type ExpensesReportResponse = {
  readonly today: string;
  readonly from: string;
  readonly to: string;
  /**
   * false = algum mês do intervalo com filtro de centro (cash split null).
   * Ausente = consolidado em todos os meses.
   */
  readonly costCenterCashSplit?: boolean;
  readonly payables: ExpensesReportPayables;
  readonly months: readonly ExpensesReportMonth[];
};
