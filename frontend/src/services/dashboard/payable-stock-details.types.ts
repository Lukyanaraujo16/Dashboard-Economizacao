import type { DashboardExpectedPayableDetailItem } from './expected-payable-details.types';

export type DashboardInstallmentStockSituation = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';

export type DashboardPayableStockDetailItem = DashboardExpectedPayableDetailItem & {
  readonly situation: DashboardInstallmentStockSituation;
  readonly overdueDays: number | null;
};

/** GET /dashboard/payables/stock-details — pendências do mês selecionado. */
export type DashboardPayableStockDetailsResponse = {
  readonly today: string;
  readonly available: boolean;
  readonly total: string | null;
  readonly overdue: string | null;
  readonly dueToday: string | null;
  readonly upcoming: string | null;
  readonly items: readonly DashboardPayableStockDetailItem[];
};

export type DashboardPayableStockDetailsFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardPayableStockDetailsRequestError extends Error {
  readonly kind: DashboardPayableStockDetailsFailureKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardPayableStockDetailsFailureKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options);
    this.name = 'DashboardPayableStockDetailsRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
