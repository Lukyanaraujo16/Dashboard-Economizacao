import type { BrandColorOverrides, PlatformBrandingRecord } from '../domain/types.js';
import { toPublicLogoUrl } from './to-public-branding-response.js';

/**
 * DTO público administrativo de Platform Branding.
 * Sem registro persistido: campos null — não materializa Theme Default.
 */
export type PublicPlatformBrandingResponse = {
  readonly name: string | null;
  readonly logoUrl: string | null;
  readonly faviconUrl: string | null;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

export function toPublicPlatformBrandingResponse(
  record: PlatformBrandingRecord | null,
): PublicPlatformBrandingResponse {
  if (!record) {
    return {
      name: null,
      logoUrl: null,
      faviconUrl: null,
      light: null,
      dark: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    name: record.name,
    logoUrl: toPublicLogoUrl(record.logoFileId),
    faviconUrl: toPublicLogoUrl(record.faviconFileId),
    light: record.lightColors,
    dark: record.darkColors,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
