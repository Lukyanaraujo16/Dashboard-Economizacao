import { dashboardPayableStockDetailsPath } from '../../lib/api-config';
import type { DashboardPayableStockDetailsResponse } from './payable-stock-details.types';
import { DashboardPayableStockDetailsRequestError } from './payable-stock-details.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly requestId?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableDecimal(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isSituation(value: unknown): value is 'OVERDUE' | 'DUE_TODAY' | 'UPCOMING' {
  return value === 'OVERDUE' || value === 'DUE_TODAY' || value === 'UPCOMING';
}

function isItem(value: unknown): value is DashboardPayableStockDetailsResponse['items'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.externalId === 'string' &&
    typeof value.dueDate === 'string' &&
    typeof value.amount === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    (value.supplierName === null || typeof value.supplierName === 'string') &&
    Array.isArray(value.categoryNames) &&
    value.categoryNames.every((name) => typeof name === 'string') &&
    isSituation(value.situation) &&
    (value.overdueDays === null || typeof value.overdueDays === 'number')
  );
}

function isDetails(value: unknown): value is DashboardPayableStockDetailsResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.available === 'boolean' &&
    isNullableDecimal(value.total) &&
    isNullableDecimal(value.overdue) &&
    isNullableDecimal(value.dueToday) &&
    isNullableDecimal(value.upcoming) &&
    value.items.every(isItem)
  );
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

function toFailure(
  response: Response,
  body: unknown,
): DashboardPayableStockDetailsRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardPayableStockDetailsRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardPayableStockDetailsRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardPayableStockDetailsRequestError(
    'unavailable',
    'Não foi possível carregar o estoque a pagar.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardPayableStockDetails(
  costCenterId?: string | null,
  categoryId?: string | null,
): Promise<DashboardPayableStockDetailsResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardPayableStockDetailsPath(costCenterId, categoryId), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardPayableStockDetailsRequestError(
      'unavailable',
      'Não foi possível carregar o estoque a pagar.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isDetails(body)) {
    throw new DashboardPayableStockDetailsRequestError(
      'invalid_response',
      'Não foi possível carregar o estoque a pagar.',
      { httpStatus: response.status },
    );
  }

  return body;
}
