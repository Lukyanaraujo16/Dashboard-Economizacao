import { dashboardExpectedReceivableDetailsPath } from '../../lib/api-config';
import type { DashboardExpectedReceivableDetailsResponse } from './expected-receivable-details.types';
import { DashboardExpectedReceivableDetailsRequestError } from './expected-receivable-details.types';

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

function isItem(value: unknown): value is DashboardExpectedReceivableDetailsResponse['items'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.externalId === 'string' &&
    typeof value.dueDate === 'string' &&
    typeof value.amount === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    (value.customerName === null || typeof value.customerName === 'string') &&
    Array.isArray(value.categoryNames) &&
    value.categoryNames.every((name) => typeof name === 'string')
  );
}

function isDetails(value: unknown): value is DashboardExpectedReceivableDetailsResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.monthKey === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.available === 'boolean' &&
    isNullableDecimal(value.total) &&
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
): DashboardExpectedReceivableDetailsRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardExpectedReceivableDetailsRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardExpectedReceivableDetailsRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardExpectedReceivableDetailsRequestError(
    'unavailable',
    'Não foi possível carregar os recebimentos previstos.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardExpectedReceivableDetails(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): Promise<DashboardExpectedReceivableDetailsResponse> {
  let response: Response;

  try {
    response = await fetch(
      dashboardExpectedReceivableDetailsPath(monthKey, costCenterId, categoryId),
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
  } catch (cause) {
    throw new DashboardExpectedReceivableDetailsRequestError(
      'unavailable',
      'Não foi possível carregar os recebimentos previstos.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isDetails(body)) {
    throw new DashboardExpectedReceivableDetailsRequestError(
      'invalid_response',
      'Não foi possível carregar os recebimentos previstos.',
      { httpStatus: response.status },
    );
  }

  return body;
}
