export type DashboardExpectedPayableDetailItem = {
  readonly id: string;
  readonly externalId: string;
  readonly dueDate: string;
  readonly amount: string;
  readonly description: string | null;
  readonly supplierName: string | null;
  readonly categoryNames: readonly string[];
};

/** GET /dashboard/payables/expected-details — lazy detail of KPI Contas a pagar. */
export type DashboardExpectedPayableDetailsResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly available: boolean;
  readonly total: string | null;
  readonly items: readonly DashboardExpectedPayableDetailItem[];
};

export type DashboardExpectedPayableDetailsFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardExpectedPayableDetailsRequestError extends Error {
  readonly kind: DashboardExpectedPayableDetailsFailureKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardExpectedPayableDetailsFailureKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options);
    this.name = 'DashboardExpectedPayableDetailsRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
