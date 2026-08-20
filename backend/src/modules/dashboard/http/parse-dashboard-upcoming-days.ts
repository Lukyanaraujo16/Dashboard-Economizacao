import { ValidationError } from '../../../shared/errors/application-error.js';
import { DASHBOARD_UPCOMING_ALLOWED_DAYS, type DashboardUpcomingDays } from '../domain/types.js';

const ALLOWED = new Set<string>(DASHBOARD_UPCOMING_ALLOWED_DAYS.map(String));

export function parseDashboardUpcomingDays(query: unknown): DashboardUpcomingDays {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw missingDays();
  }
  if (!('days' in query)) {
    throw missingDays();
  }
  const raw = (query as { days: unknown }).days;
  if (typeof raw !== 'string' || !ALLOWED.has(raw)) {
    throw invalidDays();
  }
  return Number(raw) as DashboardUpcomingDays;
}

function missingDays(): ValidationError {
  return new ValidationError('days é obrigatório.', {
    httpStatus: 400,
    details: [{ field: 'days', issue: 'required' }],
  });
}

function invalidDays(): ValidationError {
  return new ValidationError('days deve ser 7, 15 ou 30.', {
    httpStatus: 400,
    details: [{ field: 'days', issue: 'not_allowed' }],
  });
}
