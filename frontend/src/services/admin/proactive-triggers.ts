import {
  adminProactiveTriggerCatalogPath,
  adminTenantProactiveTriggerActivePath,
  adminTenantProactiveTriggerPath,
  adminTenantProactiveTriggersPath,
} from '../../lib/api-config';
import {
  ProactiveTriggerRequestError,
  type CertifiedProactiveTriggerType,
  type ProactiveTitleKind,
  type ProactiveTriggerCatalog,
  type ProactiveTriggerConfiguration,
  type ProactiveTriggerParameterField,
  type ProactiveTriggerRequestFailureKind,
  type ProactiveTriggerSuggestedDefaults,
} from './proactive-triggers.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isTitleKind(value: unknown): value is ProactiveTitleKind {
  return value === 'RECEIVABLE' || value === 'PAYABLE';
}

function isParameterField(value: unknown): value is ProactiveTriggerParameterField {
  if (!isRecord(value) || typeof value.name !== 'string' || typeof value.required !== 'boolean') {
    return false;
  }
  return (
    value.valueKind === 'integer' ||
    value.valueKind === 'decimal' ||
    value.valueKind === 'titleKind' ||
    value.valueKind === 'none'
  );
}

function isCertifiedType(value: unknown): value is CertifiedProactiveTriggerType {
  return (
    isRecord(value) &&
    typeof value.type === 'string' &&
    typeof value.description === 'string' &&
    Array.isArray(value.parameters) &&
    value.parameters.every(isParameterField)
  );
}

function isSuggestedDefaults(value: unknown): value is ProactiveTriggerSuggestedDefaults {
  if (!isRecord(value) || !isRecord(value.titleDueSoon)) {
    return false;
  }
  const title = value.titleDueSoon;
  return (
    Array.isArray(value.revenueGoalPercentages) &&
    value.revenueGoalPercentages.every((item) => typeof item === 'number') &&
    Array.isArray(value.expenseCeilingPercentages) &&
    value.expenseCeilingPercentages.every((item) => typeof item === 'number') &&
    typeof value.expenseCeilingExceeded === 'boolean' &&
    typeof title.daysAhead === 'number' &&
    typeof title.minimumAmount === 'string' &&
    isTitleKind(title.titleKind)
  );
}

function isCatalog(value: unknown): value is ProactiveTriggerCatalog {
  return (
    isRecord(value) &&
    Array.isArray(value.types) &&
    value.types.every(isCertifiedType) &&
    isSuggestedDefaults(value.suggestedDefaults)
  );
}

export function parseProactiveTriggerConfiguration(
  value: unknown,
): ProactiveTriggerConfiguration | null {
  if (!isRecord(value) || typeof value.id !== 'string' || typeof value.triggerType !== 'string') {
    return null;
  }
  if (typeof value.active !== 'boolean') {
    return null;
  }
  if (!(value.percentage === null || typeof value.percentage === 'number')) {
    return null;
  }
  if (!(value.daysAhead === null || typeof value.daysAhead === 'number')) {
    return null;
  }
  if (!(value.minimumAmount === null || typeof value.minimumAmount === 'string')) {
    return null;
  }
  if (!(value.titleKind === null || isTitleKind(value.titleKind))) {
    return null;
  }

  return {
    id: value.id,
    triggerType: value.triggerType,
    percentage: value.percentage,
    daysAhead: value.daysAhead,
    minimumAmount: value.minimumAmount,
    titleKind: value.titleKind,
    active: value.active,
  };
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

function errorMessage(body: unknown, fallback: string): string {
  const envelope = body as ErrorEnvelope | null;
  const message = envelope?.error?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
}

function errorCode(body: unknown): string | undefined {
  const envelope = body as ErrorEnvelope | null;
  return typeof envelope?.error?.code === 'string' ? envelope.error.code : undefined;
}

function toFailure(response: Response, body: unknown): ProactiveTriggerRequestError {
  const code = errorCode(body);
  const httpStatus = response.status;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new ProactiveTriggerRequestError(
      'unauthenticated',
      'Sua sessão expirou. Entre novamente.',
      { httpStatus, code },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new ProactiveTriggerRequestError('forbidden', 'Você não pode administrar estes gatilhos.', {
      httpStatus,
      code,
    });
  }

  if (response.status === 404 || code === 'NOT_FOUND') {
    return new ProactiveTriggerRequestError('not_found', errorMessage(body, 'Gatilho não encontrado.'), {
      httpStatus,
      code,
    });
  }

  if (response.status === 409 || code === 'CONFLICT') {
    return new ProactiveTriggerRequestError(
      'conflict',
      errorMessage(body, 'Não foi possível concluir a operação.'),
      { httpStatus, code },
    );
  }

  if (response.status === 400 || response.status === 422 || code === 'VALIDATION_ERROR') {
    const kind: ProactiveTriggerRequestFailureKind = response.status === 400 ? 'bad_request' : 'validation';
    return new ProactiveTriggerRequestError(kind, errorMessage(body, 'Verifique os dados informados.'), {
      httpStatus,
      code,
    });
  }

  return new ProactiveTriggerRequestError(
    'unavailable',
    'Não foi possível conectar ao serviço. Tente novamente.',
    { httpStatus, code },
  );
}

async function proactiveFetch(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, {
      ...init,
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...init.headers,
      },
    });
  } catch {
    throw new ProactiveTriggerRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
    );
  }
}

