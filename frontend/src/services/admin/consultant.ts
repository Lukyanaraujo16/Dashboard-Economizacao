import {
  adminConsultantOptionsPath,
  adminTenantConsultantKnowledgeEntryPath,
  adminTenantConsultantKnowledgePath,
  adminTenantConsultantPath,
} from '../../lib/api-config';
import {
  ConsultantRequestError,
  type ConsultantErrorDetail,
  type ConsultantKnowledgeEntry,
  type ConsultantOptions,
  type ConsultantProviderId,
  type ConsultantSettings,
  type CreateConsultantKnowledgeInput,
  type UpdateConsultantKnowledgeInput,
  type UpdateConsultantSettingsInput,
} from './consultant.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: ReadonlyArray<ConsultantErrorDetail>;
    readonly requestId?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isProviderId(value: unknown): value is ConsultantProviderId {
  return value === 'OPENAI' || value === 'ANTHROPIC';
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

function isConsultantSettings(value: unknown): value is ConsultantSettings {
  if (!isRecord(value)) {
    return false;
  }
  const status = value.status;
  return (
    typeof value.configured === 'boolean' &&
    (status === 'ACTIVE' || status === 'DISABLED' || status === 'NOT_CONFIGURED') &&
    (value.provider === null || isProviderId(value.provider)) &&
    isNullableString(value.model) &&
    isNullableString(value.businessSegment) &&
    isNullableString(value.businessDescription) &&
    isNullableString(value.adminPrompt) &&
    isNullableString(value.tone) &&
    isNullableString(value.updatedAt)
  );
}

function isModelOption(value: unknown): value is ConsultantOptions['providers'][number]['models'][number] {
  return isRecord(value) && typeof value.id === 'string' && typeof value.label === 'string';
}

function isProviderOption(value: unknown): value is ConsultantOptions['providers'][number] {
  return (
    isRecord(value) &&
    isProviderId(value.id) &&
    typeof value.label === 'string' &&
    Array.isArray(value.models) &&
    value.models.every(isModelOption)
  );
}

function isConsultantOptions(value: unknown): value is ConsultantOptions {
  return isRecord(value) && Array.isArray(value.providers) && value.providers.every(isProviderOption);
}

function isKnowledgeEntry(value: unknown): value is ConsultantKnowledgeEntry {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.title === 'string' &&
    typeof value.content === 'string' &&
    value.contentType === 'TEXT' &&
    (value.status === 'ACTIVE' || value.status === 'DISABLED') &&
    typeof value.createdAt === 'string' &&
    typeof value.updatedAt === 'string'
  );
}

function parseKnowledgeList(value: unknown): readonly ConsultantKnowledgeEntry[] | null {
  if (Array.isArray(value) && value.every(isKnowledgeEntry)) {
    return value;
  }
  if (isRecord(value) && Array.isArray(value.data) && value.data.every(isKnowledgeEntry)) {
    return value.data;
  }
  return null;
}

function toConsultantFailure(response: Response, body: unknown): ConsultantRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const details = envelope?.error?.details;
  const message =
    envelope?.error?.message ?? 'Não foi possível concluir a operação. Tente novamente.';

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new ConsultantRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new ConsultantRequestError('forbidden', 'Você não tem permissão para esta operação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 404 || code === 'NOT_FOUND') {
    return new ConsultantRequestError('not_found', 'Recurso não encontrado.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 409 || code === 'CONFLICT') {
    return new ConsultantRequestError('conflict', message, {
      httpStatus: response.status,
      code,
      requestId,
      details,
    });
  }

  if (response.status === 422 || (response.status === 400 && code === 'VALIDATION_ERROR')) {
    const kind = response.status === 400 ? 'bad_request' : 'validation';
    return new ConsultantRequestError(
      kind,
      kind === 'bad_request'
        ? 'Não foi possível processar a solicitação.'
        : 'Verifique os dados informados.',
      { httpStatus: response.status, code, requestId, details },
    );
  }

  if (response.status === 400) {
    return new ConsultantRequestError('bad_request', 'Não foi possível processar a solicitação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  return new ConsultantRequestError(
    'unavailable',
    'Não foi possível conectar ao serviço. Tente novamente.',
    { httpStatus: response.status, code, requestId },
  );
}

async function consultantFetch(url: string, init: RequestInit): Promise<Response> {
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
    throw new ConsultantRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { cause },
    );
  }
}

