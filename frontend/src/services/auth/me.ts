import { authMePath } from '../../lib/api-config';
import type { AuthenticatedUser } from '../../auth/types';

export type GetCurrentUserResult =
  | { readonly kind: 'authenticated'; readonly user: AuthenticatedUser }
  | { readonly kind: 'unauthenticated' };

export class SessionRequestError extends Error {
  readonly kind: 'unavailable';
  readonly httpStatus?: number;
  readonly requestId?: string;

  constructor(
    message: string,
    options?: {
      readonly httpStatus?: number;
      readonly requestId?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'SessionRequestError';
    this.kind = 'unavailable';
    this.httpStatus = options?.httpStatus;
    this.requestId = options?.requestId;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isAuthenticatedUser(value: unknown): value is AuthenticatedUser {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.id === 'string' &&
    typeof value.name === 'string' &&
    typeof value.email === 'string' &&
    (value.role === 'USER' || value.role === 'ADMIN' || value.role === 'SUPER_ADMIN') &&
    (value.tenantId === null || typeof value.tenantId === 'string')
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

/**
 * Hidrata identidade via GET /auth/me (cookie HttpOnly; não lido no JS).
 */
export async function getCurrentUser(): Promise<GetCurrentUserResult> {
  let response: Response;

  try {
    response = await fetch(authMePath(), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new SessionRequestError('Não foi possível verificar a sessão. Tente novamente.', {
      cause,
    });
  }

  if (response.status === 401) {
    return { kind: 'unauthenticated' };
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    const requestId =
      isRecord(body) && isRecord(body.error) && typeof body.error.requestId === 'string'
        ? body.error.requestId
        : undefined;
    throw new SessionRequestError('Não foi possível verificar a sessão. Tente novamente.', {
      httpStatus: response.status,
      requestId,
    });
  }

  if (!isRecord(body) || !isAuthenticatedUser(body.user)) {
    throw new SessionRequestError('Não foi possível verificar a sessão. Tente novamente.', {
      httpStatus: response.status,
    });
  }

  return { kind: 'authenticated', user: body.user };
}
