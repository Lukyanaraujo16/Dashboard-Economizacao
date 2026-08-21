export type DashboardCostCenterItem = {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly active: boolean;
};

export type DashboardCostCentersResponse = {
  readonly items: readonly DashboardCostCenterItem[];
};

export type DashboardCostCentersErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardCostCentersRequestError extends Error {
  readonly kind: DashboardCostCentersErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardCostCentersErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardCostCentersRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
