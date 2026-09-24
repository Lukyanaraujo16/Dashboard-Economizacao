import { ValidationError } from '../../../shared/errors/application-error.js';

export function parseReportDetailsLimit(query: unknown): number | undefined {
  return parseNonNegativeIntQuery(query, 'limit');
}

export function parseReportDetailsOffset(query: unknown): number | undefined {
  return parseNonNegativeIntQuery(query, 'offset');
}

function parseNonNegativeIntQuery(query: unknown, field: 'limit' | 'offset'): number | undefined {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    return undefined;
  }
  if (!(field in query)) {
    return undefined;
  }
  const raw = (query as Record<string, unknown>)[field];
  if (raw === undefined || raw === null || raw === '') {
    return undefined;
  }
  if (typeof raw !== 'string' && typeof raw !== 'number') {
    throw invalidPagination(field);
  }
  const text = String(raw).trim();
  if (!/^\d+$/.test(text)) {
    throw invalidPagination(field);
  }
  return Number.parseInt(text, 10);
}

function invalidPagination(field: 'limit' | 'offset'): ValidationError {
  return new ValidationError(`${field} deve ser um inteiro ≥ 0.`, {
    httpStatus: 400,
    details: [{ field, issue: 'invalid_format' }],
  });
}
