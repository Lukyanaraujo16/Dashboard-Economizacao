import { dashboardOverviewPath } from '../../lib/api-config';
import type { DashboardOverviewResponse } from './overview.types';
import { DashboardOverviewRequestError } from './overview.types';

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

function isMoneySnapshot(value: unknown): value is DashboardOverviewResponse['receivables'] {
  return (
    isRecord(value) &&
    typeof value.open === 'string' &&
    typeof value.overdue === 'string' &&
    typeof value.upcoming === 'string'
  );
}

function isDashboardOverview(value: unknown): value is DashboardOverviewResponse {
  if (!isRecord(value) || !isRecord(value.delinquency) || !isRecord(value.integration)) {
    return false;
  }
  const rate = value.delinquency.rate;
  const status = value.integration.status;
  return (
    typeof value.today === 'string' &&
    isMoneySnapshot(value.receivables) &&
    isMoneySnapshot(value.payables) &&
    typeof value.delinquency.overdueUnpaid === 'string' &&
    typeof value.delinquency.openUnpaid === 'string' &&
    (rate === null || typeof rate === 'string') &&
    (status === 'CONNECTED' || status === 'DISCONNECTED' || status === 'ERROR') &&
    (value.integration.lastSuccessfulSyncAt === null ||
      typeof value.integration.lastSuccessfulSyncAt === 'string') &&
    (value.integration.lastErrorCode === null ||
      typeof value.integration.lastErrorCode === 'string')
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

function toFailure(response: Response, body: unknown): DashboardOverviewRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardOverviewRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardOverviewRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardOverviewRequestError(
    'unavailable',
    'Não foi possível carregar os indicadores da sua empresa.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardOverview(): Promise<DashboardOverviewResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardOverviewPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardOverviewRequestError(
      'unavailable',
      'Não foi possível carregar os indicadores da sua empresa.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isDashboardOverview(body)) {
    throw new DashboardOverviewRequestError(
      'invalid_response',
      'Não foi possível carregar os indicadores da sua empresa.',
      { httpStatus: response.status },
    );
  }

  return body;
}
