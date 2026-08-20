export type {
  DashboardExpenseCompositionItem as DashboardReceivableCompositionItem,
  DashboardExpenseCompositionKind as DashboardReceivableCompositionKind,
} from './expense-composition.types';
import type { DashboardExpenseCompositionItem } from './expense-composition.types';

export type DashboardReceivableCompositionResponse = {
  readonly today: string;
  readonly receivables: {
    readonly total: string;
    readonly classified: string;
    readonly uncategorized: string;
    readonly imprecise: string;
    readonly coverageRate: string | null;
    readonly items: readonly DashboardExpenseCompositionItem[];
  };
};

export type DashboardReceivableCompositionErrorKind =
  'unauthenticated' | 'forbidden' | 'unavailable' | 'invalid_response';

export class DashboardReceivableCompositionRequestError extends Error {
  readonly kind: DashboardReceivableCompositionErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: DashboardReceivableCompositionErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardReceivableCompositionRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
