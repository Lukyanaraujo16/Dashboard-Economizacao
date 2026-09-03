/** Contrato GET /dashboard/cash-balance-history (Correção 08-C2). */

export type DashboardCashBalanceCoverage = 'none' | 'partial' | 'available';

export type DashboardCashBalanceDailyPoint = {
  readonly date: string;
  readonly balance: string;
};

export type DashboardCashBalanceMonthlyPoint = {
  readonly monthKey: string;
  readonly balance: string;
};

export type DashboardCashBalanceHistoryResponse = {
  readonly today: string;
  readonly availableFrom: string | null;
  readonly availableTo: string | null;
  readonly pointCount: number;
  readonly accountsIncluded: number;
  readonly coverage: DashboardCashBalanceCoverage;
  readonly daily: readonly DashboardCashBalanceDailyPoint[];
  readonly monthly: readonly DashboardCashBalanceMonthlyPoint[];
};

export type DashboardCashBalanceHistoryErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardCashBalanceHistoryRequestError extends Error {
  readonly code: DashboardCashBalanceHistoryErrorCode;
  readonly requestId?: string;

  constructor(code: DashboardCashBalanceHistoryErrorCode, message: string, requestId?: string) {
    super(message);
    this.name = 'DashboardCashBalanceHistoryRequestError';
    this.code = code;
    this.requestId = requestId;
  }
}
