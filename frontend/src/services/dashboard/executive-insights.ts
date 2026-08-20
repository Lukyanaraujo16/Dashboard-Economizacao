import { dashboardExecutiveInsightsPath } from '../../lib/api-config';
import type { DashboardExecutiveInsightsResponse } from './executive-insights.types';
import { DashboardExecutiveInsightsRequestError } from './executive-insights.types';

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

function isInsightId(value: unknown): boolean {
  return (
    value === 'revenue-expense-total' ||
    value === 'revenue-expense-balance' ||
    value === 'top-revenue-category' ||
    value === 'top-expense-category' ||
    value === 'expense-classification-gap'
  );
}

function isInsights(value: unknown): value is DashboardExecutiveInsightsResponse {
  if (!isRecord(value) || !Array.isArray(value.insights)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.monthKey === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    value.insights.every(
      (item) => isRecord(item) && isInsightId(item.id) && typeof item.body === 'string',
    )
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

function toFailure(response: Response, body: unknown): DashboardExecutiveInsightsRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardExecutiveInsightsRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardExecutiveInsightsRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardExecutiveInsightsRequestError(
    'unavailable',
    'Não foi possível carregar a leitura executiva.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardExecutiveInsights(
  monthKey?: string | null,
): Promise<DashboardExecutiveInsightsResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardExecutiveInsightsPath(monthKey), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardExecutiveInsightsRequestError(
      'unavailable',
      'Não foi possível carregar a leitura executiva.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isInsights(body)) {
    throw new DashboardExecutiveInsightsRequestError(
      'invalid_response',
      'Não foi possível carregar a leitura executiva.',
      { httpStatus: response.status },
    );
  }

  return body;
}
