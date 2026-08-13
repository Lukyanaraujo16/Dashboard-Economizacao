import { authLoginPath } from '../../lib/api-config';

export type LoginCredentials = {
  readonly email: string;
  readonly password: string;
};

export type LoginSuccess = {
  readonly status: 'ok';
};

export type LoginErrorDetail = {
  readonly field: string;
  readonly issue: string;
};

export type LoginFailureKind = 'validation' | 'unauthenticated' | 'bad_request' | 'unavailable';

export class LoginRequestError extends Error {
  readonly kind: LoginFailureKind;
  readonly details?: ReadonlyArray<LoginErrorDetail>;
  readonly requestId?: string;
  readonly httpStatus?: number;
  readonly code?: string;

  constructor(
    kind: LoginFailureKind,
    message: string,
    options?: {
      readonly details?: ReadonlyArray<LoginErrorDetail>;
      readonly requestId?: string;
      readonly httpStatus?: number;
      readonly code?: string;
      readonly cause?: unknown;
    },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'LoginRequestError';
    this.kind = kind;
    this.details = options?.details;
    this.requestId = options?.requestId;
    this.httpStatus = options?.httpStatus;
    this.code = options?.code;
  }
}

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: ReadonlyArray<LoginErrorDetail>;
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

function toLoginFailure(response: Response, body: unknown): LoginRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const details = envelope?.error?.details;

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new LoginRequestError(
      'unauthenticated',
      'Não foi possível entrar. Verifique suas credenciais.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 422 || (response.status === 400 && code === 'VALIDATION_ERROR')) {
    const kind = response.status === 400 ? 'bad_request' : 'validation';
    return new LoginRequestError(
      kind,
      kind === 'bad_request'
        ? 'Não foi possível processar a solicitação.'
        : 'Dados de login inválidos.',
      { httpStatus: response.status, code, requestId, details },
    );
  }

  if (response.status === 400) {
    return new LoginRequestError('bad_request', 'Não foi possível processar a solicitação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  return new LoginRequestError(
    'unavailable',
    'Não foi possível conectar ao serviço. Tente novamente.',
    { httpStatus: response.status, code, requestId },
  );
}

/**
 * Autentica via POST /auth/login (same-origin).
 * O cookie HttpOnly de sessão é definido pelo browser; este cliente não o lê.
 */
export async function login(credentials: LoginCredentials): Promise<LoginSuccess> {
  const payload = {
    email: credentials.email,
    password: credentials.password,
  };

  let response: Response;

  try {
    response = await fetch(authLoginPath(), {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    throw new LoginRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toLoginFailure(response, body);
  }

  if (!isRecord(body) || body.status !== 'ok') {
    throw new LoginRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return { status: 'ok' };
}
