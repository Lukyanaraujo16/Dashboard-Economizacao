import type {
  ManagedUser,
  ManagedUserErrorDetail,
  ManagedUserListResult,
  ManagedUsersRequestError as ManagedUsersRequestErrorType,
} from './managed-user.types';
import {
  isManagedUser,
  isManagedUserListResult,
  ManagedUsersRequestError,
} from './managed-user.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: ReadonlyArray<ManagedUserErrorDetail>;
    readonly requestId?: string;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export async function readManagedUserJsonBody(response: Response): Promise<unknown> {
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

export function toManagedUsersFailure(
  response: Response,
  body: unknown,
  notFoundMessage: string,
): ManagedUsersRequestErrorType {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const details = envelope?.error?.details;
  const message =
    envelope?.error?.message ?? 'Não foi possível concluir a operação. Tente novamente.';

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new ManagedUsersRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new ManagedUsersRequestError('forbidden', 'Você não tem permissão para esta operação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 404 || code === 'NOT_FOUND') {
    return new ManagedUsersRequestError('not_found', notFoundMessage, {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 409 || code === 'CONFLICT') {
    return new ManagedUsersRequestError('conflict', friendlyConflictMessage(message), {
      httpStatus: response.status,
      code,
      requestId,
      details,
    });
  }

  if (response.status === 422 || (response.status === 400 && code === 'VALIDATION_ERROR')) {
    const kind = response.status === 400 ? 'bad_request' : 'validation';
    return new ManagedUsersRequestError(
      kind,
      kind === 'bad_request'
        ? 'Não foi possível processar a solicitação.'
        : 'Verifique os dados informados.',
      { httpStatus: response.status, code, requestId, details },
    );
  }

  if (response.status === 400) {
    return new ManagedUsersRequestError(
      'bad_request',
      'Não foi possível processar a solicitação.',
      {
        httpStatus: response.status,
        code,
        requestId,
      },
    );
  }

  return new ManagedUsersRequestError(
    'unavailable',
    'Não foi possível conectar ao serviço. Tente novamente.',
    { httpStatus: response.status, code, requestId },
  );
}

function friendlyConflictMessage(message: string): string {
  const trimmed = message.trim();
  if (!trimmed || trimmed === 'CONFLICT') {
    return 'Não foi possível concluir a operação devido a um conflito.';
  }
  return trimmed;
}

export async function managedUsersFetch(url: string, init: RequestInit): Promise<Response> {
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
    throw new ManagedUsersRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { cause },
    );
  }
}

export function parseManagedUserOrThrow(body: unknown, response: Response): ManagedUser {
  if (!isManagedUser(body)) {
    throw new ManagedUsersRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }
  return body;
}

export function parseResetPasswordResultOrThrow(body: unknown, response: Response): ManagedUser {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new ManagedUsersRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }
  const record = body as Record<string, unknown>;
  if (record.status !== 'ok') {
    throw new ManagedUsersRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }
  return parseManagedUserOrThrow(record.user, response);
}

export function parseManagedUserListOrThrow(
  body: unknown,
  response: Response,
): ManagedUserListResult {
  if (!isManagedUserListResult(body)) {
    throw new ManagedUsersRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }
  return body;
}

export function buildManagedUsersListUrl(
  basePath: string,
  params?: { status?: string; limit?: number; offset?: number },
): string {
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
  return query ? `${basePath}?${query}` : basePath;
}
