import { dashboardMonthEndCashPressurePath } from '../../lib/api-config';
import type { DashboardMonthEndCashPressureResponse } from './month-end-cash-pressure.types';
import { DashboardMonthEndCashPressureRequestError } from './month-end-cash-pressure.types';

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

function isMonthEnd(value: unknown): value is DashboardMonthEndCashPressureResponse {
  if (!isRecord(value) || !isRecord(value.summary)) {
    return false;
  }
  const summary = value.summary;
  return (
    typeof value.today === 'string' &&
    typeof value.monthKey === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof summary.receivable === 'string' &&
    typeof summary.payable === 'string' &&
    typeof summary.net === 'string'
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

function toFailure(response: Response, body: unknown): DashboardMonthEndCashPressureRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardMonthEndCashPressureRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardMonthEndCashPressureRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardMonthEndCashPressureRequestError(
    'unavailable',
    'Não foi possível carregar a agenda até o fim do mês.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardMonthEndCashPressure(
  costCenterId?: string | null,
  categoryId?: string | null,
): Promise<DashboardMonthEndCashPressureResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardMonthEndCashPressurePath(costCenterId, categoryId), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardMonthEndCashPressureRequestError(
      'unavailable',
      'Não foi possível carregar a agenda até o fim do mês.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isMonthEnd(body)) {
    throw new DashboardMonthEndCashPressureRequestError(
      'invalid_response',
      'Não foi possível carregar a agenda até o fim do mês.',
      { httpStatus: response.status },
    );
  }

  return body;
}
