export const CASH_REALIZED_DAY_COMPLETENESS = ['COMPLETE', 'PARTIAL', 'UNAVAILABLE'] as const;

export type CashRealizedDayCompleteness = (typeof CASH_REALIZED_DAY_COMPLETENESS)[number];

export type CashRealizedDayDirection = 'inflows' | 'outflows';

export type DashboardCashRealizedDayDetailItem = {
  readonly occurredOn: string;
  readonly attributedAmount: string;
  readonly partyName: string | null;
  readonly description: string | null;
  readonly displayLabel: string;
  readonly categoryNames: readonly string[];
  readonly costCenterLabel: string | null;
};

export type DashboardCashRealizedDayDetailsResponse = {
  readonly date: string;
  readonly direction: CashRealizedDayDirection;
  readonly completeness: CashRealizedDayCompleteness;
  readonly total: string | null;
  readonly returnedSum: string | null;
  readonly difference: string | null;
  readonly hasMore: boolean;
  readonly itemCount: number;
  readonly limit: number;
  readonly items: readonly DashboardCashRealizedDayDetailItem[];
};

export class DashboardCashRealizedDayDetailsRequestError extends Error {
  readonly code: 'unauthenticated' | 'forbidden' | 'invalid' | 'unavailable';

  constructor(
    code: DashboardCashRealizedDayDetailsRequestError['code'],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DashboardCashRealizedDayDetailsRequestError';
    this.code = code;
  }
}
