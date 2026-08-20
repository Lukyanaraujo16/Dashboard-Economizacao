import { dashboardRevenueGoalPath } from '../../lib/api-config';
import type { RevenueGoalHistoryPoint, RevenueGoalSnapshot } from './revenue-goal.types';
import { DashboardRevenueGoalRequestError } from './revenue-goal.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly requestId?: string;
  };
};

const STATUSES = [
  'NO_TARGET',
  'IN_PROGRESS',
  'NOT_ACHIEVED',
  'ACHIEVED',
  'EXCEEDED',
  'PLANNED',
] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStatus(value: unknown): value is RevenueGoalSnapshot['status'] {
  return typeof value === 'string' && (STATUSES as readonly string[]).includes(value);
}

function isNullableDecimal(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isHistoryPoint(value: unknown): value is RevenueGoalHistoryPoint {
  return (
    isRecord(value) &&
    typeof value.monthKey === 'string' &&
    typeof value.actual === 'string' &&
    isNullableDecimal(value.target) &&
    isNullableDecimal(value.achievementRate) &&
    isStatus(value.status)
  );
}

function isSnapshot(value: unknown): value is RevenueGoalSnapshot {
  if (!isRecord(value) || !Array.isArray(value.history)) {
    return false;
  }
  return (
    typeof value.monthKey === 'string' &&
    typeof value.actual === 'string' &&
    isNullableDecimal(value.target) &&
    isNullableDecimal(value.achievementRate) &&
    isNullableDecimal(value.remaining) &&
    isNullableDecimal(value.exceeded) &&
    isStatus(value.status) &&
    value.history.every(isHistoryPoint)
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

function toFailure(response: Response, body: unknown): DashboardRevenueGoalRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const options = { httpStatus: response.status, code, requestId };

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardRevenueGoalRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      options,
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardRevenueGoalRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      options,
    );
  }

  if (response.status === 400 || response.status === 422) {
    return new DashboardRevenueGoalRequestError(
      'invalid_target',
      'Informe um valor de meta maior que zero.',
      options,
    );
  }

  return new DashboardRevenueGoalRequestError(
    'unavailable',
    'Não foi possível carregar a meta de faturamento.',
    options,
  );
}

async function request(
  path: string,
  init: RequestInit,
  unavailableMessage: string,
): Promise<RevenueGoalSnapshot> {
  let response: Response;

  try {
    response = await fetch(path, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch (cause) {
    throw new DashboardRevenueGoalRequestError('unavailable', unavailableMessage, { cause });
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isSnapshot(body)) {
    throw new DashboardRevenueGoalRequestError('invalid_response', unavailableMessage, {
      httpStatus: response.status,
    });
  }

  return body;
}

export async function getDashboardRevenueGoal(
  monthKey?: string | null,
): Promise<RevenueGoalSnapshot> {
  return request(
    dashboardRevenueGoalPath(monthKey),
    { method: 'GET' },
    'Não foi possível carregar a meta de faturamento.',
  );
}

/** `target` é decimal-string (ex.: "180000.00"); nunca número em ponto flutuante. */
export async function putDashboardRevenueGoal(input: {
  readonly month: string;
  readonly target: string;
}): Promise<RevenueGoalSnapshot> {
  return request(
    dashboardRevenueGoalPath(),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: input.month, target: input.target }),
    },
    'Não foi possível salvar a meta de faturamento.',
  );
}
