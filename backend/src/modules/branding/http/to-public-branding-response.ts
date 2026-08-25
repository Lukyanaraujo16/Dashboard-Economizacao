import type { BrandColorOverrides, TenantBrandingRecord } from '../domain/types.js';

export type PublicTenantBrandingResponse = {
  readonly tenantId: string;
  readonly logoUrl: string | null;
  readonly iconUrl: string | null;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

export function toPublicLogoUrl(fileId: string | null | undefined): string | null {
  return fileId ? `/files/${fileId}` : null;
}

export function toPublicBrandingResponse(
  tenantId: string,
  record: TenantBrandingRecord | null,
): PublicTenantBrandingResponse {
  if (!record) {
    return {
      tenantId,
      logoUrl: null,
      iconUrl: null,
      light: null,
      dark: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    tenantId: record.tenantId,
    logoUrl: toPublicLogoUrl(record.logoFileId),
    iconUrl: toPublicLogoUrl(record.iconFileId),
    light: record.lightColors,
    dark: record.darkColors,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
