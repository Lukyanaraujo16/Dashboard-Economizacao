import type { DashboardMonthlyExpenseItem } from '../dashboard/monthly-expenses.types';

export type ReportsExpensesItem = DashboardMonthlyExpenseItem;

export type ReportsExpensesDailyPoint = {
  readonly date: string;
  readonly amount: string;
  readonly received: string | null;
  readonly outstanding: string | null;
};

export type ReportsExpensesPayables = {
  readonly total: string;
  readonly paid: string | null;
  readonly outstanding: string | null;
  readonly overdue: string | null;
  readonly classified: string;
  readonly uncategorized: string;
  readonly imprecise: string;
  readonly coverageRate: string | null;
  readonly items: readonly ReportsExpensesItem[];
};

export type ReportsExpensesMonth = {
  readonly monthKey: string;
  readonly payables: ReportsExpensesPayables & {
    readonly daily: readonly ReportsExpensesDailyPoint[];
  };
};

export type ReportsExpensesResponse = {
  readonly today: string;
  readonly from: string;
  readonly to: string;
  readonly costCenterCashSplit?: boolean;
  readonly payables: ReportsExpensesPayables;
  readonly months: readonly ReportsExpensesMonth[];
};

export type ReportsExpensesErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid'
  | 'unavailable'
  | 'invalid_response';

export class ReportsExpensesRequestError extends Error {
  readonly kind: ReportsExpensesErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: ReportsExpensesErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ReportsExpensesRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
