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

export type ReportCashDetailSituation = 'REALIZED' | 'EXPECTED' | 'OVERDUE';

export type ReportCashDetailItemResponse = {
  readonly date: string;
  readonly description: string | null;
  readonly partyName: string | null;
  readonly categoryNames: readonly string[];
  readonly costCenterNames: readonly string[];
  readonly situation: ReportCashDetailSituation;
  readonly amount: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly installmentExternalId: string;
  readonly settlementExternalId?: string;
};

/** Resposta de `GET /reports/revenue|expenses/details`. */
export type ReportCashDetailsResponse = {
  readonly today: string;
  readonly from: string;
  readonly to: string;
  readonly situation: ReportCashDetailSituation;
  readonly available: boolean;
  readonly unavailableReason: 'COST_CENTER_SPLIT' | null;
  /** Soma do universo filtrado (não da página). null = split indisponível. */
  readonly totalAmount: string | null;
  readonly itemCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly items: readonly ReportCashDetailItemResponse[];
};
