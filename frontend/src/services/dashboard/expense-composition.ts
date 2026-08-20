import { dashboardExpenseCompositionPath } from '../../lib/api-config';
import type {
  DashboardExpenseCompositionItem,
  DashboardExpenseCompositionResponse,
} from './expense-composition.types';
import { DashboardExpenseCompositionRequestError } from './expense-composition.types';

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

function isItem(value: unknown): value is DashboardExpenseCompositionItem {
  return (
    isRecord(value) &&
    (value.kind === 'category' ||
      value.kind === 'other' ||
      value.kind === 'uncategorized' ||
      value.kind === 'imprecise') &&
    typeof value.name === 'string' &&
    typeof value.amount === 'string' &&
    typeof value.percentage === 'string'
  );
}

function isComposition(value: unknown): value is DashboardExpenseCompositionResponse {
  if (!isRecord(value) || !isRecord(value.payables)) {
    return false;
  }
  const payables = value.payables;
  const items = payables.items;
  if (!Array.isArray(items)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof payables.total === 'string' &&
    typeof payables.classified === 'string' &&
    typeof payables.uncategorized === 'string' &&
    typeof payables.imprecise === 'string' &&
    (payables.coverageRate === null || typeof payables.coverageRate === 'string') &&
    items.every(isItem)
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

function toFailure(response: Response, body: unknown): DashboardExpenseCompositionRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardExpenseCompositionRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardExpenseCompositionRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardExpenseCompositionRequestError(
    'unavailable',
    'Não foi possível carregar a composição das despesas.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardExpenseComposition(): Promise<DashboardExpenseCompositionResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardExpenseCompositionPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardExpenseCompositionRequestError(
      'unavailable',
      'Não foi possível carregar a composição das despesas.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isComposition(body)) {
    throw new DashboardExpenseCompositionRequestError(
      'invalid_response',
      'Não foi possível carregar a composição das despesas.',
      { httpStatus: response.status },
    );
  }

  return body;
}
