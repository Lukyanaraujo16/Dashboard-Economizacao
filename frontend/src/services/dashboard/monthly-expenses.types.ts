export type DashboardMonthlyExpenseKind = 'category' | 'other' | 'uncategorized' | 'imprecise';

export type DashboardMonthlyExpenseItem = {
  readonly kind: DashboardMonthlyExpenseKind;
  readonly name: string;
  readonly amount: string;
  /** null com filtro por centro (cash split indisponível). */
  readonly paid: string | null;
  /** null com filtro por centro (cash split indisponível). */
  readonly outstanding: string | null;
  readonly percentage: string;
};

/**
 * Ponto diário por competência: `date` = competenceDate do título.
 * `amount` = Σ total do dia; `received` (pago) e `outstanding` (a pagar) são
 * snapshots atuais dos títulos daquela competência — não caixa daquele dia.
 * Com filtro por centro, received/outstanding podem ser null.
 */
export type DashboardCompetenceDailyPoint = {
  readonly date: string;
  readonly amount: string;
  readonly received: string | null;
  readonly outstanding: string | null;
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
    readonly items: readonly DashboardMonthlyExpenseItem[];
    readonly daily: readonly DashboardCompetenceDailyPoint[];
  };
};

export type DashboardMonthlyExpenseErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class DashboardMonthlyExpenseRequestError extends Error {
  readonly kind: DashboardMonthlyExpenseErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardMonthlyExpenseErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardMonthlyExpenseRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
