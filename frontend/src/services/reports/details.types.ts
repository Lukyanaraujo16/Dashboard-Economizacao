export type ReportCashDetailSituation = 'REALIZED' | 'EXPECTED' | 'OVERDUE';

export type ReportCashDetailsUnavailableReason = 'COST_CENTER_SPLIT';

export type ReportCashDetailItem = {
  readonly date: string;
  readonly description: string | null;
  readonly partyName: string | null;
  readonly categoryNames: readonly string[];
  readonly costCenterNames: readonly string[];
  readonly situation: ReportCashDetailSituation;
  readonly amount: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly installmentExternalId: string;
  readonly settlementExternalId?: string;
};

export type ReportCashDetailsResponse = {
  readonly today: string;
  readonly from: string;
  readonly to: string;
  readonly situation: ReportCashDetailSituation;
  readonly available: boolean;
  readonly unavailableReason: ReportCashDetailsUnavailableReason | null;
  readonly totalAmount: string | null;
  readonly itemCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly items: readonly ReportCashDetailItem[];
};

export type ReportsCashDetailsErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'invalid'
  | 'unavailable'
  | 'invalid_response';

export class ReportsCashDetailsRequestError extends Error {
  readonly kind: ReportsCashDetailsErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: ReportsCashDetailsErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ReportsCashDetailsRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}

export type GetReportCashDetailsOptions = {
  readonly from: string;
  readonly to: string;
  readonly situation: ReportCashDetailSituation;
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
  readonly limit?: number;
  readonly offset?: number;
};
