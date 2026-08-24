import type { DashboardCategoryType } from '../../lib/dashboard-category';

export type DashboardCategoryItem = {
  readonly id: string;
  readonly name: string;
  readonly type: DashboardCategoryType;
};

export type DashboardCategoriesResponse = {
  readonly items: readonly DashboardCategoryItem[];
};

export type DashboardCategoriesErrorKind =
  | 'unauthenticated'
  | 'forbidden'
  | 'unavailable'
  | 'invalid_response';

export class DashboardCategoriesRequestError extends Error {
  readonly kind: DashboardCategoriesErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardCategoriesErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardCategoriesRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
