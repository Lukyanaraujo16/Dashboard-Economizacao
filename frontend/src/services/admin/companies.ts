import {
  adminTenantDisablePath,
  adminTenantPath,
  adminTenantReactivatePath,
  adminTenantsPath,
} from '../../lib/api-config';
import type {
  Company,
  CompanyListResult,
  CreateCompanyInput,
  ListCompaniesParams,
  UpdateCompanyInput,
} from './companies.types';
import { CompaniesRequestError, type CompanyErrorDetail } from './companies.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: ReadonlyArray<CompanyErrorDetail>;
    readonly requestId?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
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

function isCompanyIntegration(value: unknown): value is Company['integration'] {
  if (value === null) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.status === 'CONNECTED' ||
      value.status === 'DISCONNECTED' ||
      value.status === 'ERROR') &&
    (value.lastSuccessfulSyncAt === null || typeof value.lastSuccessfulSyncAt === 'string')
  );
}

function isCompany(value: unknown): value is Company {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.displayName === 'string' &&
    (value.status === 'ACTIVE' || value.status === 'DISABLED') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string' &&
    (value.deactivatedAt === null || typeof value.deactivatedAt === 'string') &&
    isCompanyIntegration(value.integration)
  );
}

function isCompanyListResult(value: unknown): value is CompanyListResult {
  if (!isRecord(value) || !Array.isArray(value.data) || !isRecord(value.pagination)) {
    return false;
  }
  const pagination = value.pagination;
  return (
    value.data.every(isCompany) &&
    typeof pagination.limit === 'number' &&
    typeof pagination.offset === 'number' &&
    typeof pagination.total === 'number' &&
    typeof pagination.hasMore === 'boolean'
  );
}

function toCompaniesFailure(response: Response, body: unknown): CompaniesRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const details = envelope?.error?.details;
  const message =
    envelope?.error?.message ?? 'Não foi possível concluir a operação. Tente novamente.';

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new CompaniesRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      {
        httpStatus: response.status,
        code,
        requestId,
      },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new CompaniesRequestError('forbidden', 'Você não tem permissão para esta operação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 404 || code === 'NOT_FOUND') {
    return new CompaniesRequestError('not_found', 'Empresa não encontrada.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 409 || code === 'CONFLICT') {
    return new CompaniesRequestError('conflict', message, {
      httpStatus: response.status,
      code,
      requestId,
      details,
    });
  }

  if (response.status === 422 || (response.status === 400 && code === 'VALIDATION_ERROR')) {
    const kind = response.status === 400 ? 'bad_request' : 'validation';
    return new CompaniesRequestError(
      kind,
      kind === 'bad_request'
        ? 'Não foi possível processar a solicitação.'
        : 'Verifique os dados informados.',
      { httpStatus: response.status, code, requestId, details },
    );
  }

  if (response.status === 400) {
    return new CompaniesRequestError('bad_request', 'Não foi possível processar a solicitação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  return new CompaniesRequestError(
    'unavailable',
    'Não foi possível conectar ao serviço. Tente novamente.',
    { httpStatus: response.status, code, requestId },
  );
}

async function companiesFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });
  } catch (cause) {
    throw new CompaniesRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { cause },
    );
  }
}

function buildListUrl(params?: ListCompaniesParams): string {
  const search = new URLSearchParams();
  if (params?.status) {
    search.set('status', params.status);
  }
  if (params?.limit !== undefined) {
    search.set('limit', String(params.limit));
  }
  if (params?.offset !== undefined) {
    search.set('offset', String(params.offset));
  }
  const query = search.toString();
  return query ? `${adminTenantsPath()}?${query}` : adminTenantsPath();
}

export async function listCompanies(params?: ListCompaniesParams): Promise<CompanyListResult> {
  const response = await companiesFetch(buildListUrl(params), { method: 'GET' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toCompaniesFailure(response, body);
  }

  if (!isCompanyListResult(body)) {
    throw new CompaniesRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function getCompany(companyId: string): Promise<Company> {
  const response = await companiesFetch(adminTenantPath(companyId), { method: 'GET' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toCompaniesFailure(response, body);
  }

  if (!isCompany(body)) {
    throw new CompaniesRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function createCompany(input: CreateCompanyInput): Promise<Company> {
  const response = await companiesFetch(adminTenantsPath(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name,
      displayName: input.displayName,
    }),
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toCompaniesFailure(response, body);
  }

  if (!isCompany(body)) {
    throw new CompaniesRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function updateCompany(
  companyId: string,
  input: UpdateCompanyInput,
): Promise<Company> {
  const response = await companiesFetch(adminTenantPath(companyId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toCompaniesFailure(response, body);
  }

  if (!isCompany(body)) {
    throw new CompaniesRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function disableCompany(companyId: string): Promise<Company> {
  const response = await companiesFetch(adminTenantDisablePath(companyId), { method: 'POST' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toCompaniesFailure(response, body);
  }

  if (!isCompany(body)) {
    throw new CompaniesRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function reactivateCompany(companyId: string): Promise<Company> {
  const response = await companiesFetch(adminTenantReactivatePath(companyId), { method: 'POST' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toCompaniesFailure(response, body);
  }

  if (!isCompany(body)) {
    throw new CompaniesRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function deleteCompany(companyId: string): Promise<void> {
  const response = await companiesFetch(adminTenantPath(companyId), { method: 'DELETE' });

  if (response.status === 204) {
    return;
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toCompaniesFailure(response, body);
  }
}