function unavailableBody(httpStatus: number): ConsultantRequestError {
  return new ConsultantRequestError(
    'unavailable',
    'Não foi possível conectar ao serviço. Tente novamente.',
    { httpStatus },
  );
}

export function modelsForProvider(
  options: ConsultantOptions,
  provider: ConsultantProviderId,
): ConsultantOptions['providers'][number]['models'] {
  return options.providers.find((item) => item.id === provider)?.models ?? [];
}

export function defaultModelForProvider(
  options: ConsultantOptions,
  provider: ConsultantProviderId,
): string {
  return modelsForProvider(options, provider)[0]?.id ?? '';
}

export function isValidProviderModel(
  options: ConsultantOptions,
  provider: ConsultantProviderId,
  model: string,
): boolean {
  return modelsForProvider(options, provider).some((item) => item.id === model);
}

export async function getConsultantOptions(): Promise<ConsultantOptions> {
  const response = await consultantFetch(adminConsultantOptionsPath(), { method: 'GET' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  if (!isConsultantOptions(body)) {
    throw unavailableBody(response.status);
  }

  return body;
}

export async function getTenantConsultant(tenantId: string): Promise<ConsultantSettings> {
  const response = await consultantFetch(adminTenantConsultantPath(tenantId), { method: 'GET' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  if (!isConsultantSettings(body)) {
    throw unavailableBody(response.status);
  }

  return body;
}

export async function updateTenantConsultant(
  tenantId: string,
  input: UpdateConsultantSettingsInput,
): Promise<ConsultantSettings> {
  const response = await consultantFetch(adminTenantConsultantPath(tenantId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  if (!isConsultantSettings(body)) {
    throw unavailableBody(response.status);
  }

  return body;
}

export async function listTenantConsultantKnowledge(
  tenantId: string,
): Promise<readonly ConsultantKnowledgeEntry[]> {
  const response = await consultantFetch(adminTenantConsultantKnowledgePath(tenantId), {
    method: 'GET',
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  const list = parseKnowledgeList(body);
  if (list === null) {
    throw unavailableBody(response.status);
  }

  return list;
}

export async function createTenantConsultantKnowledge(
  tenantId: string,
  input: CreateConsultantKnowledgeInput,
): Promise<ConsultantKnowledgeEntry> {
  const response = await consultantFetch(adminTenantConsultantKnowledgePath(tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      contentType: input.contentType ?? 'TEXT',
      ...(input.status !== undefined ? { status: input.status } : {}),
    }),
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  if (!isKnowledgeEntry(body)) {
    throw unavailableBody(response.status);
  }

  return body;
}

export async function updateTenantConsultantKnowledge(
  tenantId: string,
  entryId: string,
  input: UpdateConsultantKnowledgeInput,
): Promise<ConsultantKnowledgeEntry> {
  const response = await consultantFetch(adminTenantConsultantKnowledgeEntryPath(tenantId, entryId), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }

  if (!isKnowledgeEntry(body)) {
    throw unavailableBody(response.status);
  }

  return body;
}

export async function deleteTenantConsultantKnowledge(
  tenantId: string,
  entryId: string,
): Promise<void> {
  const response = await consultantFetch(adminTenantConsultantKnowledgeEntryPath(tenantId, entryId), {
    method: 'DELETE',
  });

  if (response.status === 204) {
    return;
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toConsultantFailure(response, body);
  }
}
