import { dashboardReceivableCompositionPath } from '../../lib/api-config';
import type { DashboardExpenseCompositionItem } from './expense-composition.types';
import type { DashboardReceivableCompositionResponse } from './receivable-composition.types';
import { DashboardReceivableCompositionRequestError } from './receivable-composition.types';

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

function isComposition(value: unknown): value is DashboardReceivableCompositionResponse {
  if (!isRecord(value) || !isRecord(value.receivables)) {
    return false;
  }
  const receivables = value.receivables;
  const items = receivables.items;
  if (!Array.isArray(items)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof receivables.total === 'string' &&
    typeof receivables.classified === 'string' &&
    typeof receivables.uncategorized === 'string' &&
    typeof receivables.imprecise === 'string' &&
    (receivables.coverageRate === null || typeof receivables.coverageRate === 'string') &&
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

function toFailure(response: Response, body: unknown): DashboardReceivableCompositionRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardReceivableCompositionRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardReceivableCompositionRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new DashboardReceivableCompositionRequestError(
    'unavailable',
    'Não foi possível carregar a composição do a receber.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getDashboardReceivableComposition(): Promise<DashboardReceivableCompositionResponse> {
  let response: Response;

  try {
    response = await fetch(dashboardReceivableCompositionPath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new DashboardReceivableCompositionRequestError(
      'unavailable',
      'Não foi possível carregar a composição do a receber.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isComposition(body)) {
    throw new DashboardReceivableCompositionRequestError(
      'invalid_response',
      'Não foi possível carregar a composição do a receber.',
      { httpStatus: response.status },
    );
  }

  return body;
}
