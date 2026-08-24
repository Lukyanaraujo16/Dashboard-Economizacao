import { dashboardCategoriesPath } from '../../lib/api-config';
import type { DashboardCategoryType } from '../../lib/dashboard-category';
import type {
  DashboardCategoryItem,
  DashboardCategoriesResponse,
} from './categories.types';
import { DashboardCategoriesRequestError } from './categories.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly requestId?: string;
  };
};

const CATEGORY_TYPES: readonly DashboardCategoryType[] = ['REVENUE', 'EXPENSE', 'UNKNOWN'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isCategoryType(value: unknown): value is DashboardCategoryType {
  return typeof value === 'string' && (CATEGORY_TYPES as readonly string[]).includes(value);
}

function isCategoryItem(value: unknown): value is DashboardCategoryItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    isCategoryType(value.type)
  );
}

export function isDashboardCategoriesResponse(
  value: unknown,
): value is DashboardCategoriesResponse {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isCategoryItem);
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toFailure(response: Response, body: unknown): DashboardCategoriesRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardCategoriesRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardCategoriesRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardCategoriesRequestError(
    'unavailable',
    'Não foi possível carregar as categorias.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardCategories(): Promise<DashboardCategoriesResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardCategoriesPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardCategoriesRequestError(
      'unavailable',
      'Não foi possível carregar as categorias.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isDashboardCategoriesResponse(body)) {
    throw new DashboardCategoriesRequestError(
      'invalid_response',
      'Não foi possível carregar as categorias.',
      { httpStatus: response.status },
    );
  }

  return body;
}
