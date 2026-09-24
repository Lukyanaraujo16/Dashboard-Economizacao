import { ValidationError } from '../../../shared/errors/application-error.js';
import {
  isReportDetailSituation,
  type ReportDetailSituation,
} from '../domain/report-cash-details.js';

/**
 * `situation` obrigatório nos detalhes de Relatórios.
 * Não reutiliza o `situation` legado (settled|open|overdue) dos consolidados.
 */
export function parseReportDetailSituation(query: unknown): ReportDetailSituation {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw missingSituation();
  }
  if (!('situation' in query)) {
    throw missingSituation();
  }
  const raw = (query as { situation: unknown }).situation;
  if (raw === undefined || raw === null || raw === '') {
    throw missingSituation();
  }
  if (typeof raw !== 'string') {
    throw invalidSituation();
  }
  const trimmed = raw.trim();
  if (!isReportDetailSituation(trimmed)) {
    throw invalidSituation();
  }
  return trimmed;
}

function missingSituation(): ValidationError {
  return new ValidationError('situation é obrigatório (REALIZED|EXPECTED|OVERDUE).', {
    httpStatus: 400,
    details: [{ field: 'situation', issue: 'required' }],
  });
}

function invalidSituation(): ValidationError {
  return new ValidationError('situation deve ser REALIZED, EXPECTED ou OVERDUE.', {
    httpStatus: 400,
    details: [{ field: 'situation', issue: 'invalid_value' }],
  });
}
