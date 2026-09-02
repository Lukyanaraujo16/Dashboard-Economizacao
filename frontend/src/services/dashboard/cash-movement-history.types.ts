export type DashboardCashMovementHistoryMoney = {
  readonly inflows: string | null;
  readonly outflows: string | null;
  readonly result: string | null;
};

export type DashboardCashMovementHistoryMonth = {
  readonly monthKey: string;
  readonly realized: DashboardCashMovementHistoryMoney;
};

/** Contrato GET /dashboard/cash-movement-history (Correção 08-B). */
export type DashboardCashMovementHistoryResponse = {
  readonly today: string;
  readonly startMonth: string;
  readonly endMonth: string;
  readonly costCenterCashSplit: boolean;
  readonly months: readonly DashboardCashMovementHistoryMonth[];
};

export type DashboardCashMovementHistoryErrorCode =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardCashMovementHistoryRequestError extends Error {
  readonly code: DashboardCashMovementHistoryErrorCode;
  readonly requestId?: string;

  constructor(code: DashboardCashMovementHistoryErrorCode, message: string, requestId?: string) {
    super(message);
    this.name = 'DashboardCashMovementHistoryRequestError';
    this.code = code;
    this.requestId = requestId;
  }
}
