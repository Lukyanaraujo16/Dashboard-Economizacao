import { brandingCurrentPath, brandingPlatformPath } from '../../lib/api-config';
import type { CurrentBrandColorOverrides, CurrentBranding } from './current.types';
import { BrandingCurrentRequestError } from './current.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly requestId?: string;
  };
};

const ALLOWED_TOKENS = new Set(['primary', 'onPrimary', 'secondary', 'accent']);

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

function isColorOverrides(value: unknown): value is CurrentBrandColorOverrides {
  if (value === null) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).every(
    ([key, color]) => ALLOWED_TOKENS.has(key) && typeof color === 'string',
  );
}

function isCurrentBranding(value: unknown): value is CurrentBranding {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.scope === 'platform' || value.scope === 'tenant') &&
    (value.tenantId === null || typeof value.tenantId === 'string') &&
    typeof value.name === 'string' &&
    (value.logoUrl === null || typeof value.logoUrl === 'string') &&
    (value.iconUrl === null || typeof value.iconUrl === 'string') &&
    (value.faviconUrl === null || typeof value.faviconUrl === 'string') &&
    isColorOverrides(value.light) &&
    isColorOverrides(value.dark) &&
    (value.updatedAt === null || typeof value.updatedAt === 'string')
  );
}

function toFailure(response: Response, body: unknown): BrandingCurrentRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const message =
    envelope?.error?.message ?? 'Não foi possível carregar a aparência. Usando padrão.';

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new BrandingCurrentRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new BrandingCurrentRequestError('forbidden', message, {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  return new BrandingCurrentRequestError('unavailable', message, {
    httpStatus: response.status,
    code,
    requestId,
  });
}

async function fetchBranding(path: string): Promise<CurrentBranding> {
  let response: Response;

  try {
    response = await fetch(path, {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  } catch (cause) {
    throw new BrandingCurrentRequestError(
      'unavailable',
      'Não foi possível carregar a aparência. Usando padrão.',
      { cause },
    );
  }

  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toFailure(response, body);
  }

  if (!isCurrentBranding(body)) {
    throw new BrandingCurrentRequestError(
      'invalid_response',
      'Não foi possível carregar a aparência. Usando padrão.',
      { httpStatus: response.status },
    );
  }

  return body;
}

/**
 * Branding visual da sessão atual (cookie HttpOnly; sem tenantId no client).
 */
export async function getCurrentBranding(): Promise<CurrentBranding> {
  return fetchBranding(brandingCurrentPath());
}

/**
 * Branding público da plataforma (GET /branding/platform).
 * Usado no login e bootstrap sem sessão autenticada.
 */
export async function getPublicPlatformBranding(): Promise<CurrentBranding> {
  return fetchBranding(brandingPlatformPath());
}
