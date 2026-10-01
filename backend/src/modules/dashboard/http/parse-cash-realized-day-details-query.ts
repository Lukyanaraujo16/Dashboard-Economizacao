import { ValidationError } from '../../../shared/errors/application-error.js';
import { civilDateUtcFromKey } from '../../analytics/domain/civil-calendar.js';
import type { CashRealizedDetailsDirection } from '../../analytics/domain/cash-realized-details.js';
import { clampCashRealizedDayDetailsLimit } from '../../analytics/domain/cash-realized-day-details.js';
import { assertNoTenantIdQuery } from './assert-no-tenant-id-query.js';

export type CashRealizedDayDetailsQuery = {
  readonly date: string;
  readonly direction: CashRealizedDetailsDirection;
  readonly limit?: number;
};

function invalid(field: string, message: string): ValidationError {
  return new ValidationError(message, {
    httpStatus: 400,
    details: [{ field, issue: 'invalid_value' }],
  });
}

/**
 * Dia civil + direção. Tenant vem do servidor.
 * `categoryKey` não é obrigatório — o filtro de categoria da Home é outro parâmetro.
 */
export function parseCashRealizedDayDetailsQuery(query: unknown): CashRealizedDayDetailsQuery {
  assertNoTenantIdQuery(query);
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw invalid('date', 'date deve ser YYYY-MM-DD.');
  }
  const record = query as Record<string, unknown>;
  if (typeof record.date !== 'string' || civilDateUtcFromKey(record.date) === null) {
    throw invalid('date', 'date deve ser YYYY-MM-DD.');
  }
  if (record.direction !== 'inflows' && record.direction !== 'outflows') {
    throw invalid('direction', 'direction deve ser inflows ou outflows.');
  }
  if (record.limit === undefined || record.limit === null || record.limit === '') {
    return { date: record.date.trim(), direction: record.direction };
  }
  const limit = typeof record.limit === 'string' ? Number(record.limit) : record.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1) {
    throw invalid('limit', 'limit deve ser inteiro >= 1.');
  }
  return {
    date: record.date.trim(),
    direction: record.direction,
    limit: clampCashRealizedDayDetailsLimit(limit),
  };
}
