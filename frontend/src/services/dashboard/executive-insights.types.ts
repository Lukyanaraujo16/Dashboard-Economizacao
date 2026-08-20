export type DashboardExecutiveInsightId =
  | 'revenue-expense-total'
  | 'revenue-expense-balance'
  | 'top-revenue-category'
  | 'top-expense-category'
  | 'expense-classification-gap';

export type DashboardExecutiveInsight = {
  readonly id: DashboardExecutiveInsightId;
  readonly body: string;
};

export type DashboardExecutiveInsightsResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly insights: readonly DashboardExecutiveInsight[];
};

export type DashboardExecutiveInsightsErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class DashboardExecutiveInsightsRequestError extends Error {
  readonly kind: DashboardExecutiveInsightsErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardExecutiveInsightsErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardExecutiveInsightsRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
