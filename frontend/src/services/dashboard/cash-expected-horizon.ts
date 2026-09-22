import { dashboardCashExpectedHorizonPath } from '../../lib/api-config';
import type { DashboardCashExpectedHorizonResponse } from './cash-expected-horizon.types';
import { DashboardCashExpectedHorizonRequestError } from './cash-expected-horizon.types';

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
    isNullableDecimal(value.receivables) &&
    isNullableDecimal(value.payables) &&
    isNullableDecimal(value.result)
  );
}

function isMonth(value: unknown): boolean {
  return isRecord(value) && typeof value.monthKey === 'string' && isMoney(value.expected);
}

export function isCashExpectedHorizon(
  value: unknown,
  expectedHorizon: 3 | 6 | 12,
): value is DashboardCashExpectedHorizonResponse {
  return (
    isRecord(value) &&
    typeof value.today === 'string' &&
    typeof value.startMonth === 'string' &&
    typeof value.endMonth === 'string' &&
    value.horizon === expectedHorizon &&
    typeof value.costCenterCashSplit === 'boolean' &&
    isMoney(value.totals) &&
    Array.isArray(value.months) &&
    value.months.length === expectedHorizon &&
    value.months.every(isMonth)
  );
}

export async function getDashboardCashExpectedHorizon(options: {
  readonly monthKey?: string | null;
  readonly horizon: 3 | 6 | 12;
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
  readonly signal?: AbortSignal;
}): Promise<DashboardCashExpectedHorizonResponse> {
  let response: Response;
  try {
    response = await fetch(
      dashboardCashExpectedHorizonPath({
        monthKey: options.monthKey,
        horizon: options.horizon,
        costCenterId: options.costCenterId,
        categoryId: options.categoryId,
      }),
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: 'application/json' },
        signal: options.signal,
      },
    );
  } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw error;
    }
    throw new DashboardCashExpectedHorizonRequestError(
      'unavailable',
      'Não foi possível carregar a previsão do horizonte.',
    );
  }

  if (response.status === 401) {
    throw new DashboardCashExpectedHorizonRequestError('unauthenticated', 'Sessão expirada.');
  }
  if (response.status === 403) {
    throw new DashboardCashExpectedHorizonRequestError(
      'forbidden',
      'Sem permissão para a previsão do horizonte.',
    );
  }
  if (!response.ok) {
    let message = 'Não foi possível carregar a previsão do horizonte.';
    let requestId: string | undefined;
    try {
      const body = (await response.json()) as ErrorEnvelope;
      if (typeof body.error?.message === 'string' && body.error.message.trim() !== '') {
        message = body.error.message;
      }
      if (typeof body.error?.requestId === 'string') {
        requestId = body.error.requestId;
      }
    } catch {
      // ignore
    }
    throw new DashboardCashExpectedHorizonRequestError('unavailable', message, requestId);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DashboardCashExpectedHorizonRequestError(
      'invalid_response',
      'Resposta inválida da previsão do horizonte.',
    );
  }
  if (!isCashExpectedHorizon(body, options.horizon)) {
    throw new DashboardCashExpectedHorizonRequestError(
      'invalid_response',
      'Resposta inválida da previsão do horizonte.',
    );
  }
  return body;
}
