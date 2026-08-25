import {
  adminPlatformBrandingFaviconPath,
  adminPlatformBrandingIconPath,
  adminPlatformBrandingLogoPath,
  adminPlatformBrandingPath,
} from '../../lib/api-config';
import type { BrandColorOverrides, BrandingErrorDetail } from './branding.types';
import { ALLOWED_BRAND_COLOR_TOKENS, BrandingRequestError } from './branding.types';
import type { PlatformBranding, UpdatePlatformBrandingInput } from './platform-branding.types';

type ErrorEnvelope = {
  readonly error?: {
    readonly code?: string;
    readonly message?: string;
    readonly details?: ReadonlyArray<BrandingErrorDetail>;
    readonly requestId?: string;
  };
};

type PayloadSizeContext = 'logo' | 'icon' | 'favicon' | 'generic';

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

function isPlatformBranding(value: unknown): value is PlatformBranding {
  if (!isRecord(value)) {
    return false;
  }
  return (
    (value.name === null || typeof value.name === 'string') &&
    (value.logoUrl === null || typeof value.logoUrl === 'string') &&
    (value.iconUrl === null || typeof value.iconUrl === 'string') &&
    (value.faviconUrl === null || typeof value.faviconUrl === 'string') &&
    isBrandColorOverrides(value.light) &&
    isBrandColorOverrides(value.dark) &&
    (value.createdAt === null || typeof value.createdAt === 'string') &&
    (value.updatedAt === null || typeof value.updatedAt === 'string')
  );
}

function payloadTooLargeMessage(context: PayloadSizeContext): string {
  if (context === 'favicon') {
    return 'O arquivo é muito grande. Use uma imagem de até 512 KB.';
  }
  if (context === 'logo' || context === 'icon') {
    return 'O arquivo é muito grande. Use uma imagem de até 2 MB.';
  }
  return 'O arquivo é muito grande.';
}

function toPlatformBrandingFailure(
  response: Response,
  body: unknown,
  payloadContext: PayloadSizeContext = 'generic',
): BrandingRequestError {
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

  if (response.status === 413 || code === 'PAYLOAD_TOO_LARGE') {
    return new BrandingRequestError('payload_too_large', payloadTooLargeMessage(payloadContext), {
      httpStatus: response.status,
      code,
      requestId,
      details,
    });
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

async function platformBrandingFetch(url: string, init: RequestInit): Promise<Response> {
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

export async function getPlatformBranding(): Promise<PlatformBranding> {
  const response = await platformBrandingFetch(adminPlatformBrandingPath(), { method: 'GET' });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toPlatformBrandingFailure(response, body);
  }

  if (!isPlatformBranding(body)) {
    throw new BrandingRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

/**
 * Atualiza name / light / dark. Quando o estado desejado remove tokens,
 * limpa o scheme (`null`) e reenvia o restante — o backend faz merge parcial.
 */
export async function updatePlatformBranding(
  input: UpdatePlatformBrandingInput,
  current?: Pick<PlatformBranding, 'name' | 'light' | 'dark'>,
): Promise<PlatformBranding> {
  let latest: PlatformBranding | null = null;
  let schemeBaseline: Pick<PlatformBranding, 'name' | 'light' | 'dark'> | undefined = current;

  async function patchScheme(
    scheme: 'light' | 'dark',
    desired: BrandColorOverrides | null | undefined,
  ): Promise<void> {
    if (desired === undefined) {
      return;
    }

    const existing = schemeBaseline?.[scheme] ?? null;
    const desiredKeys = desired ? Object.keys(desired) : [];
    const existingKeys = existing ? Object.keys(existing) : [];
    const removesKeys =
      desiredKeys.length === 0
        ? existingKeys.length > 0
        : existingKeys.some((key) => !(key in (desired ?? {})));

    if (removesKeys) {
      const clearResponse = await platformBrandingFetch(adminPlatformBrandingPath(), {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [scheme]: null }),
      });
      const clearBody = await readJsonBody(clearResponse);
      if (!clearResponse.ok) {
        throw toPlatformBrandingFailure(clearResponse, clearBody);
      }
      if (!isPlatformBranding(clearBody)) {
        throw new BrandingRequestError(
          'unavailable',
          'Não foi possível conectar ao serviço. Tente novamente.',
          { httpStatus: clearResponse.status },
        );
      }
      latest = clearBody;
      schemeBaseline = clearBody;
    }

    if (!desired || desiredKeys.length === 0) {
      return;
    }

    const response = await platformBrandingFetch(adminPlatformBrandingPath(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ [scheme]: desired }),
    });
    const body = await readJsonBody(response);
    if (!response.ok) {
      throw toPlatformBrandingFailure(response, body);
    }
    if (!isPlatformBranding(body)) {
      throw new BrandingRequestError(
        'unavailable',
        'Não foi possível conectar ao serviço. Tente novamente.',
        { httpStatus: response.status },
      );
    }
    latest = body;
    schemeBaseline = body;
  }

  if (input.name !== undefined) {
    const response = await platformBrandingFetch(adminPlatformBrandingPath(), {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name }),
    });
    const body = await readJsonBody(response);
    if (!response.ok) {
      throw toPlatformBrandingFailure(response, body);
    }
    if (!isPlatformBranding(body)) {
      throw new BrandingRequestError(
        'unavailable',
        'Não foi possível conectar ao serviço. Tente novamente.',
        { httpStatus: response.status },
      );
    }
    latest = body;
    schemeBaseline = body;
  }

  await patchScheme('light', input.light);
  await patchScheme('dark', input.dark);

  if (!latest) {
    return getPlatformBranding();
  }

  return latest;
}

