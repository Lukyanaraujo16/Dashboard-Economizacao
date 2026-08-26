import { dashboardMonthlyCashFlowPath } from '../../lib/api-config';
import type { DashboardMonthlyCashFlowResponse } from './monthly-cash-flow.types';
import { DashboardMonthlyCashFlowRequestError } from './monthly-cash-flow.types';

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

function isMoney(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableDecimal(value.inflows) &&
    isNullableDecimal(value.outflows) &&
    isNullableDecimal(value.result)
  );
}

function isExpected(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableDecimal(value.receivables) &&
    isNullableDecimal(value.payables) &&
    isNullableDecimal(value.result)
  );
}

function isOverdue(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNullableDecimal(value.receivables) &&
    isNullableDecimal(value.payables) &&
    isRecord(value.ofMonth) &&
    isNullableDecimal(value.ofMonth.receivables) &&
    isNullableDecimal(value.ofMonth.payables)
  );
}

function isRealizedPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    isNullableDecimal(value.inflows) &&
    isNullableDecimal(value.outflows) &&
    isNullableDecimal(value.result)
  );
}

function isExpectedPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    isNullableDecimal(value.receivables) &&
    isNullableDecimal(value.payables) &&
    isNullableDecimal(value.result)
  );
}

function isMonthlyCashFlow(value: unknown): value is DashboardMonthlyCashFlowResponse {
  if (!isRecord(value) || !isRecord(value.daily)) {
    return false;
  }
  const daily = value.daily;
  if (!Array.isArray(daily.realized) || !Array.isArray(daily.expected)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.monthKey === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    typeof value.costCenterCashSplit === 'boolean' &&
    isNullableDecimal(value.billing) &&
    isMoney(value.realized) &&
    isExpected(value.expected) &&
    isOverdue(value.overdue) &&
    isNullableDecimal(value.coverage) &&
    daily.realized.every(isRealizedPoint) &&
    daily.expected.every(isExpectedPoint)
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

function toFailure(response: Response, body: unknown): DashboardMonthlyCashFlowRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardMonthlyCashFlowRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardMonthlyCashFlowRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardMonthlyCashFlowRequestError(
    'unavailable',
    'Não foi possível carregar o fluxo de caixa do mês.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardMonthlyCashFlow(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): Promise<DashboardMonthlyCashFlowResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardMonthlyCashFlowPath(monthKey, costCenterId, categoryId), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardMonthlyCashFlowRequestError(
      'unavailable',
      'Não foi possível carregar o fluxo de caixa do mês.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isMonthlyCashFlow(body)) {
    throw new DashboardMonthlyCashFlowRequestError(
      'invalid_response',
      'Não foi possível carregar o fluxo de caixa do mês.',
      { httpStatus: response.status },
    );
  }

  return body;
}
