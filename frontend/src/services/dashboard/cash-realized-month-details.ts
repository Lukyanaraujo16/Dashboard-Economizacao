import { dashboardCashRealizedMonthDetailsPath } from '../../lib/api-config';
import { CASH_REALIZED_DAY_COMPLETENESS } from './cash-realized-day-details.types';
import type { CashRealizedDayDirection } from './cash-realized-day-details.types';
import {
  DashboardCashRealizedMonthDetailsRequestError,
  type DashboardCashRealizedMonthDetailsResponse,
} from './cash-realized-month-details.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
  };
};

const cache = new Map<string, DashboardCashRealizedMonthDetailsResponse>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableDecimal(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isItem(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.occurredOn === 'string' &&
    typeof value.attributedAmount === 'string' &&
    (value.partyName === null || typeof value.partyName === 'string') &&
    (value.description === null || typeof value.description === 'string') &&
    typeof value.displayLabel === 'string' &&
    Array.isArray(value.categoryNames) &&
    value.categoryNames.every((name) => typeof name === 'string') &&
    (value.costCenterLabel === null || typeof value.costCenterLabel === 'string')
  );
}

function parseResponse(body: unknown): DashboardCashRealizedMonthDetailsResponse | null {
  if (!isRecord(body)) {
    return null;
  }
  if (
    typeof body.monthKey !== 'string' ||
    typeof body.from !== 'string' ||
    typeof body.to !== 'string' ||
    (body.direction !== 'inflows' && body.direction !== 'outflows')
  ) {
    return null;
  }
  if (
    typeof body.completeness !== 'string' ||
    !(CASH_REALIZED_DAY_COMPLETENESS as readonly string[]).includes(body.completeness)
  ) {
    return null;
  }
  if (
    !isNullableDecimal(body.total) ||
    !isNullableDecimal(body.returnedSum) ||
    !isNullableDecimal(body.difference) ||
    typeof body.hasMore !== 'boolean' ||
    typeof body.itemCount !== 'number' ||
    typeof body.limit !== 'number' ||
    typeof body.offset !== 'number' ||
    !Array.isArray(body.items) ||
    !body.items.every(isItem)
  ) {
    return null;
  }
  return body as DashboardCashRealizedMonthDetailsResponse;
}

function cacheKey(input: {
  readonly monthKey: string;
  readonly direction: CashRealizedDayDirection;
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
  readonly offset?: number;
}): string {
  return [
    input.monthKey,
    input.direction,
    input.costCenterId ?? '',
    input.categoryId ?? '',
    String(input.offset ?? 0),
  ].join('|');
}

async function readJsonBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

function toError(response: Response, body: unknown): DashboardCashRealizedMonthDetailsRequestError {
  const code =
    isRecord(body) && isRecord((body as ErrorEnvelope).error)
      ? (body as ErrorEnvelope).error?.code
      : undefined;
  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardCashRealizedMonthDetailsRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
    );
  }
  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardCashRealizedMonthDetailsRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
    );
  }
  if (response.status === 400 || response.status === 422) {
    return new DashboardCashRealizedMonthDetailsRequestError(
      'invalid',
      'Não foi possível consultar os lançamentos deste mês.',
    );
  }
  return new DashboardCashRealizedMonthDetailsRequestError(
    'unavailable',
    'Não foi possível carregar os lançamentos deste mês.',
  );
}

export async function getDashboardCashRealizedMonthDetails(input: {
  readonly monthKey: string;
  readonly direction: CashRealizedDayDirection;
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
  readonly offset?: number;
  readonly signal?: AbortSignal;
}): Promise<DashboardCashRealizedMonthDetailsResponse> {
  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  let response: Response;
  try {
    response = await fetch(dashboardCashRealizedMonthDetailsPath(input), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: input.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }
    throw new DashboardCashRealizedMonthDetailsRequestError(
      'unavailable',
      'Não foi possível carregar os lançamentos deste mês.',
      { cause },
    );
  }
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toError(response, body);
  }
  const parsed = parseResponse(body);
  if (parsed === null) {
    throw new DashboardCashRealizedMonthDetailsRequestError(
      'unavailable',
      'Não foi possível carregar os lançamentos deste mês.',
    );
  }
  cache.set(key, parsed);
  return parsed;
}
