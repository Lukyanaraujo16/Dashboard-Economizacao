import { ValidationError } from '../../../shared/errors/application-error.js';

/**
 * Saldo bancário não é filtrável por category/costCenter (08-C2).
 * Rejeita explicitamente se enviados.
 */
export function assertNoCashBalanceAnalyticsFilters(query: unknown): void {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    return;
  }
  const record = query as Record<string, unknown>;
  if ('category' in record) {
    throw new ValidationError('category não é aceito em cash-balance-history.', {
      httpStatus: 400,
      details: [{ field: 'category', issue: 'not_allowed' }],
    });
  }
  if ('costCenter' in record) {
    throw new ValidationError('costCenter não é aceito em cash-balance-history.', {
      httpStatus: 400,
      details: [{ field: 'costCenter', issue: 'not_allowed' }],
    });
  }
}
