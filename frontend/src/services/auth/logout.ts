import { authLogoutPath } from '../../lib/api-config';
import { SessionRequestError } from './me';

export type LogoutSuccess = {
  readonly status: 'ok';
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

/**
 * Encerra a sessão atual via POST /auth/logout.
 * Só considera sucesso após resposta 200 do servidor.
 */
export async function logout(): Promise<LogoutSuccess> {
  let response: Response;

  try {
    response = await fetch(authLogoutPath(), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new SessionRequestError('Não foi possível encerrar a sessão. Tente novamente.', {
      cause,
    });
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    const requestId =
      isRecord(body) && isRecord(body.error) && typeof body.error.requestId === 'string'
        ? body.error.requestId
        : undefined;
    throw new SessionRequestError('Não foi possível encerrar a sessão. Tente novamente.', {
      httpStatus: response.status,
      requestId,
    });
  }

  if (!isRecord(body) || body.status !== 'ok') {
    throw new SessionRequestError('Não foi possível encerrar a sessão. Tente novamente.', {
      httpStatus: response.status,
    });
  }

  return { status: 'ok' };
}
