export type DashboardExpectedReceivableDetailItem = {
  readonly id: string;
  readonly externalId: string;
  readonly dueDate: string;
  readonly amount: string;
  readonly description: string | null;
  readonly customerName: string | null;
  readonly categoryNames: readonly string[];
};

/** GET /dashboard/receivables/expected-details — lazy detail of KPI A receber. */
export type DashboardExpectedReceivableDetailsResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly available: boolean;
  readonly total: string | null;
  readonly items: readonly DashboardExpectedReceivableDetailItem[];
};

export type DashboardExpectedReceivableDetailsFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardExpectedReceivableDetailsRequestError extends Error {
  readonly kind: DashboardExpectedReceivableDetailsFailureKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardExpectedReceivableDetailsFailureKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options);
    this.name = 'DashboardExpectedReceivableDetailsRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
