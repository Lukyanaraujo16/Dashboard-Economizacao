import { reportsRevenuePath } from '../../lib/api-config';
import type { DashboardSituation } from '../../lib/dashboard-situation';
import type {
  ReportsRevenueDailyPoint,
  ReportsRevenueItem,
  ReportsRevenueMonth,
  ReportsRevenueReceivables,
  ReportsRevenueResponse,
} from './revenue.types';
import { ReportsRevenueRequestError } from './revenue.types';

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

function isItem(value: unknown): value is ReportsRevenueItem {
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

function isDailyPoint(value: unknown): value is ReportsRevenueDailyPoint {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    typeof value.amount === 'string' &&
    isNullableDecimal(value.received) &&
    isNullableDecimal(value.outstanding)
  );
}

function isIntervalReceivables(value: unknown): value is ReportsRevenueReceivables {
  if (!isRecord(value)) {
    return false;
  }
  const items = value.items;
  if (!Array.isArray(items) || value.daily !== undefined) {
    return false;
  }
  return (
    typeof value.total === 'string' &&
    isNullableDecimal(value.received) &&
    isNullableDecimal(value.outstanding) &&
    isNullableDecimal(value.overdue) &&
    typeof value.classified === 'string' &&
    typeof value.uncategorized === 'string' &&
    typeof value.imprecise === 'string' &&
    (value.coverageRate === null || typeof value.coverageRate === 'string') &&
    items.every(isItem)
  );
}

function isMonthReceivables(
  value: unknown,
): value is ReportsRevenueMonth['receivables'] {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.daily)) {
    return false;
  }
  return (
    typeof value.total === 'string' &&
    isNullableDecimal(value.received) &&
    isNullableDecimal(value.outstanding) &&
    isNullableDecimal(value.overdue) &&
    typeof value.classified === 'string' &&
    typeof value.uncategorized === 'string' &&
    typeof value.imprecise === 'string' &&
    (value.coverageRate === null || typeof value.coverageRate === 'string') &&
    value.items.every(isItem) &&
    value.daily.every(isDailyPoint)
  );
}

function isMonth(value: unknown): value is ReportsRevenueMonth {
  return (
    isRecord(value) &&
    typeof value.monthKey === 'string' &&
    isMonthReceivables(value.receivables)
  );
}

function isRevenueReport(value: unknown): value is ReportsRevenueResponse {
  if (!isRecord(value) || !Array.isArray(value.months)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    (value.costCenterCashSplit === undefined || typeof value.costCenterCashSplit === 'boolean') &&
    isIntervalReceivables(value.receivables) &&
    value.months.every(isMonth)
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

function toFailure(response: Response, body: unknown): ReportsRevenueRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const message = envelope?.error?.message;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new ReportsRevenueRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new ReportsRevenueRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar este relatório.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 400 || response.status === 404) {
    return new ReportsRevenueRequestError(
      'invalid',
      message ?? 'Não foi possível gerar o relatório com os filtros informados.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new ReportsRevenueRequestError(
    'unavailable',
    'Não foi possível carregar o relatório de receita.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getReportsRevenue(options: {
  readonly from: string;
  readonly to: string;
  readonly costCenterId?: string | null;
  readonly situation?: DashboardSituation | null;
  readonly categoryId?: string | null;
}): Promise<ReportsRevenueResponse> {
  let response: Response;

  try {
    response = await fetch(reportsRevenuePath(options), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new ReportsRevenueRequestError(
      'unavailable',
      'Não foi possível carregar o relatório de receita.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isRevenueReport(body)) {
    throw new ReportsRevenueRequestError(
      'invalid_response',
      'Não foi possível carregar o relatório de receita.',
      { httpStatus: response.status },
    );
  }

  return body;
}
