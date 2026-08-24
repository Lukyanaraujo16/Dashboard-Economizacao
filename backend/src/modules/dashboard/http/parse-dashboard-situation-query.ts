import { ValidationError } from '../../../shared/errors/application-error.js';
import {
  isDashboardSituation,
  type DashboardSituation,
} from '../../analytics/domain/dashboard-home-filters.js';

/**
 * Query opcional `situation` = settled | open | overdue.
 * Ausente / vazio → null (Todas). Presente inválido → 400.
 * Não aceita `status` nem valores de FinancialInstallmentStatus.
 */
export function parseDashboardSituationQuery(query: unknown): DashboardSituation | null {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    return null;
  }
  if (!('situation' in query)) {
    return null;
  }
  const raw = (query as { situation: unknown }).situation;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw !== 'string' || !isDashboardSituation(raw.trim())) {
    throw new ValidationError('situation deve ser settled, open ou overdue.', {
      httpStatus: 400,
      details: [{ field: 'situation', issue: 'invalid_value' }],
    });
  }
  return raw.trim() as DashboardSituation;
}