/**
 * Salva nome + cores. Na primeira persistência, o nome vai no primeiro PATCH
 * (obrigatório no backend) antes das cores.
 *
 * @deprecated Preferir `savePlatformAppearanceChanges` para o fluxo unificado.
 */
export async function savePlatformAppearance(input: {
  readonly name: string;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
}): Promise<PlatformBranding> {
  const result = await savePlatformAppearanceChanges({
    name: input.name,
    light: input.light,
    dark: input.dark,
  });
  if (!result.ok) {
    throw result.error ?? new BrandingRequestError('unavailable', 'Não foi possível salvar.');
  }
  return result.branding;
}

export type PlatformAppearanceSaveStep = 'logo' | 'icon' | 'favicon' | 'fields';

export type PlatformAppearanceSaveChanges = {
  readonly name?: string;
  readonly light?: BrandColorOverrides | null;
  readonly dark?: BrandColorOverrides | null;
  readonly logoFile?: File;
  readonly removeLogo?: boolean;
  readonly iconFile?: File;
  readonly removeIcon?: boolean;
  readonly faviconFile?: File;
  readonly removeFavicon?: boolean;
};

export type PlatformAppearanceSaveResult = {
  readonly ok: boolean;
  readonly branding: PlatformBranding;
  readonly completed: readonly PlatformAppearanceSaveStep[];
  readonly failedStep?: PlatformAppearanceSaveStep;
  readonly error?: BrandingRequestError;
};

/**
 * Orquestra alterações pendentes da tela Aparência da Plataforma.
 *
 * Ordem segura:
 * 1. logo (upload ou remoção)
 * 2. favicon (upload ou remoção)
 * 3. PATCH de name/light/dark apenas se necessário
 *
 * Em falha parcial: reidrata com GET e devolve passos concluídos sem fingir sucesso total.
 */
