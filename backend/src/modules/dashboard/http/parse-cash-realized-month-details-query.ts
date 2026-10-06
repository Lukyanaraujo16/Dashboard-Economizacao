import { ValidationError } from '../../../shared/errors/application-error.js';
import { isValidMonthKey } from '../../analytics/domain/civil-calendar.js';
import type { CashRealizedDetailsDirection } from '../../analytics/domain/cash-realized-details.js';
import {
  clampCashRealizedMonthDetailsLimit,
  clampCashRealizedMonthDetailsOffset,
} from '../../analytics/domain/cash-realized-day-details.js';
import { assertNoTenantIdQuery } from './assert-no-tenant-id-query.js';

export type CashRealizedMonthDetailsQuery = {
  readonly monthKey: string;
  readonly direction: CashRealizedDetailsDirection;
  readonly limit?: number;
  readonly offset?: number;
};

function invalid(field: string, message: string): ValidationError {
  return new ValidationError(message, {
    httpStatus: 400,
    details: [{ field, issue: 'invalid_value' }],
  });
}

function readOptionalInt(raw: unknown, field: 'limit' | 'offset'): number | undefined {
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  const value = typeof raw === 'string' ? Number(raw) : raw;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw invalid(field, `${field} deve ser inteiro >= 0.`);
  }
  if (field === 'limit' && value < 1) {
    throw invalid(field, 'limit deve ser inteiro >= 1.');
  }
  return value;
}

/**
 * Mês civil + direção. Tenant vem da sessão.
 * Não aceita tenantId na query.
 */
export function parseCashRealizedMonthDetailsQuery(query: unknown): CashRealizedMonthDetailsQuery {
  assertNoTenantIdQuery(query);
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw invalid('month', 'month deve ser YYYY-MM.');
  }
  const record = query as Record<string, unknown>;
  if (typeof record.month !== 'string' || !isValidMonthKey(record.month.trim())) {
    throw invalid('month', 'month deve ser YYYY-MM.');
  }
  if (record.direction !== 'inflows' && record.direction !== 'outflows') {
    throw invalid('direction', 'direction deve ser inflows ou outflows.');
  }
  const limit = readOptionalInt(record.limit, 'limit');
  const offset = readOptionalInt(record.offset, 'offset');
  return {
    monthKey: record.month.trim(),
    direction: record.direction,
    ...(limit === undefined ? {} : { limit: clampCashRealizedMonthDetailsLimit(limit) }),
    ...(offset === undefined ? {} : { offset: clampCashRealizedMonthDetailsOffset(offset) }),
  };
}
