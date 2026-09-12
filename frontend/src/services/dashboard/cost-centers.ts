import { dashboardCostCentersPath } from '../../lib/api-config';
import type {
  DashboardCostCenterItem,
  DashboardCostCentersResponse,
} from './cost-centers.types';
import { DashboardCostCentersRequestError } from './cost-centers.types';

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

function isCostCenterItem(value: unknown): value is DashboardCostCenterItem {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    (value.code === null || typeof value.code === 'string') &&
    typeof value.active === 'boolean'
  );
}

export function isDashboardCostCentersResponse(
  value: unknown,
): value is DashboardCostCentersResponse {
  return isRecord(value) && Array.isArray(value.items) && value.items.every(isCostCenterItem);
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

function toFailure(response: Response, body: unknown): DashboardCostCentersRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardCostCentersRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardCostCentersRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardCostCentersRequestError(
    'unavailable',
    'Não foi possível carregar os centros de custo.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardCostCenters(options?: {
  readonly monthKey?: string | null;
  readonly fromKey?: string | null;
  readonly toKey?: string | null;
}): Promise<DashboardCostCentersResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardCostCentersPath(options), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardCostCentersRequestError(
      'unavailable',
      'Não foi possível carregar os centros de custo.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isDashboardCostCentersResponse(body)) {
    throw new DashboardCostCentersRequestError(
      'invalid_response',
      'Não foi possível carregar os centros de custo.',
      { httpStatus: response.status },
    );
  }

  return body;
}
