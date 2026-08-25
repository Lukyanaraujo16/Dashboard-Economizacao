import { adminTenantBrandingIconPath, adminTenantBrandingLogoPath, adminTenantBrandingPath } from '../../lib/api-config';
import type {
  BrandColorOverrides,
  BrandColorToken,
  BrandingErrorDetail,
  CompanyBranding,
  UpdateCompanyBrandingInput,
} from './branding.types';
import { ALLOWED_BRAND_COLOR_TOKENS, BrandingRequestError } from './branding.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: ReadonlyArray<BrandingErrorDetail>;
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

function isBrandColorOverrides(value: unknown): value is BrandColorOverrides {
  if (value === null) {
    return true;
  }
  if (!isRecord(value)) {
    return false;
  }
  return Object.entries(value).every(([key, color]) => {
    return (
      (ALLOWED_BRAND_COLOR_TOKENS as readonly string[]).includes(key) && typeof color === 'string'
    );
  });
}

function isCompanyBranding(value: unknown): value is CompanyBranding {
  if (!isRecord(value)) {
    return false;
  }
  return (
    typeof value.tenantId === 'string' &&
    (value.logoUrl === null || typeof value.logoUrl === 'string') &&
    (value.iconUrl === null || typeof value.iconUrl === 'string') &&
    isBrandColorOverrides(value.light) &&
    isBrandColorOverrides(value.dark) &&
    (value.createdAt === null || typeof value.createdAt === 'string') &&
    (value.updatedAt === null || typeof value.updatedAt === 'string')
  );
}

function toBrandingFailure(response: Response, body: unknown): BrandingRequestError {
  const envelope = isRecord(body) ? (body as ErrorEnvelope) : undefined;
  const code = envelope?.error?.code;
  const requestId = envelope?.error?.requestId;
  const details = envelope?.error?.details;
  const message =
    envelope?.error?.message ?? 'Não foi possível concluir a operação. Tente novamente.';

  if (response.status === 401 || code === 'UNAUTHENTICATED') {
    return new BrandingRequestError(
      'unauthenticated',
      'Sua sessão expirou. Faça login novamente.',
      { httpStatus: response.status, code, requestId },
    );
  }

  if (response.status === 403 || code === 'FORBIDDEN') {
    return new BrandingRequestError('forbidden', 'Você não tem permissão para esta operação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 404 || code === 'NOT_FOUND') {
    return new BrandingRequestError('not_found', 'Empresa não encontrada.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  if (response.status === 413 || code === 'PAYLOAD_TOO_LARGE') {
    return new BrandingRequestError(
      'payload_too_large',
      'O arquivo é muito grande. Use uma imagem de até 2 MB.',
      { httpStatus: response.status, code, requestId, details },
    );
  }

  if (response.status === 422 || (response.status === 400 && code === 'VALIDATION_ERROR')) {
    const kind = response.status === 400 ? 'bad_request' : 'validation';
    return new BrandingRequestError(
      kind,
      kind === 'bad_request'
        ? 'Não foi possível processar a solicitação.'
        : message || 'Verifique os dados informados.',
      { httpStatus: response.status, code, requestId, details },
    );
  }

  if (response.status === 400) {
    return new BrandingRequestError('bad_request', 'Não foi possível processar a solicitação.', {
      httpStatus: response.status,
      code,
      requestId,
    });
  }

  return new BrandingRequestError(
    'unavailable',
    'Não foi possível conectar ao serviço. Tente novamente.',
    { httpStatus: response.status, code, requestId },
  );
}

async function brandingFetch(url: string, init: RequestInit): Promise<Response> {
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
    throw new BrandingRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { cause },
    );
  }
}

