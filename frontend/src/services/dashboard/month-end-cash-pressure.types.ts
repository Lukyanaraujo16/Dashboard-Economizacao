export type DashboardMonthEndCashPressureResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly summary: {
    readonly receivable: string;
    readonly payable: string;
    readonly net: string;
  };
};

export type DashboardMonthEndCashPressureErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class DashboardMonthEndCashPressureRequestError extends Error {
  readonly kind: DashboardMonthEndCashPressureErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardMonthEndCashPressureErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardMonthEndCashPressureRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
