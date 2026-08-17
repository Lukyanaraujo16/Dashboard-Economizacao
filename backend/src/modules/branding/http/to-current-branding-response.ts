import type { BrandColorOverrides, PlatformBrandingRecord } from '../domain/types.js';
import type { TenantBrandingRecord } from '../domain/types.js';
import { mergeBrandColorOverrides } from '../domain/color-validation.js';
import { toPublicLogoUrl } from './to-public-branding-response.js';

export type CurrentBrandingScope = 'platform' | 'tenant';

export type PublicCurrentBrandingResponse = {
  readonly scope: CurrentBrandingScope;
  readonly tenantId: string | null;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly faviconUrl: string | null;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
  readonly updatedAt: string | null;
};

export const PLATFORM_BRAND_NAME = 'Economização';

/**
 * DTO de runtime de plataforma a partir do singleton persistido.
 * Sem registro → Theme Default (nome Economização, assets/cores null).
 */
export function toPlatformCurrentBrandingResponse(
  record: PlatformBrandingRecord | null = null,
): PublicCurrentBrandingResponse {
  if (!record) {
    return {
      scope: 'platform',
      tenantId: null,
      name: PLATFORM_BRAND_NAME,
      logoUrl: null,
      faviconUrl: null,
      light: null,
      dark: null,
      updatedAt: null,
    };
  }

  return {
    scope: 'platform',
    tenantId: null,
    name: record.name,
    logoUrl: toPublicLogoUrl(record.logoFileId),
    faviconUrl: toPublicLogoUrl(record.faviconFileId),
    light: record.lightColors,
    dark: record.darkColors,
    updatedAt: record.updatedAt.toISOString(),
  };
}

/**
 * Tenant → Platform → Theme Default.
 * Nome permanece o displayName da empresa; logo/cores caem para a plataforma quando ausentes.
 */
export function toTenantCurrentBrandingResponse(input: {
  readonly tenantId: string;
  readonly displayName: string;
  readonly record: TenantBrandingRecord | null;
  readonly platform: PublicCurrentBrandingResponse;
}): PublicCurrentBrandingResponse {
  const tenantLogo = toPublicLogoUrl(input.record?.logoFileId);
  const light = resolveLayeredOverrides(input.platform.light, input.record?.lightColors ?? null);
  const dark = resolveLayeredOverrides(input.platform.dark, input.record?.darkColors ?? null);
  const updatedAt = input.record?.updatedAt.toISOString() ?? input.platform.updatedAt ?? null;

  return {
    scope: 'tenant',
    tenantId: input.tenantId,
    name: input.displayName,
    logoUrl: tenantLogo ?? input.platform.logoUrl,
    faviconUrl: input.platform.faviconUrl,
    light,
    dark,
    updatedAt,
  };
}

function resolveLayeredOverrides(
  platform: BrandColorOverrides | null,
  tenant: BrandColorOverrides | null,
): BrandColorOverrides | null {
  if (!tenant || Object.keys(tenant).length === 0) {
    return platform;
  }
  if (!platform || Object.keys(platform).length === 0) {
    return tenant;
  }
  return mergeBrandColorOverrides(platform, tenant);
}