export async function getBranding(companyId: string): Promise<CompanyBranding> {
  const response = await brandingFetch(adminTenantBrandingPath(companyId), { method: 'GET' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toBrandingFailure(response, body);
  }

  if (!isCompanyBranding(body)) {
    throw new BrandingRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

/**
 * Atualiza overrides. Quando o estado desejado remove tokens existentes,
 * limpa o scheme (`null`) e reenvia o restante — o backend faz merge parcial.
 */
export async function updateBranding(
  companyId: string,
  input: UpdateCompanyBrandingInput,
  current?: Pick<CompanyBranding, 'light' | 'dark'>,
): Promise<CompanyBranding> {
  let latest: CompanyBranding | null = null;

  async function patchScheme(
    scheme: 'light' | 'dark',
    desired: BrandColorOverrides | null | undefined,
  ): Promise<void> {
    if (desired === undefined) {
      return;
    }

    const existing = current?.[scheme] ?? null;
    const desiredKeys = desired ? Object.keys(desired) : [];
    const existingKeys = existing ? Object.keys(existing) : [];
    const removesKeys =
      desiredKeys.length === 0
        ? existingKeys.length > 0
        : existingKeys.some((key) => !(key in (desired ?? {})));

    if (removesKeys) {
      const clearResponse = await brandingFetch(adminTenantBrandingPath(companyId), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [scheme]: null }),
      });
      const clearBody = await readJsonBody(clearResponse);
      if (!clearResponse.ok) {
        throw toBrandingFailure(clearResponse, clearBody);
      }
      if (!isCompanyBranding(clearBody)) {
        throw new BrandingRequestError(
          'unavailable',
          'Não foi possível conectar ao serviço. Tente novamente.',
          { httpStatus: clearResponse.status },
        );
      }
      latest = clearBody;
    }

    if (!desired || desiredKeys.length === 0) {
      return;
    }

    const response = await brandingFetch(adminTenantBrandingPath(companyId), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [scheme]: desired }),
    });
    const body = await readJsonBody(response);
    if (!response.ok) {
      throw toBrandingFailure(response, body);
    }
    if (!isCompanyBranding(body)) {
      throw new BrandingRequestError(
        'unavailable',
        'Não foi possível conectar ao serviço. Tente novamente.',
        { httpStatus: response.status },
      );
    }
    latest = body;
  }

  await patchScheme('light', input.light);
  await patchScheme('dark', input.dark);

  if (!latest) {
    return getBranding(companyId);
  }

  return latest;
}

/**
 * Substitui o estado de cores desejado, lendo o branding atual para permitir
 * limpar tokens individuais apesar do merge parcial do PATCH.
 */
export async function replaceBrandingColors(
  companyId: string,
  input: UpdateCompanyBrandingInput,
): Promise<CompanyBranding> {
  const current = await getBranding(companyId);
  return updateBranding(companyId, input, current);
}

/** Restaura aparência completa (cores + logo) para o padrão da plataforma. */
export async function resetBranding(companyId: string): Promise<void> {
  const response = await brandingFetch(adminTenantBrandingPath(companyId), { method: 'DELETE' });

  if (response.status === 204) {
    return;
  }

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toBrandingFailure(response, body);
  }
}

export async function uploadLogo(companyId: string, file: File): Promise<CompanyBranding> {
  const formData = new FormData();
  formData.append('logo', file);

  // Não definir Content-Type: o browser inclui o boundary do multipart.
  const response = await brandingFetch(adminTenantBrandingLogoPath(companyId), {
    method: 'POST',
    body: formData,
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toBrandingFailure(response, body);
  }

  if (!isCompanyBranding(body)) {
    throw new BrandingRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function deleteLogo(companyId: string): Promise<void> {
  const response = await brandingFetch(adminTenantBrandingLogoPath(companyId), {
    method: 'DELETE',
  });

  if (response.status === 204) {
    return;
  }

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toBrandingFailure(response, body);
  }
}

export async function uploadIcon(companyId: string, file: File): Promise<CompanyBranding> {
  const formData = new FormData();
  formData.append('icon', file);

  const response = await brandingFetch(adminTenantBrandingIconPath(companyId), {
    method: 'POST',
    body: formData,
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toBrandingFailure(response, body);
  }

  if (!isCompanyBranding(body)) {
    throw new BrandingRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function deleteIcon(companyId: string): Promise<void> {
  const response = await brandingFetch(adminTenantBrandingIconPath(companyId), {
    method: 'DELETE',
  });

  if (response.status === 204) {
    return;
  }

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toBrandingFailure(response, body);
  }
}

export function normalizeHexColor(value: string): string | null {
  const trimmed = value.trim();
  if (!/^#[0-9A-Fa-f]{6}$/.test(trimmed)) {
    return null;
  }
  return trimmed.toUpperCase();
}

export function isAllowedBrandColorToken(value: string): value is BrandColorToken {
  return (ALLOWED_BRAND_COLOR_TOKENS as readonly string[]).includes(value);
}
