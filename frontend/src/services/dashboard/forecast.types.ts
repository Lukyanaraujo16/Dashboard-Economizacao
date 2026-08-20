export type DashboardForecastBucket = {
  readonly key: string;
  readonly inflows: string;
  readonly outflows: string;
  readonly net: string;
};

export type DashboardCashFlowForecastResponse = {
  readonly today: string;
  readonly from: string;
  readonly to: string;
  readonly horizonDays: number;
  readonly buckets: readonly DashboardForecastBucket[];
};

export type DashboardForecastErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class DashboardForecastRequestError extends Error {
  readonly kind: DashboardForecastErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardForecastErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardForecastRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
