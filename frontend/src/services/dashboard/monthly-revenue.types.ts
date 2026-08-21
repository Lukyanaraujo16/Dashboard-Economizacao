export type DashboardMonthlyRevenueKind = 'category' | 'other' | 'uncategorized' | 'imprecise';

export type DashboardMonthlyRevenueItem = {
  readonly kind: DashboardMonthlyRevenueKind;
  readonly name: string;
  readonly amount: string;
  /** null com filtro por centro (cash split indisponível). */
  readonly received: string | null;
  /** null com filtro por centro (cash split indisponível). */
  readonly outstanding: string | null;
  readonly percentage: string;
};

/**
 * Ponto diário por competência: `date` = competenceDate do título.
 * `amount` = Σ total do dia; `received`/`outstanding` são snapshots atuais dos
 * títulos daquela competência — não movimento de caixa daquele dia.
 * Com filtro por centro, received/outstanding podem ser null.
 */
export type DashboardCompetenceDailyPoint = {
  readonly date: string;
  readonly amount: string;
  readonly received: string | null;
  readonly outstanding: string | null;
};

export type DashboardMonthlyRevenueResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  /**
   * false = filtro por centro (cash split null).
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
