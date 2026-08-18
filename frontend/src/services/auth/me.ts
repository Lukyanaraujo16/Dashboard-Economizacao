import { authMePath } from '../../lib/api-config';
import type { AuthMeResponse, AuthenticatedUser, SupportState } from '../../auth/types';

export type GetCurrentUserResult =
  | {
      readonly kind: 'authenticated';
      readonly user: AuthenticatedUser;
      readonly support: SupportState;
    }
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

function isSupportState(value: unknown): value is SupportState {
  if (!isRecord(value) || typeof value.active !== 'boolean') {
    return false;
  }
  if (!value.active) {
    return true;
  }
  return (
    typeof value.tenantId === 'string' &&
    typeof value.tenantDisplayName === 'string' &&
    typeof value.startedAt === 'string' &&
    typeof value.supportSessionId === 'string'
  );
}

export function parseAuthMeResponse(value: unknown): AuthMeResponse | null {
  if (!isRecord(value) || !isAuthenticatedUser(value.user) || !isSupportState(value.support)) {
    return null;
  }
  return { user: value.user, support: value.support };
}

export async function readJsonBody(response: Response): Promise<unknown> {
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

  const session = parseAuthMeResponse(body);
  if (!session) {
    throw new SessionRequestError('Não foi possível verificar a sessão. Tente novamente.', {
      httpStatus: response.status,
    });
  }

  return { kind: 'authenticated', ...session };
}
