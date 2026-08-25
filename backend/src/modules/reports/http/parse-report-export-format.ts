import { ValidationError } from '../../../shared/errors/application-error.js';

export const REPORT_EXPORT_FORMATS = ['pdf', 'xlsx'] as const;

export type ReportExportFormat = (typeof REPORT_EXPORT_FORMATS)[number];

export type ReportResponseFormat = 'json' | ReportExportFormat;

/**
 * Query opcional `format` = pdf | xlsx | json.
 * Ausente / vazio → json (visualização). Presente inválido → 400.
 */
export function parseReportExportFormat(query: unknown): ReportResponseFormat {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    return 'json';
  }
  if (!('format' in query)) {
    return 'json';
  }
  const raw = (query as { format: unknown }).format;
  if (raw === undefined || raw === null || raw === '') {
    return 'json';
  }
  if (typeof raw !== 'string') {
    throw invalidFormat();
  }
  const trimmed = raw.trim().toLowerCase();
  if (trimmed === 'json') {
    return 'json';
  }
  if (trimmed === 'pdf' || trimmed === 'xlsx') {
    return trimmed;
  }
  throw invalidFormat();
}

function invalidFormat(): ValidationError {
  return new ValidationError('format deve ser pdf ou xlsx.', {
    httpStatus: 400,
    details: [{ field: 'format', issue: 'invalid_value' }],
  });
}