export async function savePlatformAppearanceChanges(
  changes: PlatformAppearanceSaveChanges,
): Promise<PlatformAppearanceSaveResult> {
  const completed: PlatformAppearanceSaveStep[] = [];
  let branding = await getPlatformBranding();

  try {
    if (changes.logoFile) {
      branding = await uploadPlatformLogo(changes.logoFile);
      completed.push('logo');
    } else if (changes.removeLogo) {
      await deletePlatformLogo();
      branding = await getPlatformBranding();
      completed.push('logo');
    }

    if (changes.iconFile) {
      branding = await uploadPlatformIcon(changes.iconFile);
      completed.push('icon');
    } else if (changes.removeIcon) {
      await deletePlatformIcon();
      branding = await getPlatformBranding();
      completed.push('icon');
    }

    if (changes.faviconFile) {
      branding = await uploadPlatformFavicon(changes.faviconFile);
      completed.push('favicon');
    } else if (changes.removeFavicon) {
      await deletePlatformFavicon();
      branding = await getPlatformBranding();
      completed.push('favicon');
    }

    const hasFields =
      changes.name !== undefined || changes.light !== undefined || changes.dark !== undefined;

    if (hasFields) {
      const firstPersist = branding.createdAt === null && branding.name === null;
      if (firstPersist && changes.name === undefined) {
        throw new BrandingRequestError(
          'validation',
          'Informe o nome da plataforma antes de salvar as cores.',
        );
      }

      branding = await updatePlatformBranding(
        {
          ...(changes.name !== undefined || firstPersist ? { name: changes.name! } : {}),
          ...(changes.light !== undefined ? { light: changes.light } : {}),
          ...(changes.dark !== undefined ? { dark: changes.dark } : {}),
        },
        branding,
      );
      completed.push('fields');
    }

    return { ok: true, branding, completed };
  } catch (error) {
    const brandingAfterFailure = await getPlatformBranding().catch(() => branding);
    const brandingError =
      error instanceof BrandingRequestError
        ? error
        : new BrandingRequestError(
            'unavailable',
            'Não foi possível concluir o salvamento. Tente novamente.',
            { cause: error },
          );

    let failedStep: PlatformAppearanceSaveStep = 'fields';
    if (!completed.includes('logo') && (changes.logoFile || changes.removeLogo)) {
      failedStep = 'logo';
    } else if (!completed.includes('icon') && (changes.iconFile || changes.removeIcon)) {
      failedStep = 'icon';
    } else if (!completed.includes('favicon') && (changes.faviconFile || changes.removeFavicon)) {
      failedStep = 'favicon';
    }

    return {
      ok: false,
      branding: brandingAfterFailure,
      completed,
      failedStep,
      error: brandingError,
    };
  }
}

export async function resetPlatformBranding(): Promise<void> {
  const response = await platformBrandingFetch(adminPlatformBrandingPath(), { method: 'DELETE' });

  if (response.status === 204) {
    return;
  }

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toPlatformBrandingFailure(response, body);
  }
}

export async function uploadPlatformLogo(file: File): Promise<PlatformBranding> {
  const formData = new FormData();
  formData.append('logo', file);

  const response = await platformBrandingFetch(adminPlatformBrandingLogoPath(), {
    method: 'POST',
    body: formData,
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toPlatformBrandingFailure(response, body, 'logo');
  }

  if (!isPlatformBranding(body)) {
    throw new BrandingRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function deletePlatformLogo(): Promise<void> {
  const response = await platformBrandingFetch(adminPlatformBrandingLogoPath(), {
    method: 'DELETE',
  });

  if (response.status === 204) {
    return;
  }

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toPlatformBrandingFailure(response, body, 'logo');
  }
}

export async function uploadPlatformIcon(file: File): Promise<PlatformBranding> {
  const formData = new FormData();
  formData.append('icon', file);

  const response = await platformBrandingFetch(adminPlatformBrandingIconPath(), {
    method: 'POST',
    body: formData,
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toPlatformBrandingFailure(response, body, 'icon');
  }

  if (!isPlatformBranding(body)) {
    throw new BrandingRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function deletePlatformIcon(): Promise<void> {
  const response = await platformBrandingFetch(adminPlatformBrandingIconPath(), {
    method: 'DELETE',
  });

  if (response.status === 204) {
    return;
  }

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toPlatformBrandingFailure(response, body, 'icon');
  }
}

export async function uploadPlatformFavicon(file: File): Promise<PlatformBranding> {
  const formData = new FormData();
  formData.append('favicon', file);

  const response = await platformBrandingFetch(adminPlatformBrandingFaviconPath(), {
    method: 'POST',
    body: formData,
  });
  const body = await readJsonBody(response);

  if (!response.ok) {
    throw toPlatformBrandingFailure(response, body, 'favicon');
  }

  if (!isPlatformBranding(body)) {
    throw new BrandingRequestError(
      'unavailable',
      'Não foi possível conectar ao serviço. Tente novamente.',
      { httpStatus: response.status },
    );
  }

  return body;
}

export async function deletePlatformFavicon(): Promise<void> {
  const response = await platformBrandingFetch(adminPlatformBrandingFaviconPath(), {
    method: 'DELETE',
  });

  if (response.status === 204) {
    return;
  }

  const body = await readJsonBody(response);
  if (!response.ok) {
    throw toPlatformBrandingFailure(response, body, 'favicon');
  }
}
