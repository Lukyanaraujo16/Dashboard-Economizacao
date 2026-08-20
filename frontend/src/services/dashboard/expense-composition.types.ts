export type DashboardExpenseCompositionKind = 'category' | 'other' | 'uncategorized' | 'imprecise';

export type DashboardExpenseCompositionItem = {
  readonly kind: DashboardExpenseCompositionKind;
  readonly name: string;
  readonly amount: string;
  readonly percentage: string;
};

export type DashboardExpenseCompositionResponse = {
  readonly today: string;
  readonly payables: {
    readonly total: string;
    readonly classified: string;
    readonly uncategorized: string;
    readonly imprecise: string;
    readonly coverageRate: string | null;
    readonly items: readonly DashboardExpenseCompositionItem[];
  };
};

export type DashboardExpenseCompositionErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class DashboardExpenseCompositionRequestError extends Error {
  readonly kind: DashboardExpenseCompositionErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardExpenseCompositionErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardExpenseCompositionRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
