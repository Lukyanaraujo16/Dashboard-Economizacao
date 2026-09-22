import { ValidationError } from '../../../shared/errors/application-error.js';
import type {
  CashRealizedCategoryKind,
  CashRealizedDetailsDirection,
} from '../../analytics/domain/cash-realized-details.js';

const CATEGORY_KINDS = ['category', 'other', 'uncategorized', 'imprecise'] as const;

export function parseCashRealizedDetailsDirection(query: unknown): CashRealizedDetailsDirection {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw missingDirection();
  }
  if (!('direction' in query)) {
    throw missingDirection();
  }
  const raw = (query as { direction: unknown }).direction;
  if (raw === undefined || raw === null || raw === '') {
    throw missingDirection();
  }
  if (typeof raw !== 'string') {
    throw invalidDirection();
  }
  const trimmed = raw.trim();
  if (trimmed !== 'inflows' && trimmed !== 'outflows') {
    throw invalidDirection();
  }
  return trimmed;
}

export function parseCashRealizedDetailsCategoryKey(query: unknown): string {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    throw missingCategoryKey();
  }
  if (!('categoryKey' in query)) {
    throw missingCategoryKey();
  }
  const raw = (query as { categoryKey: unknown }).categoryKey;
  if (raw === undefined || raw === null || raw === '') {
    throw missingCategoryKey();
  }
  if (typeof raw !== 'string') {
    throw invalidCategoryKey();
  }
  const trimmed = raw.trim();
  if (trimmed === '') {
    throw invalidCategoryKey();
  }
  return trimmed;
}

/**
 * Opcional na query: quando presente, desambigua kind+key
 * (ex.: nominal externalId="uncategorized" vs bucket uncategorized).
 */
export function parseCashRealizedDetailsCategoryKind(
  query: unknown,
): CashRealizedCategoryKind | null {
  if (query === null || typeof query !== 'object' || Array.isArray(query)) {
    return null;
  }
  if (!('categoryKind' in query)) {
    return null;
  }
  const raw = (query as { categoryKind: unknown }).categoryKind;
  if (raw === undefined || raw === null || raw === '') {
    return null;
  }
  if (typeof raw !== 'string') {
    throw invalidCategoryKind();
  }
  const trimmed = raw.trim();
  if (!(CATEGORY_KINDS as readonly string[]).includes(trimmed)) {
    throw invalidCategoryKind();
  }
  return trimmed as CashRealizedCategoryKind;
}

export function parseCashRealizedDetailsLimit(query: unknown): number | undefined {
  return parseNonNegativeIntQuery(query, 'limit');
}

export function parseCashRealizedDetailsOffset(query: unknown): number | undefined {
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

function missingDirection(): ValidationError {
  return new ValidationError('direction é obrigatório (inflows|outflows).', {
    httpStatus: 400,
    details: [{ field: 'direction', issue: 'required' }],
  });
}

function invalidDirection(): ValidationError {
  return new ValidationError('direction deve ser inflows ou outflows.', {
    httpStatus: 400,
    details: [{ field: 'direction', issue: 'invalid_value' }],
  });
}

function missingCategoryKey(): ValidationError {
  return new ValidationError('categoryKey é obrigatório.', {
    httpStatus: 400,
    details: [{ field: 'categoryKey', issue: 'required' }],
  });
}

function invalidCategoryKey(): ValidationError {
  return new ValidationError('categoryKey inválido.', {
    httpStatus: 400,
    details: [{ field: 'categoryKey', issue: 'invalid_value' }],
  });
}

function invalidCategoryKind(): ValidationError {
  return new ValidationError(
    'categoryKind deve ser category, other, uncategorized ou imprecise.',
    {
      httpStatus: 400,
      details: [{ field: 'categoryKind', issue: 'invalid_value' }],
    },
  );
}

function invalidPagination(field: 'limit' | 'offset'): ValidationError {
  return new ValidationError(`${field} deve ser um inteiro ≥ 0.`, {
    httpStatus: 400,
    details: [{ field, issue: 'invalid_format' }],
  });
}
