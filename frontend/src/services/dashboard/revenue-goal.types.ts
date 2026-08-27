/**
 * Contrato de Meta de Faturamento (F2 / CASH-4B).
 *
 * `actual` = MonthlyCashFlow.billing (caixa, company-level).
 * `achievementRate` já vem × 100, como as demais taxas da Dashboard.
 *
 * Status temporal (F2.0.1):
 * - atual abaixo → IN_PROGRESS
 * - passado abaixo → NOT_ACHIEVED
 * - futuro com meta → PLANNED (não julga atingimento)
 *
 * IA / sugestão de meta: FUTURA — fora deste contrato.
 */

export type RevenueGoalStatus =
  | 'NO_TARGET'
  | 'IN_PROGRESS'
  | 'NOT_ACHIEVED'
  | 'ACHIEVED'
  | 'EXCEEDED'
  | 'PLANNED';

export type RevenueGoalHistoryPoint = {
  readonly monthKey: string;
  /** null = competência sem meta cadastrada. */
  readonly target: string | null;
  readonly actual: string;
  readonly achievementRate: string | null;
  readonly status: RevenueGoalStatus;
};

export type RevenueGoalSnapshot = {
  readonly monthKey: string;
  readonly target: string | null;
  readonly actual: string;
  readonly achievementRate: string | null;
  readonly remaining: string | null;
  readonly exceeded: string | null;
  readonly status: RevenueGoalStatus;
  readonly history: readonly RevenueGoalHistoryPoint[];
};

export type RevenueGoalErrorKind =
  'unauthenticated' | 'forbidden' | 'invalid_target' | 'unavailable' | 'invalid_response';

export class DashboardRevenueGoalRequestError extends Error {
  readonly kind: RevenueGoalErrorKind;
  readonly httpStatus?: number;
  readonly code?: string;
  readonly requestId?: string;

  constructor(
    kind: RevenueGoalErrorKind,
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly code?: string;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'DashboardRevenueGoalRequestError';
    this.kind = kind;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
    this.requestId = options?.requestId;
  }
}
