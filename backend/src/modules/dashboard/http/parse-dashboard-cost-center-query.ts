import { ValidationError } from '../../../shared/errors/application-error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Query opcional `costCenter` = CostCenter.id (uuid).
 * Ausente / vazio → null (comportamento consolidado).
 * Presente inválido → 400.
 */
export function parseDashboardCostCenterQuery(query: unknown): string | null {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    return null;
  }
  if (!('costCenter' in query)) {
    return null;
  }
  const raw = (query as { costCenter: unknown }).costCenter;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw.trim())) {
    throw new ValidationError('costCenter deve ser um UUID válido.', {
      httpStatus: 400,
      details: [{ field: 'costCenter', issue: 'invalid_uuid' }],
    });
  }
  return raw.trim();
}
