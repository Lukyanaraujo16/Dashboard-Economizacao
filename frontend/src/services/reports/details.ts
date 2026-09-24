import {
  reportsExpensesDetailsPath,
  reportsRevenueDetailsPath,
} from '../../lib/api-config';
import type {
  GetReportCashDetailsOptions,
  ReportCashDetailItem,
  ReportCashDetailSituation,
  ReportCashDetailsResponse,
  ReportCashDetailsUnavailableReason,
} from './details.types';
import { ReportsCashDetailsRequestError } from './details.types';

export type { GetReportCashDetailsOptions } from './details.types';
export {
  ReportsCashDetailsRequestError,
  type ReportCashDetailItem,
  type ReportCashDetailSituation,
  type ReportCashDetailsResponse,
} from './details.types';

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

function isSituation(value: unknown): value is ReportCashDetailSituation {
  return value === 'REALIZED' || value === 'EXPECTED' || value === 'OVERDUE';
}

function isUnavailableReason(value: unknown): value is ReportCashDetailsUnavailableReason | null {
  return value === null || value === 'COST_CENTER_SPLIT';
}

function isStringArray(value: unknown): value is readonly string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

function isDetailItem(value: unknown): value is ReportCashDetailItem {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.date === 'string' &&
    (value.description === null || typeof value.description === 'string') &&
    (value.partyName === null || typeof value.partyName === 'string') &&
    isStringArray(value.categoryNames) &&
    isStringArray(value.costCenterNames) &&
    isSituation(value.situation) &&
    typeof value.amount === 'string' &&
    (value.installmentKind === 'RECEIVABLE' || value.installmentKind === 'PAYABLE') &&
    typeof value.installmentExternalId === 'string' &&
    (value.settlementExternalId === undefined || typeof value.settlementExternalId === 'string')
  );
}

function isDetailsResponse(value: unknown): value is ReportCashDetailsResponse {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    isSituation(value.situation) &&
    typeof value.available === 'boolean' &&
    isUnavailableReason(value.unavailableReason) &&
    isNullableDecimal(value.totalAmount) &&
    typeof value.itemCount === 'number' &&
    typeof value.limit === 'number' &&
    typeof value.offset === 'number' &&
    value.items.every(isDetailItem)
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
  direction: 'revenue' | 'expenses',
): ReportsCashDetailsRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const message = envelope?.error?.message;
  const fallback =
    direction === 'expenses'
      ? 'Não foi possível carregar os lançamentos de despesas.'
      : 'Não foi possível carregar os lançamentos de receita.';

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new ReportsCashDetailsRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new ReportsCashDetailsRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar este relatório.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 400 || response.status === 404) {
    return new ReportsCashDetailsRequestError(
      'invalid',
      message ?? 'Não foi possível gerar o detalhamento com os filtros informados.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new ReportsCashDetailsRequestError('unavailable', fallback, {
    httpStatus: response.status,
    code,
    requestId,
  });
}

async function getReportCashDetails(
  direction: 'revenue' | 'expenses',
  options: GetReportCashDetailsOptions,
): Promise<ReportCashDetailsResponse> {
  const path =
    direction === 'expenses'
      ? reportsExpensesDetailsPath(options)
      : reportsRevenueDetailsPath(options);
  const fallback =
    direction === 'expenses'
      ? 'Não foi possível carregar os lançamentos de despesas.'
      : 'Não foi possível carregar os lançamentos de receita.';

  let response: Response;
  try {
    response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new ReportsCashDetailsRequestError('unavailable', fallback, { cause });
  }

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body, direction);
  }
  if (!isDetailsResponse(body)) {
    throw new ReportsCashDetailsRequestError('invalid_response', fallback, {
      httpStatus: response.status,
    });
  }
  return body;
}

export async function getReportsRevenueDetails(
  options: GetReportCashDetailsOptions,
): Promise<ReportCashDetailsResponse> {
  return getReportCashDetails('revenue', options);
}

export async function getReportsExpensesDetails(
  options: GetReportCashDetailsOptions,
): Promise<ReportCashDetailsResponse> {
  return getReportCashDetails('expenses', options);
}
