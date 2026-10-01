import { dashboardExpenseCeilingPath } from '../../lib/api-config';
import {
  EXPENSE_CEILING_STATUSES,
  DashboardExpenseCeilingRequestError,
  type ExpenseCeilingSnapshot,
  type ExpenseCeilingStatus,
} from './expense-ceiling.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableDecimal(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isStatus(value: unknown): value is ExpenseCeilingStatus {
  return typeof value === 'string' && (EXPENSE_CEILING_STATUSES as readonly string[]).includes(value);
}

function parseSnapshot(body: unknown): ExpenseCeilingSnapshot | null {
  if (!isRecord(body) || typeof body.monthKey !== 'string' || !isStatus(body.status)) {
    return null;
  }
  if (
    !isNullableDecimal(body.ceiling) ||
    !isNullableDecimal(body.monthlyExpenses) ||
    !isNullableDecimal(body.consumedRate) ||
    !isNullableDecimal(body.available) ||
    !isNullableDecimal(body.exceeded)
  ) {
    return null;
  }
  return {
    monthKey: body.monthKey,
    ceiling: body.ceiling,
    monthlyExpenses: body.monthlyExpenses,
    consumedRate: body.consumedRate,
    available: body.available,
    exceeded: body.exceeded,
    status: body.status,
  };
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

function toError(response: Response, body: unknown, unavailableMessage: string) {
  const code = isRecord(body) && isRecord((body as ErrorEnvelope).error)
    ? (body as ErrorEnvelope).error?.code
    : undefined;
  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new DashboardExpenseCeilingRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
    );
  }
  if (response.status === 403 || code === 'FORBIDDEN') {
    return new DashboardExpenseCeilingRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.',
    );
  }
  if (response.status === 400 || response.status === 422) {
    return new DashboardExpenseCeilingRequestError(
      'invalid_ceiling',
      'Informe um teto de gastos maior que zero.',
    );
  }
  return new DashboardExpenseCeilingRequestError('unavailable', unavailableMessage);
}

async function request(
  path: string,
  init: RequestInit,
  unavailableMessage: string,
): Promise<ExpenseCeilingSnapshot> {
  let response: Response;
  try {
    response = await fetch(path, {
      credentials: 'include',
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
      ...init,
    });
  } catch (cause) {
    throw new DashboardExpenseCeilingRequestError('unavailable', unavailableMessage, { cause });
  }
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toError(response, body, unavailableMessage);
  }
  const snapshot = parseSnapshot(body);
  if (snapshot === null) {
    throw new DashboardExpenseCeilingRequestError('unavailable', unavailableMessage);
  }
  return snapshot;
}

export async function getDashboardExpenseCeiling(
  monthKey?: string | null,
): Promise<ExpenseCeilingSnapshot> {
  return request(
    dashboardExpenseCeilingPath(monthKey),
    { method: 'GET' },
    'Não foi possível carregar o teto de gastos.',
  );
}

/** `ceiling` é decimal-string (ex.: "100000.00"); nunca número em ponto flutuante. */
export async function putDashboardExpenseCeiling(input: {
  readonly month: string;
  readonly ceiling: string;
}): Promise<ExpenseCeilingSnapshot> {
  return request(
    dashboardExpenseCeilingPath(),
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ month: input.month, ceiling: input.ceiling }),
    },
    'Não foi possível salvar o teto de gastos.',
  );
}
