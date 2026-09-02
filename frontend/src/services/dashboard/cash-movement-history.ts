import { dashboardCashMovementHistoryPath } from '../../lib/api-config';
import type { DashboardCashMovementHistoryResponse } from './cash-movement-history.types';
import { DashboardCashMovementHistoryRequestError } from './cash-movement-history.types';

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

function isMonth(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.monthKey === 'string' &&
    isMoney(value.realized)
  );
}

export function isCashMovementHistory(value: unknown): value is DashboardCashMovementHistoryResponse {
  return (
    isRecord(value) &&
    typeof value.today === 'string' &&
    typeof value.startMonth === 'string' &&
    typeof value.endMonth === 'string' &&
    typeof value.costCenterCashSplit === 'boolean' &&
    Array.isArray(value.months) &&
    value.months.length === 12 &&
    value.months.every(isMonth)
  );
}

export async function getDashboardCashMovementHistory(
  monthKey?: string | null,
  costCenterId?: string | null,
  categoryId?: string | null,
): Promise<DashboardCashMovementHistoryResponse> {
  let response: Response;
  try {
    response = await fetch(dashboardCashMovementHistoryPath(monthKey, costCenterId, categoryId), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch {
    throw new DashboardCashMovementHistoryRequestError(
      'unavailable',
      'Não foi possível carregar o histórico de movimentação.',
    );
  }

  if (response.status === 401) {
    throw new DashboardCashMovementHistoryRequestError('unauthenticated', 'Sessão expirada.');
  }
  if (response.status === 403) {
    throw new DashboardCashMovementHistoryRequestError(
      'forbidden',
      'Sem permissão para o histórico de movimentação.',
    );
  }
  if (!response.ok) {
    let message = 'Não foi possível carregar o histórico de movimentação.';
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
    throw new DashboardCashMovementHistoryRequestError('unavailable', message, requestId);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    throw new DashboardCashMovementHistoryRequestError(
      'invalid_response',
      'Resposta inválida do histórico de movimentação.',
    );
  }
  if (!isCashMovementHistory(body)) {
    throw new DashboardCashMovementHistoryRequestError(
      'invalid_response',
      'Resposta inválida do histórico de movimentação.',
    );
  }
  return body;
}
