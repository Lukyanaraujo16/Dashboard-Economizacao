import type { AuthMeResponse } from '../../auth/types';
import { authSupportEnterPath, authSupportExitPath } from '../../lib/api-config';
import { parseAuthMeResponse, readJsonBody } from './me';

export class SupportModeRequestError extends Error {
  readonly httpStatus?: number;

  constructor(
    message: string,
    options?: { readonly httpStatus?: number; readonly cause?: unknown },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'SupportModeRequestError';
    this.httpStatus = options?.httpStatus;
  }
}

async function requestSupportMode(path: string, body?: object): Promise<AuthMeResponse> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
  } catch (cause) {
    throw new SupportModeRequestError('Não foi possível alterar o modo suporte. Tente novamente.', {
      cause,
    });
  }

  const responseBody = await readJsonBody(response);
  const session = parseAuthMeResponse(responseBody);
  if (!response.ok || !session) {
    throw new SupportModeRequestError('Não foi possível alterar o modo suporte. Tente novamente.', {
      httpStatus: response.status,
    });
  }
  return session;
}

export function enterSupportMode(tenantId: string): Promise<AuthMeResponse> {
  return requestSupportMode(authSupportEnterPath(), { tenantId });
}

export function exitSupportMode(): Promise<AuthMeResponse> {
  return requestSupportMode(authSupportExitPath());
}
