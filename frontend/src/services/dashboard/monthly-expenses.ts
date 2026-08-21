import { dashboardMonthlyExpensesPath } from '../../lib/api-config';
import type {
  DashboardMonthlyExpenseItem,
  DashboardMonthlyExpenseResponse,
} from './monthly-expenses.types';
import { DashboardMonthlyExpenseRequestError } from './monthly-expenses.types';

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

function isItem(value: unknown): value is DashboardMonthlyExpenseItem {
  return (
    isRecord(value) &&
    (value.kind === 'category' ||
      value.kind === 'other' ||
      value.kind === 'uncategorized' ||
      value.kind === 'imprecise') &&
    typeof value.name === 'string' &&
    typeof value.amount === 'string' &&
    isNullableDecimal(value.paid) &&
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

function isMonthlyExpense(value: unknown): value is DashboardMonthlyExpenseResponse {
  if (!isRecord(value) || !isRecord(value.payables)) {
    return false;
  }
  const payables = value.payables;
  const items = payables.items;
  const daily = payables.daily;
  if (!Array.isArray(items) || !Array.isArray(daily)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.monthKey === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    (value.costCenterCashSplit === undefined || typeof value.costCenterCashSplit === 'boolean') &&
    typeof payables.total === 'string' &&
    isNullableDecimal(payables.paid) &&
    isNullableDecimal(payables.outstanding) &&
    isNullableDecimal(payables.overdue) &&
    typeof payables.classified === 'string' &&
    typeof payables.uncategorized === 'string' &&
    typeof payables.imprecise === 'string' &&
    (payables.coverageRate === null || typeof payables.coverageRate === 'string') &&
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

function toFailure(response: Response, body: unknown): DashboardMonthlyExpenseRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardMonthlyExpenseRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardMonthlyExpenseRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardMonthlyExpenseRequestError(
    'unavailable',
    'Não foi possível carregar as despesas do mês.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardMonthlyExpenses(
  monthKey?: string | null,
  costCenterId?: string | null,
): Promise<DashboardMonthlyExpenseResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardMonthlyExpensesPath(monthKey, costCenterId), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardMonthlyExpenseRequestError(
      'unavailable',
      'Não foi possível carregar as despesas do mês.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isMonthlyExpense(body)) {
    throw new DashboardMonthlyExpenseRequestError(
      'invalid_response',
      'Não foi possível carregar as despesas do mês.',
      { httpStatus: response.status },
    );
  }

  return body;
}
