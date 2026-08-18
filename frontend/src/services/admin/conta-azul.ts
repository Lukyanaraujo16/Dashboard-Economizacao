import {
  adminTenantContaAzulConnectPath,
  adminTenantContaAzulDisconnectPath,
  adminTenantContaAzulPath,
  adminTenantContaAzulVerifyPath,
} from '../../lib/api-config';
import {
  ContaAzulRequestError,
  type ContaAzulConnectResult,
  type ContaAzulIntegration,
} from './conta-azul.types';

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isPublicErrorCode(value: unknown): value is ContaAzulIntegration['lastErrorCode'] {
  return (
    value === null ||
    value === 'refresh_failed' ||
    value === 'identity_unauthorized' ||
    value === 'identity_incomplete' ||
    value === 'external_account_conflict'
  );
}

function isIntegration(value: unknown): value is ContaAzulIntegration {
  if (!isRecord(value)) {
    return false;
  }
  return (
    value.provider === 'CONTA_AZUL' &&
    (value.status === 'DISCONNECTED' || value.status === 'CONNECTED' || value.status === 'ERROR') &&
    isNullableString(value.connectedAt) &&
    isNullableString(value.disconnectedAt) &&
    isNullableString(value.externalAccountId) &&
    isNullableString(value.externalCompanyName) &&
    isNullableString(value.lastSuccessfulSyncAt) &&
    isNullableString(value.lastErrorAt) &&
    isPublicErrorCode(value.lastErrorCode)
  );
}

function isConnectResult(value: unknown): value is ContaAzulConnectResult {
  return isRecord(value) && typeof value.authorizationUrl === 'string';
}

function isSafeAuthorizationUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      parsed.hostname === 'login.contaazul.com' &&
      parsed.hash.startsWith('#/oauth/authorize')
    );
  } catch {
    return false;
  }
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

function toFailure(response: Response, body: unknown): ContaAzulRequestError {
  const envelope = isRecord(body) ? body.error : undefined;
  const error = isRecord(envelope) ? envelope : undefined;
  const code = typeof error?.code === 'string' ? error.code : undefined;
  const message =
    typeof error?.message === 'string'
      ? error.message
      : 'Não foi possível concluir a operação. Tente novamente.';

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new ContaAzulRequestError('unauthenticated', 'Sessão expirada. Entre novamente.', {
      httpStatus: response.status,
      code,
    });
  }
  if (response.status === 403 || code === 'FORBIDDEN') {
    return new ContaAzulRequestError('forbidden', 'Operação não permitida.', {
      httpStatus: response.status,
      code,
    });
  }
  if (response.status === 404 || code === 'NOT_FOUND') {
    return new ContaAzulRequestError('not_found', 'Empresa não encontrada.', {
      httpStatus: response.status,
      code,
    });
  }
  if (response.status === 422 || code === 'VALIDATION_ERROR') {
    return new ContaAzulRequestError('validation', message, { httpStatus: response.status, code });
  }
  return new ContaAzulRequestError('unavailable', message, { httpStatus: response.status, code });
}

async function contaAzulFetch(url: string, init: RequestInit): Promise<Response> {
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
    throw new ContaAzulRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { cause },
    );
  }
}

export async function getContaAzulIntegration(tenantId: string): Promise<ContaAzulIntegration> {
  const response = await contaAzulFetch(adminTenantContaAzulPath(tenantId), { method: 'GET' });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  if (!isIntegration(body)) {
    throw new ContaAzulRequestError('unavailable', 'Não foi possível ler o status da Conta Azul.', {
      httpStatus: response.status,
    });
  }
  return body;
}

export async function connectContaAzul(tenantId: string): Promise<ContaAzulConnectResult> {
  const response = await contaAzulFetch(adminTenantContaAzulConnectPath(tenantId), {
    method: 'POST',
  });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  if (!isConnectResult(body) || !isSafeAuthorizationUrl(body.authorizationUrl)) {
    throw new ContaAzulRequestError(
      'unavailable',
      'A URL de autorização da Conta Azul é inválida.',
      { httpStatus: response.status },
    );
  }
  return body;
}

export async function disconnectContaAzul(tenantId: string): Promise<ContaAzulIntegration> {
  const response = await contaAzulFetch(adminTenantContaAzulDisconnectPath(tenantId), {
    method: 'POST',
  });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  if (!isIntegration(body)) {
    throw new ContaAzulRequestError('unavailable', 'Não foi possível desconectar a Conta Azul.', {
      httpStatus: response.status,
    });
  }
  return body;
}

export async function verifyContaAzul(tenantId: string): Promise<ContaAzulIntegration> {
  const response = await contaAzulFetch(adminTenantContaAzulVerifyPath(tenantId), {
    method: 'POST',
  });
  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toFailure(response, body);
  }
  if (!isIntegration(body)) {
    throw new ContaAzulRequestError(
      'unavailable',
      'Não foi possível verificar a conexão com a Conta Azul.',
      { httpStatus: response.status },
    );
  }
  return body;
}
