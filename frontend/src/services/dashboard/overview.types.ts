export type DashboardIntegrationStatus = 'CONNECTED' | 'DISCONNECTED' | 'ERROR';

export type DashboardMoneySnapshot = {
  readonly open: string;
  readonly overdue: string;
  readonly upcoming: string;
};

export type DashboardDelinquency = {
  readonly overdueUnpaid: string;
  readonly openUnpaid: string;
  readonly rate: string | null;
};

export type DashboardOverviewIntegration = {
  readonly status: DashboardIntegrationStatus;
  readonly lastSuccessfulSyncAt: string | null;
  readonly lastErrorCode: string | null;
};

export type DashboardOverviewResponse = {
  readonly today: string;
  readonly receivables: DashboardMoneySnapshot;
  readonly payables: DashboardMoneySnapshot;
  readonly delinquency: DashboardDelinquency;
  readonly integration: DashboardOverviewIntegration;
};

export type DashboardOverviewErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class DashboardOverviewRequestError extends Error {
  readonly kind: DashboardOverviewErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardOverviewErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardOverviewRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
