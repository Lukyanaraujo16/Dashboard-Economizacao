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
