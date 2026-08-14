import type { BrandColorOverrides, TenantBrandingRecord } from '../domain/types.js';

export type PublicTenantBrandingResponse = {
  readonly tenantId: string;
  readonly light: BrandColorOverrides | null;
  readonly dark: BrandColorOverrides | null;
  readonly createdAt: string | null;
  readonly updatedAt: string | null;
};

export function toPublicBrandingResponse(
  tenantId: string,
  record: TenantBrandingRecord | null,
): PublicTenantBrandingResponse {
  if (!record) {
    return {
      tenantId,
      light: null,
      dark: null,
      createdAt: null,
      updatedAt: null,
    };
  }

  return {
    tenantId: record.tenantId,
    light: record.lightColors,
    dark: record.darkColors,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}
