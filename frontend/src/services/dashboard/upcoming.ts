import { dashboardUpcomingPath } from '../../lib/api-config';
import type {
  DashboardUpcomingDays,
  DashboardUpcomingItem,
  DashboardUpcomingResponse,
} from './upcoming.types';
import { DashboardUpcomingRequestError } from './upcoming.types';

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

function isUpcomingItem(value: unknown): value is DashboardUpcomingItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.dueDate === 'string' &&
    typeof value.unpaid === 'string' &&
    (value.status === 'OPEN' || value.status === 'OVERDUE' || value.status === 'PARTIALLY_PAID')
  );
}

function isItemList(value: unknown): value is { items: readonly DashboardUpcomingItem[] } {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isUpcomingItem);
}

function isSummary(value: unknown): value is DashboardUpcomingResponse['summary'] {
  return (
    isRecord(value) &&
    typeof value.receivable === 'string' &&
    typeof value.payable === 'string' &&
    typeof value.net === 'string'
  );
}

function isUpcoming(value: unknown): value is DashboardUpcomingResponse {
  if (
    !isRecord(value) ||
    !isItemList(value.receivables) ||
    !isItemList(value.payables) ||
    !isSummary(value.summary)
  ) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    (value.nDays === 7 || value.nDays === 15 || value.nDays === 30) &&
    typeof value.from === 'string' &&
    typeof value.to === 'string'
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

function toFailure(response: Response, body: unknown): DashboardUpcomingRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardUpcomingRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardUpcomingRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardUpcomingRequestError(
    'unavailable',
    'Não foi possível carregar os próximos vencimentos.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardUpcoming(
  days: DashboardUpcomingDays,
): Promise<DashboardUpcomingResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardUpcomingPath(days), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardUpcomingRequestError(
      'unavailable',
      'Não foi possível carregar os próximos vencimentos.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isUpcoming(body)) {
    throw new DashboardUpcomingRequestError(
      'invalid_response',
      'Não foi possível carregar os próximos vencimentos.',
      { httpStatus: response.status },
    );
  }

  return body;
}
