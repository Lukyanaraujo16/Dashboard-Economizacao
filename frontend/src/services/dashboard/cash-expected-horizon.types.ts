export type DashboardCashExpectedHorizonMoney = {
  readonly receivables: string | null;
  readonly payables: string | null;
  readonly result: string | null;
};

export type DashboardCashExpectedHorizonMonth = {
  readonly monthKey: string;
  readonly expected: DashboardCashExpectedHorizonMoney;
};

export type DashboardCashExpectedHorizonResponse = {
  readonly today: string;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly horizon: 3 | 6 | 12;
  readonly costCenterCashSplit: boolean;
  readonly totals: DashboardCashExpectedHorizonMoney;
  readonly months: readonly DashboardCashExpectedHorizonMonth[];
  readonly projection?: DashboardCashBankBalanceProjection;
};

export type DashboardProjectedBankBalanceUnavailableReason =
  | 'FILTERED'
  | 'NOT_CURRENT_MONTH'
  | 'NO_BASE'
  | 'EXPECTED_UNAVAILABLE';

export type DashboardCashBankBalanceProjectionBase = {
  readonly date: string;
  readonly balance: string;
  readonly coverage: 'none' | 'partial' | 'available';
};

export type DashboardCashBankBalanceProjectionMonth = {
  readonly monthKey: string;
  readonly overdueAdjustment: string | null;
  readonly expectedReceivables: string | null;
  readonly expectedPayables: string | null;
  readonly projectedBalance: string | null;
};

export type DashboardCashBankBalanceProjection = {
  readonly available: boolean;
  readonly unavailableReason: DashboardProjectedBankBalanceUnavailableReason | null;
  readonly base: DashboardCashBankBalanceProjectionBase | null;
  readonly months: readonly DashboardCashBankBalanceProjectionMonth[];
};

export type DashboardCashExpectedHorizonRequestErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardCashExpectedHorizonRequestError extends Error {
  readonly code: DashboardCashExpectedHorizonRequestErrorCode;
  readonly requestId?: string;

  constructor(
    code: DashboardCashExpectedHorizonRequestErrorCode,
    message: string,
    requestId?: string,
  ) {
    super(message);
    this.name = 'DashboardCashExpectedHorizonRequestError';
    this.code = code;
    this.requestId = requestId;
  }
}
