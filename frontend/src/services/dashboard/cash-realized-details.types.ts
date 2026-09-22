export type CashRealizedDetailsDirection = 'inflows' | 'outflows';

export type CashRealizedCategoryKind =
  | 'category'
  | 'other'
  | 'uncategorized'
  | 'imprecise';

export type DashboardCashRealizedDetailItem = {
  readonly settlementExternalId: string;
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly occurredOn: string;
  readonly netAmount: string;
  readonly attributedAmount: string;
  readonly description: string | null;
  readonly partyName: string | null;
  readonly categoryNames: readonly string[];
  readonly categoryExternalIds: readonly string[];
  readonly categoryKey: string;
  readonly categoryKind: CashRealizedCategoryKind;
  readonly categoryName: string;
};

export type DashboardCashRealizedDetailsResponse = {
  readonly today: string;
  readonly monthKey: string;
  readonly from: string;
  readonly to: string;
  readonly direction: CashRealizedDetailsDirection;
  readonly categoryKey: string;
  readonly categoryKind: CashRealizedCategoryKind | null;
  readonly available: boolean;
  readonly total: string | null;
  readonly itemCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly items: readonly DashboardCashRealizedDetailItem[];
};

export type DashboardCashRealizedDetailsFailureKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable';

export class DashboardCashRealizedDetailsRequestError extends Error {
  readonly kind: DashboardCashRealizedDetailsFailureKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardCashRealizedDetailsFailureKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardCashRealizedDetailsRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
