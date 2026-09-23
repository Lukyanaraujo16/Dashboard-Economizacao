import type { DashboardExpectedReceivableDetailItem } from './expected-receivable-details.types';

export type DashboardInstallmentStockSituation = 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING';

export type DashboardReceivableStockDetailItem = DashboardExpectedReceivableDetailItem & {
  readonly situation: DashboardInstallmentStockSituation;
  readonly overdueDays: number | null;
};

/** GET /dashboard/receivables/stock-details — pendências do mês selecionado. */
export type DashboardReceivableStockDetailsResponse = {
  readonly today: string;
  readonly available: boolean;
  readonly total: string | null;
  readonly overdue: string | null;
  readonly dueToday: string | null;
  readonly upcoming: string | null;
  readonly items: readonly DashboardReceivableStockDetailItem[];
};

export type DashboardReceivableStockDetailsFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardReceivableStockDetailsRequestError extends Error {
  readonly kind: DashboardReceivableStockDetailsFailureKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardReceivableStockDetailsFailureKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options);
    this.name = 'DashboardReceivableStockDetailsRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
