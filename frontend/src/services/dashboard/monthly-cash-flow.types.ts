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
 * Contrato GET /dashboard/monthly-cash-flow (CASH-3B).
 * `billing` = realized.inflows + expected.receivables. Vencido não entra.
 * Home ainda não consome este cliente.
 */
export type DashboardMonthlyCashFlowResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly costCenterCashSplit: boolean;
  readonly billing: string | null;
  readonly realized: DashboardMonthlyCashFlowMoney;
  readonly expected: DashboardMonthlyCashFlowExpected;
  readonly overdue: DashboardMonthlyCashFlowOverdue;
  readonly coverage: string | null;
  readonly daily: {
    readonly realized: readonly DashboardMonthlyCashFlowDailyRealizedPoint[];
    readonly expected: readonly DashboardMonthlyCashFlowDailyExpectedPoint[];
  };
};

export type DashboardMonthlyCashFlowErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardMonthlyCashFlowRequestError extends Error {
  readonly kind: DashboardMonthlyCashFlowErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardMonthlyCashFlowErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardMonthlyCashFlowRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
