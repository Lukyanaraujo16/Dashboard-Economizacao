import {
  reportsExpensesExportFilename,
  reportsExpensesPath,
} from '../../lib/api-config';
import { triggerBrowserDownload } from '../../lib/trigger-browser-download';
import type { DashboardSituation } from '../../lib/dashboard-situation';
import type {
  ReportsExpensesDailyPoint,
  ReportsExpensesItem,
  ReportsExpensesMonth,
  ReportsExpensesPayables,
  ReportsExpensesResponse,
} from './expenses.types';
import { ReportsExpensesRequestError } from './expenses.types';

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

function isItem(value: unknown): value is ReportsExpensesItem {
  return (
    isRecord(value) &&
    (value.kind === 'category' ||
      value.kind === 'other' ||
      value.kind === 'uncategorized' ||
      value.kind === 'imprecise') &&
    typeof value.name === 'string' &&
    typeof value.amount === 'string' &&
    isNullableDecimal(value.paid) &&
    isNullableDecimal(value.outstanding) &&
    typeof value.percentage === 'string'
  );
}

function isDailyPoint(value: unknown): value is ReportsExpensesDailyPoint {
  return (
    isRecord(value) &&
    typeof value.date === 'string' &&
    typeof value.amount === 'string' &&
    isNullableDecimal(value.received) &&
    isNullableDecimal(value.outstanding)
  );
}

function isIntervalPayables(value: unknown): value is ReportsExpensesPayables {
  if (!isRecord(value)) {
    return false;
  }
  const items = value.items;
  if (!Array.isArray(items) || value.daily !== undefined) {
    return false;
  }
  return (
    isNullableDecimal(value.total) &&
    isNullableDecimal(value.paid) &&
    isNullableDecimal(value.outstanding) &&
    isNullableDecimal(value.overdue) &&
    typeof value.classified === 'string' &&
    typeof value.uncategorized === 'string' &&
    typeof value.imprecise === 'string' &&
    (value.coverageRate === null || typeof value.coverageRate === 'string') &&
    items.every(isItem)
  );
}

function isMonthPayables(
  value: unknown,
): value is ReportsExpensesMonth['payables'] {
  if (!isRecord(value) || !Array.isArray(value.items) || !Array.isArray(value.daily)) {
    return false;
  }
  return (
    isNullableDecimal(value.total) &&
    isNullableDecimal(value.paid) &&
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

function isMonth(value: unknown): value is ReportsExpensesMonth {
  return (
    isRecord(value) &&
    typeof value.monthKey === 'string' &&
    isMonthPayables(value.payables)
  );
}

function isExpensesReport(value: unknown): value is ReportsExpensesResponse {
  if (!isRecord(value) || !Array.isArray(value.months)) {
    return false;
  }
  return (
    typeof value.today === 'string' &&
    typeof value.from === 'string' &&
    typeof value.to === 'string' &&
    (value.costCenterCashSplit === undefined || typeof value.costCenterCashSplit === 'boolean') &&
    isIntervalPayables(value.payables) &&
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

function toFailure(response: Response, body: unknown): ReportsExpensesRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const message = envelope?.error?.message;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new ReportsExpensesRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new ReportsExpensesRequestError(
      'forbidden',
      'Selecione uma empresa pelo modo suporte para visualizar este relatório.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 400 || response.status === 404) {
    return new ReportsExpensesRequestError(
      'invalid',
      message ?? 'Não foi possível gerar o relatório com os filtros informados.',
      { httpStatus: response.status, code, requestId },
    );
  }

  return new ReportsExpensesRequestError(
    'unavailable',
    'Não foi possível carregar o relatório de despesas.',
    { httpStatus: response.status, code, requestId },
  );
}

export async function getReportsExpenses(options: {
  readonly from: string;
  readonly to: string;
  readonly costCenterId?: string | null;
  readonly situation?: DashboardSituation | null;
  readonly categoryId?: string | null;
}): Promise<ReportsExpensesResponse> {
  let response: Response;

  try {
    response = await fetch(reportsExpensesPath(options), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new ReportsExpensesRequestError(
      'unavailable',
      'Não foi possível carregar o relatório de despesas.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isExpensesReport(body)) {
    throw new ReportsExpensesRequestError(
      'invalid_response',
      'Não foi possível carregar o relatório de despesas.',
      { httpStatus: response.status },
    );
  }

  return body;
}

const PDF_ACCEPT = 'application/pdf';
const XLSX_ACCEPT = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const SAFE_EXPORT_FILENAME = /^relatorio-despesas-\d{4}-\d{2}-a-\d{4}-\d{2}\.(pdf|xlsx)$/;

export type ReportsExpensesExportFormat = 'pdf' | 'xlsx';

function filenameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) {
    return fallback;
  }
  const quoted = /filename="([^"]+)"/.exec(header);
  const name = quoted?.[1]?.trim();
  if (name && SAFE_EXPORT_FILENAME.test(name)) {
    return name;
  }
  return fallback;
}

export async function downloadReportsExpensesExport(options: {
  readonly from: string;
  readonly to: string;
  readonly costCenterId?: string | null;
  readonly situation?: DashboardSituation | null;
  readonly categoryId?: string | null;
  readonly format: ReportsExpensesExportFormat;
}): Promise<void> {
  let response: Response;
  const accept = options.format === 'pdf' ? PDF_ACCEPT : XLSX_ACCEPT;

  try {
    response = await fetch(
      reportsExpensesPath({
        from: options.from,
        to: options.to,
        costCenterId: options.costCenterId,
        situation: options.situation,
        categoryId: options.categoryId,
        format: options.format,
      }),
      {
        method: 'GET',
        credentials: 'include',
        headers: { Accept: accept },
      },
    );
  } catch (cause) {
    throw new ReportsExpensesRequestError(
      'unavailable',
      'Não foi possível exportar o relatório de despesas.',
      { cause },
    );
  }

  if (!response.ok) {
    const body = await readJsonBody(response);
    const failure = toFailure(response, body);
    if (failure.kind === 'unavailable' || failure.kind === 'invalid_response') {
      throw new ReportsExpensesRequestError(
        failure.kind,
        'Não foi possível exportar o relatório de despesas.',
        { httpStatus: failure.httpStatus, code: failure.code, requestId: failure.requestId },
      );
    }
    throw failure;
  }

  const blob = await response.blob();
  const filename = filenameFromContentDisposition(
    response.headers.get('Content-Disposition'),
    reportsExpensesExportFilename(options.from, options.to, options.format),
  );
  triggerBrowserDownload(blob, filename);
}
