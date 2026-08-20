export const DASHBOARD_UPCOMING_DAY_OPTIONS = [7, 15, 30] as const;

export type DashboardUpcomingDays = (typeof DASHBOARD_UPCOMING_DAY_OPTIONS)[number];

export const DEFAULT_DASHBOARD_UPCOMING_DAYS: DashboardUpcomingDays = 15;

export type DashboardUpcomingInstallmentStatus = 'OPEN' | 'OVERDUE' | 'PARTIALLY_PAID';

export type DashboardUpcomingItem = {
  readonly id: string;
  readonly dueDate: string;
  readonly unpaid: string;
  readonly status: DashboardUpcomingInstallmentStatus;
};

export type DashboardUpcomingSummary = {
  readonly receivable: string;
  readonly payable: string;
  readonly net: string;
};

export type DashboardUpcomingResponse = {
  readonly today: string;
  readonly nDays: DashboardUpcomingDays;
  readonly from: string;
  readonly to: string;
  readonly summary: DashboardUpcomingSummary;
  readonly receivables: { readonly items: readonly DashboardUpcomingItem[] };
  readonly payables: { readonly items: readonly DashboardUpcomingItem[] };
};

export type DashboardUpcomingErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class DashboardUpcomingRequestError extends Error {
  readonly kind: DashboardUpcomingErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardUpcomingErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardUpcomingRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
