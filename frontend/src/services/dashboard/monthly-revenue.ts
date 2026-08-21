import { dashboardMonthlyRevenuePath } from '../../lib/api-config';
import type {
  DashboardMonthlyRevenueItem,
  DashboardMonthlyRevenueResponse,
} from './monthly-revenue.types';
import { DashboardMonthlyRevenueRequestError } from './monthly-revenue.types';

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

function isItem(value: unknown): value is DashboardMonthlyRevenueItem {
  return (
    isRecord(value) &&
    (value.kind === 'category' ||
      value.kind === 'other' ||
      value.kind === 'uncategorized' ||
      value.kind === 'imprecise') &&
    typeof value.name === 'string' &&
    typeof value.amount === 'string' &&
    isNullableDecimal(value.received) &&
    isNullableDecimal(value.outstanding) &&
    typeof value.percentage === 'string'
  );
}

function isDailyPoint(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    typeof value.amount === 'string' &&
    isNullableDecimal(value.received) &&
    isNullableDecimal(value.outstanding)
  );
}

function isMonthlyRevenue(value: unknown): value is DashboardMonthlyRevenueResponse {
  if (!isRecord(value) || !isRecord(value.receivables)) {
    return false;
  }
  const receivables = value.receivables;
  const items = receivables.items;
  const daily = receivables.daily;
  if (!Array.isArray(items) || !Array.isArray(daily)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.monthKey === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    (value.costCenterCashSplit === undefined || typeof value.costCenterCashSplit === 'boolean') &&
    typeof receivables.total === 'string' &&
    isNullableDecimal(receivables.received) &&
    isNullableDecimal(receivables.outstanding) &&
    isNullableDecimal(receivables.overdue) &&
    typeof receivables.classified === 'string' &&
    typeof receivables.uncategorized === 'string' &&
    typeof receivables.imprecise === 'string' &&
    (receivables.coverageRate === null || typeof receivables.coverageRate === 'string') &&
    items.every(isItem) &&
    daily.every(isDailyPoint)
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

function toFailure(response: Response, body: unknown): DashboardMonthlyRevenueRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardMonthlyRevenueRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardMonthlyRevenueRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardMonthlyRevenueRequestError(
    'unavailable',
    'Não foi possível carregar as receitas do mês.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardMonthlyRevenue(
  monthKey?: string | null,
  costCenterId?: string | null,
): Promise<DashboardMonthlyRevenueResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardMonthlyRevenuePath(monthKey, costCenterId), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardMonthlyRevenueRequestError(
      'unavailable',
      'Não foi possível carregar as receitas do mês.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isMonthlyRevenue(body)) {
    throw new DashboardMonthlyRevenueRequestError(
      'invalid_response',
      'Não foi possível carregar as receitas do mês.',
      { httpStatus: response.status },
    );
  }

  return body;
}
