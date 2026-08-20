import { ValidationError } from '../../../shared/errors/application-error.js';
import { isValidMonthKey } from '../../analytics/domain/civil-calendar.js';

export function parseDashboardMonth(query: unknown): string | null {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    return null;
  }
  if (!('month' in query)) {
    return null;
  }
  const raw = (query as { month: unknown }).month;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw !== 'string') {
    throw invalidMonth();
  }
  const trimmed = raw.trim();
  if (!isValidMonthKey(trimmed)) {
    throw invalidMonth();
  }
  return trimmed;
}

function invalidMonth(): ValidationError {
  return new ValidationError('month deve estar no formato YYYY-MM.', {
    httpStatus: 400,
    details: [{ field: 'month', issue: 'invalid_format' }],
  });
}
