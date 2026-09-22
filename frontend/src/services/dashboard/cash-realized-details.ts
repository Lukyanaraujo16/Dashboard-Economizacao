import { dashboardCashRealizedDetailsPath } from '../../lib/api-config';
import type {
  CashRealizedCategoryKind,
  CashRealizedDetailsDirection,
  DashboardCashRealizedDetailsResponse,
} from './cash-realized-details.types';
import { DashboardCashRealizedDetailsRequestError } from './cash-realized-details.types';

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

function isItem(
  value: unknown,
): value is DashboardCashRealizedDetailsResponse['items'][number] {
  return (
    isRecord(value) &&
    typeof value.settlementExternalId === 'string' &&
    typeof value.installmentExternalId === 'string' &&
    (value.installmentKind === 'RECEIVABLE' || value.installmentKind === 'PAYABLE') &&
    typeof value.occurredOn === 'string' &&
    typeof value.netAmount === 'string' &&
    typeof value.attributedAmount === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    (value.partyName === null || typeof value.partyName === 'string') &&
    Array.isArray(value.categoryNames) &&
    value.categoryNames.every((name) => typeof name === 'string') &&
    Array.isArray(value.categoryExternalIds) &&
    value.categoryExternalIds.every((id) => typeof id === 'string') &&
    typeof value.categoryKey === 'string' &&
    typeof value.categoryKind === 'string' &&
    typeof value.categoryName === 'string'
  );
}

function isDetails(value: unknown): value is DashboardCashRealizedDetailsResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.monthKey === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    (value.direction === 'inflows' || value.direction === 'outflows') &&
    typeof value.categoryKey === 'string' &&
    (value.categoryKind === null || typeof value.categoryKind === 'string') &&
    typeof value.available === 'boolean' &&
    isNullableDecimal(value.total) &&
    typeof value.itemCount === 'number' &&
    typeof value.limit === 'number' &&
    typeof value.offset === 'number' &&
    value.items.every(isItem)
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

function toFailure(
  response: Response,
  body: unknown,
): DashboardCashRealizedDetailsRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardCashRealizedDetailsRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardCashRealizedDetailsRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardCashRealizedDetailsRequestError(
    'unavailable',
    'Não foi possível carregar o detalhe da categoria.',
    { httpStatus: response.status, code, requestId },
  );
}

export type GetCashRealizedDetailsParams = {
  readonly monthKey?: string | null;
  readonly costCenterId?: string | null;
  readonly categoryId?: string | null;
  readonly direction: CashRealizedDetailsDirection;
  readonly categoryKey: string;
  readonly categoryKind: CashRealizedCategoryKind;
  readonly limit?: number;
  readonly offset?: number;
};

export async function getDashboardCashRealizedDetails(
  params: GetCashRealizedDetailsParams,
): Promise<DashboardCashRealizedDetailsResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardCashRealizedDetailsPath(params), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardCashRealizedDetailsRequestError(
      'unavailable',
      'Não foi possível carregar o detalhe da categoria.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isDetails(body)) {
    throw new DashboardCashRealizedDetailsRequestError(
      'unavailable',
      'Resposta inválida do detalhe da categoria.',
      { httpStatus: response.status },
    );
  }

  return body;
}
