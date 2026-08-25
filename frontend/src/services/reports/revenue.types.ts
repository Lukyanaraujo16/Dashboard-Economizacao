import type { DashboardMonthlyRevenueItem } from '../dashboard/monthly-revenue.types';

export type ReportsRevenueItem = DashboardMonthlyRevenueItem;

export type ReportsRevenueDailyPoint = {
  readonly date: string;
  readonly amount: string;
  readonly received: string | null;
  readonly outstanding: string | null;
};

export type ReportsRevenueReceivables = {
  readonly total: string;
  readonly received: string | null;
  readonly outstanding: string | null;
  readonly overdue: string | null;
  readonly classified: string;
  readonly uncategorized: string;
  readonly imprecise: string;
  readonly coverageRate: string | null;
  readonly items: readonly ReportsRevenueItem[];
};

export type ReportsRevenueMonth = {
  readonly monthKey: string;
  readonly receivables: ReportsRevenueReceivables & {
    readonly daily: readonly ReportsRevenueDailyPoint[];
  };
};

export type ReportsRevenueResponse = {
  readonly today: string;
  readonly from: string;
  readonly to: string;
  readonly costCenterCashSplit?: boolean;
  readonly receivables: ReportsRevenueReceivables;
  readonly months: readonly ReportsRevenueMonth[];
};

export type ReportsRevenueErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid'
  | 'unavailable'
  | 'invalid_response';

export class ReportsRevenueRequestError extends Error {
  readonly kind: ReportsRevenueErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: ReportsRevenueErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ReportsRevenueRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
