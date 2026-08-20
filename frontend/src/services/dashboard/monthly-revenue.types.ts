export type DashboardMonthlyRevenueKind = 'category' | 'other' | 'uncategorized' | 'imprecise';

export type DashboardMonthlyRevenueItem = {
  readonly kind: DashboardMonthlyRevenueKind;
  readonly name: string;
  readonly amount: string;
  readonly received: string;
  readonly outstanding: string;
  readonly percentage: string;
};

/**
 * Ponto diário por competência: `date` = competenceDate do título.
 * `amount` = Σ total do dia; `received`/`outstanding` são snapshots atuais dos
 * títulos daquela competência — não movimento de caixa daquele dia.
 */
export type DashboardCompetenceDailyPoint = {
  readonly date: string;
  readonly amount: string;
  readonly received: string;
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
    readonly items: readonly DashboardMonthlyRevenueItem[];
    readonly daily: readonly DashboardCompetenceDailyPoint[];
  };
};

export type DashboardMonthlyRevenueErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class DashboardMonthlyRevenueRequestError extends Error {
  readonly kind: DashboardMonthlyRevenueErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardMonthlyRevenueErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardMonthlyRevenueRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