function unavailableBody(httpStatus: number): ProactiveTriggerRequestError {
  return new ProactiveTriggerRequestError(
    'unavailable',
    'Não foi possível conectar ao serviço. Tente novamente.',
    { httpStatus },
  );
}

export async function getProactiveTriggerCatalog(): Promise<ProactiveTriggerCatalog> {
  const response = await proactiveFetch(adminProactiveTriggerCatalogPath(), { method: 'GET' });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  if (!isCatalog(body)) {
    throw unavailableBody(response.status);
  }
  return body;
}

export async function listProactiveTriggers(
  tenantId: string,
): Promise<readonly ProactiveTriggerConfiguration[]> {
  const response = await proactiveFetch(adminTenantProactiveTriggersPath(tenantId), { method: 'GET' });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  if (!isRecord(body) || !Array.isArray(body.data)) {
    throw unavailableBody(response.status);
  }
  const items: ProactiveTriggerConfiguration[] = [];
  for (const entry of body.data) {
    const parsed = parseProactiveTriggerConfiguration(entry);
    if (!parsed) {
      throw unavailableBody(response.status);
    }
    items.push(parsed);
  }
  return items;
}

export async function createProactiveTrigger(
  tenantId: string,
  triggerType: string,
  parameters: Record<string, unknown>,
): Promise<ProactiveTriggerConfiguration> {
  const response = await proactiveFetch(adminTenantProactiveTriggersPath(tenantId), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ triggerType, parameters }),
  });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  const parsed = parseProactiveTriggerConfiguration(body);
  if (!parsed) {
    throw unavailableBody(response.status);
  }
  return parsed;
}

export async function updateProactiveTrigger(
  tenantId: string,
  configurationId: string,
  parameters: Record<string, unknown>,
): Promise<ProactiveTriggerConfiguration> {
  const response = await proactiveFetch(adminTenantProactiveTriggerPath(tenantId, configurationId), {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ parameters }),
  });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  const parsed = parseProactiveTriggerConfiguration(body);
  if (!parsed) {
    throw unavailableBody(response.status);
  }
  return parsed;
}

export async function setProactiveTriggerActive(
  tenantId: string,
  configurationId: string,
  active: boolean,
): Promise<ProactiveTriggerConfiguration> {
  const response = await proactiveFetch(
    adminTenantProactiveTriggerActivePath(tenantId, configurationId),
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active }),
    },
  );
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  const parsed = parseProactiveTriggerConfiguration(body);
  if (!parsed) {
    throw unavailableBody(response.status);
  }
  return parsed;
}

export async function deleteProactiveTrigger(
  tenantId: string,
  configurationId: string,
): Promise<void> {
  const response = await proactiveFetch(adminTenantProactiveTriggerPath(tenantId, configurationId), {
    method: 'DELETE',
  });
  if (response.status === 204) {
    return;
  }
  const body = await readJsonBody(response);
  throw toFailure(response, body);
}
