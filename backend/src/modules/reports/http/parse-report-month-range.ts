import { ValidationError } from '../../../shared/errors/application-error.js';
import {
  isValidMonthKey,
  listInclusiveMonthKeysFromKeys,
  MAX_REPORT_INCLUSIVE_MONTHS,
} from '../../analytics/domain/civil-calendar.js';

export type ReportMonthRange = {
  readonly from: string;
  readonly to: string;
  readonly monthKeys: readonly string[];
};

/**
 * Query obrigatória `from`/`to` = YYYY-MM (F12-A).
 * `from > to` → 400; amplitude > 24 meses civis → 400.
 */
export function parseReportMonthRange(query: unknown): ReportMonthRange {
  const from = readRequiredMonth(query, 'from');
  const to = readRequiredMonth(query, 'to');
  if (from > to) {
    throw new ValidationError('from não pode ser posterior a to.', {
      httpStatus: 400,
      details: [{ field: 'from', issue: 'range_inverted' }],
    });
  }
  const monthKeys = listInclusiveMonthKeysFromKeys(from, to);
  if (monthKeys.length > MAX_REPORT_INCLUSIVE_MONTHS) {
    throw new ValidationError(
      `o intervalo não pode exceder ${MAX_REPORT_INCLUSIVE_MONTHS} meses civis.`,
      {
        httpStatus: 400,
        details: [{ field: 'to', issue: 'range_too_large' }],
      },
    );
  }
  return { from, to, monthKeys };
}

function readRequiredMonth(query: unknown, field: 'from' | 'to'): string {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw missingMonth(field);
  }
  if (!(field in query)) {
    throw missingMonth(field);
  }
  const raw = (query as Record<string, unknown>)[field];
  if (raw === undefined || raw === null || raw === '') {
    throw missingMonth(field);
  }
  if (typeof raw !== 'string') {
    throw invalidMonth(field);
  }
  const trimmed = raw.trim();
  if (!isValidMonthKey(trimmed)) {
    throw invalidMonth(field);
  }
  return trimmed;
}

function missingMonth(field: 'from' | 'to'): ValidationError {
  return new ValidationError(`${field} deve estar no formato YYYY-MM.`, {
    httpStatus: 400,
    details: [{ field, issue: 'required' }],
  });
}

function invalidMonth(field: 'from' | 'to'): ValidationError {
  return new ValidationError(`${field} deve estar no formato YYYY-MM.`, {
    httpStatus: 400,
    details: [{ field, issue: 'invalid_format' }],
  });
}
