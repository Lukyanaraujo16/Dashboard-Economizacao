export const EXPENSE_CEILING_STATUSES = [
  'NO_TARGET',
  'IN_PROGRESS',
  'CONTAINED',
  'ACHIEVED',
  'EXCEEDED',
  'PLANNED',
  'UNAVAILABLE',
] as const;

export type ExpenseCeilingStatus = (typeof EXPENSE_CEILING_STATUSES)[number];

export type ExpenseCeilingSnapshot = {
  readonly monthKey: string;
  readonly ceiling: string | null;
  readonly monthlyExpenses: string | null;
  readonly consumedRate: string | null;
  readonly available: string | null;
  readonly exceeded: string | null;
  readonly status: ExpenseCeilingStatus;
};

export class DashboardExpenseCeilingRequestError extends Error {
  readonly code: 'unauthenticated' | 'forbidden' | 'invalid_ceiling' | 'unavailable';

  constructor(
    code: DashboardExpenseCeilingRequestError['code'],
    message: string,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'DashboardExpenseCeilingRequestError';
    this.code = code;
  }
}
