import { dashboardExpectedPayableDetailsPath } from '../../lib/api-config';
import type { DashboardExpectedPayableDetailsResponse } from './expected-payable-details.types';
import { DashboardExpectedPayableDetailsRequestError } from './expected-payable-details.types';

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

function isItem(value: unknown): value is DashboardExpectedPayableDetailsResponse['items'][number] {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.externalId === 'string' &&
    typeof value.dueDate === 'string' &&
    typeof value.amount === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    (value.supplierName === null || typeof value.supplierName === 'string') &&
    Array.isArray(value.categoryNames) &&
    value.categoryNames.every((name) => typeof name === 'string')
  );
}

function isDetails(value: unknown): value is DashboardExpectedPayableDetailsResponse {
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
): DashboardExpectedPayableDetailsRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardExpectedPayableDetailsRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardExpectedPayableDetailsRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardExpectedPayableDetailsRequestError(
    'unavailable',
    'Não foi possível carregar os pagamentos previstos.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardExpectedPayableDetails(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): Promise<DashboardExpectedPayableDetailsResponse> {
  let response: Response;

  try {
    response = await fetch(
      dashboardExpectedPayableDetailsPath(monthKey, costCenterId, categoryId),
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
      },
    );
  } catch (cause) {
    throw new DashboardExpectedPayableDetailsRequestError(
      'unavailable',
      'Não foi possível carregar os pagamentos previstos.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isDetails(body)) {
    throw new DashboardExpectedPayableDetailsRequestError(
      'invalid_response',
      'Não foi possível carregar os pagamentos previstos.',
      { httpStatus: response.status },
    );
  }

  return body;
}
