import { dashboardCashFlowForecastPath } from '../../lib/api-config';
import type { DashboardCashFlowForecastResponse, DashboardForecastBucket } from './forecast.types';
import { DashboardForecastRequestError } from './forecast.types';

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

function isBucket(value: unknown): value is DashboardForecastBucket {
  return (
    isRecord(value) &&
    typeof value.key === 'string' &&
    typeof value.inflows === 'string' &&
    typeof value.outflows === 'string' &&
    typeof value.net === 'string'
  );
}

function isForecast(value: unknown): value is DashboardCashFlowForecastResponse {
  return (
    isRecord(value) &&
    typeof value.today === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.horizonDays === 'number' &&
    Array.isArray(value.buckets) &&
    value.buckets.every(isBucket)
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

function toFailure(response: Response, body: unknown): DashboardForecastRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardForecastRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardForecastRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardForecastRequestError(
    'unavailable',
    'Não foi possível carregar o fluxo previsto.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardCashFlowForecast(
  costCenterId?: string | null,
): Promise<DashboardCashFlowForecastResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardCashFlowForecastPath(costCenterId), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardForecastRequestError(
      'unavailable',
      'Não foi possível carregar o fluxo previsto.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isForecast(body)) {
    throw new DashboardForecastRequestError(
      'invalid_response',
      'Não foi possível carregar o fluxo previsto.',
      { httpStatus: response.status },
    );
  }

  return body;
}
