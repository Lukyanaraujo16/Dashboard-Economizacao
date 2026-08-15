import type { BrandColorOverrides } from '../domain/types.js';
import type { TenantBrandingRecord } from '../domain/types.js';
import { toPublicLogoUrl } from './to-public-branding-response.js';

export type CurrentBrandingScope = 'platform' | 'tenant';

export type PublicCurrentBrandingResponse = {
  readonly scope: CurrentBrandingScope;
  readonly tenantId: string | null;
  readonly name: string;
  readonly logoUrl: string | null;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
  readonly updatedAt: string | null;
};

export const PLATFORM_BRAND_NAME = 'Economização';

export function toPlatformCurrentBrandingResponse(): PublicCurrentBrandingResponse {
  return {
    scope: 'platform',
    tenantId: null,
    name: PLATFORM_BRAND_NAME,
    logoUrl: null,
    light: null,
    dark: null,
    updatedAt: null,
  };
}

export function toTenantCurrentBrandingResponse(input: {
  readonly tenantId: string;
  readonly displayName: string;
  readonly record: TenantBrandingRecord | null;
}): PublicCurrentBrandingResponse {
  return {
    scope: 'tenant',
    tenantId: input.tenantId,
    name: input.displayName,
    logoUrl: toPublicLogoUrl(input.record?.logoFileId),
    light: input.record?.lightColors ?? null,
    dark: input.record?.darkColors ?? null,
    updatedAt: input.record?.updatedAt.toISOString() ?? null,
  };
}
