import { dashboardReceivableStockDetailsPath } from '../../lib/api-config';
import type { DashboardReceivableStockDetailsResponse } from './receivable-stock-details.types';
import { DashboardReceivableStockDetailsRequestError } from './receivable-stock-details.types';

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

function isItem(
  value: unknown,
): value is DashboardReceivableStockDetailsResponse['items'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.externalId === 'string' &&
    typeof value.dueDate === 'string' &&
    typeof value.amount === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    (value.customerName === null || typeof value.customerName === 'string') &&
    Array.isArray(value.categoryNames) &&
    value.categoryNames.every((name) => typeof name === 'string') &&
    isSituation(value.situation) &&
    (value.overdueDays === null || typeof value.overdueDays === 'number')
  );
}

function isDetails(value: unknown): value is DashboardReceivableStockDetailsResponse {
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
): DashboardReceivableStockDetailsRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardReceivableStockDetailsRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardReceivableStockDetailsRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardReceivableStockDetailsRequestError(
    'unavailable',
    'Não foi possível carregar o estoque a receber.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardReceivableStockDetails(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): Promise<DashboardReceivableStockDetailsResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardReceivableStockDetailsPath(monthKey, costCenterId, categoryId), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardReceivableStockDetailsRequestError(
      'unavailable',
      'Não foi possível carregar o estoque a receber.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isDetails(body)) {
    throw new DashboardReceivableStockDetailsRequestError(
      'invalid_response',
      'Não foi possível carregar o estoque a receber.',
      { httpStatus: response.status },
    );
  }

  return body;
}
