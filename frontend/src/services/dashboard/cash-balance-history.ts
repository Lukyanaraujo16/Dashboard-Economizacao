import { dashboardCashBalanceHistoryPath } from '../../lib/api-config';
import type { DashboardCashBalanceHistoryResponse } from './cash-balance-history.types';
import { DashboardCashBalanceHistoryRequestError } from './cash-balance-history.types';

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

function isDailyPoint(value: unknown): boolean {
  return isRecord(value) && typeof value.date === 'string' && typeof value.balance === 'string';
}

function isMonthlyPoint(value: unknown): boolean {
  return (
    isRecord(value) && typeof value.monthKey === 'string' && typeof value.balance === 'string'
  );
}

export function isCashBalanceHistory(value: unknown): value is DashboardCashBalanceHistoryResponse {
  return (
    isRecord(value) &&
    typeof value.today === 'string' &&
    (value.availableFrom === null || typeof value.availableFrom === 'string') &&
    (value.availableTo === null || typeof value.availableTo === 'string') &&
    typeof value.pointCount === 'number' &&
    typeof value.accountsIncluded === 'number' &&
    (value.coverage === 'none' ||
      value.coverage === 'partial' ||
      value.coverage === 'available') &&
    Array.isArray(value.daily) &&
    value.daily.every(isDailyPoint) &&
    Array.isArray(value.monthly) &&
    value.monthly.every(isMonthlyPoint)
  );
}

export async function getDashboardCashBalanceHistory(
  monthKey?: string | null,
): Promise<DashboardCashBalanceHistoryResponse> {
  let response: Response;
  try {
    response = await fetch(dashboardCashBalanceHistoryPath(monthKey), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new DashboardCashBalanceHistoryRequestError(
      'unavailable',
      'Não foi possível carregar o histórico de saldo bancário.',
    );
  }

  if (response.status === 401) {
    throw new DashboardCashBalanceHistoryRequestError('unauthenticated', 'Sessão expirada.');
  }
  if (response.status === 403) {
    throw new DashboardCashBalanceHistoryRequestError(
      'forbidden',
      'Sem permissão para o histórico de saldo bancário.',
    );
  }
  if (!response.ok) {
    let message = 'Não foi possível carregar o histórico de saldo bancário.';
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
    throw new DashboardCashBalanceHistoryRequestError('unavailable', message, requestId);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DashboardCashBalanceHistoryRequestError(
      'invalid_response',
      'Resposta inválida do histórico de saldo bancário.',
    );
  }
  if (!isCashBalanceHistory(body)) {
    throw new DashboardCashBalanceHistoryRequestError(
      'invalid_response',
      'Resposta inválida do histórico de saldo bancário.',
    );
  }
  return body;
}
