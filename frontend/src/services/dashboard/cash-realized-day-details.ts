import { dashboardCashRealizedDayDetailsPath } from '../../lib/api-config';
import {
  CASH_REALIZED_DAY_COMPLETENESS,
  DashboardCashRealizedDayDetailsRequestError,
  type CashRealizedDayDirection,
  type DashboardCashRealizedDayDetailsResponse,
} from './cash-realized-day-details.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
};

const cache = new Map<string, DashboardCashRealizedDayDetailsResponse>();

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

function parseResponse(body: unknown): DashboardCashRealizedDayDetailsResponse | null {
  if (!isRecord(body)) {
    return null;
  }
  if (typeof body.date !== 'string' || (body.direction !== 'inflows' && body.direction !== 'outflows')) {
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
    !Array.isArray(body.items) ||
    !body.items.every(isItem)
  ) {
    return null;
  }
  return body as DashboardCashRealizedDayDetailsResponse;
}

function cacheKey(input: {
  readonly date: string;
  readonly direction: CashRealizedDayDirection;
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
}): string {
  return [input.date, input.direction, input.costCenterId ?? '', input.categoryId ?? ''].join('|');
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

function toError(response: Response, body: unknown): DashboardCashRealizedDayDetailsRequestError {
  const code =
    isRecord(body) && isRecord((body as ErrorEnvelope).error)
      ? (body as ErrorEnvelope).error?.code
      : undefined;
  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardCashRealizedDayDetailsRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
    );
  }
  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardCashRealizedDayDetailsRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
    );
  }
  if (response.status === 400 || response.status === 422) {
    return new DashboardCashRealizedDayDetailsRequestError(
      'invalid',
      'Não foi possível consultar os lançamentos deste dia.',
    );
  }
  return new DashboardCashRealizedDayDetailsRequestError(
    'unavailable',
    'Não foi possível carregar os lançamentos deste dia.',
  );
}

export async function getDashboardCashRealizedDayDetails(input: {
  readonly date: string;
  readonly direction: CashRealizedDayDirection;
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
  readonly signal?: AbortSignal;
}): Promise<DashboardCashRealizedDayDetailsResponse> {
  const key = cacheKey(input);
  const cached = cache.get(key);
  if (cached) {
    return cached;
  }
  let response: Response;
  try {
    response = await fetch(dashboardCashRealizedDayDetailsPath(input), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: input.signal,
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === 'AbortError') {
      throw cause;
    }
    throw new DashboardCashRealizedDayDetailsRequestError(
      'unavailable',
      'Não foi possível carregar os lançamentos deste dia.',
      { cause },
    );
  }
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toError(response, body);
  }
  const parsed = parseResponse(body);
  if (parsed === null) {
    throw new DashboardCashRealizedDayDetailsRequestError(
      'unavailable',
      'Não foi possível carregar os lançamentos deste dia.',
    );
  }
  cache.set(key, parsed);
  return parsed;
}
