import { ValidationError } from '../../../shared/errors/application-error.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Query opcional `category` = FinancialCategory.id (uuid).
 * Ausente / vazio → null (Todas). Presente malformado → 400.
 * Existência no tenant é resolvida depois (404).
 */
export function parseDashboardCategoryQuery(query: unknown): string | null {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    return null;
  }
  if (!('category' in query)) {
    return null;
  }
  const raw = (query as { category: unknown }).category;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw !== 'string' || !UUID_PATTERN.test(raw.trim())) {
    throw new ValidationError('category deve ser um UUID válido.', {
      httpStatus: 400,
      details: [{ field: 'category', issue: 'invalid_uuid' }],
    });
  }
  return raw.trim();
}
