import type {
  CashRealizedDayCompleteness,
  CashRealizedDayDirection,
  DashboardCashRealizedDayDetailItem,
} from './cash-realized-day-details.types';

export type DashboardCashRealizedMonthDetailsResponse = {
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly direction: CashRealizedDayDirection;
  readonly completeness: CashRealizedDayCompleteness;
  readonly total: string | null;
  readonly returnedSum: string | null;
  readonly difference: string | null;
  readonly hasMore: boolean;
  readonly itemCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly items: readonly DashboardCashRealizedDayDetailItem[];
};

export class DashboardCashRealizedMonthDetailsRequestError extends Error {
  readonly code: 'unauthenticated' | 'forbidden' | 'invalid' | 'unavailable';

  constructor(
    code: DashboardCashRealizedMonthDetailsRequestError['code'],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DashboardCashRealizedMonthDetailsRequestError';
    this.code = code;
  }
}
