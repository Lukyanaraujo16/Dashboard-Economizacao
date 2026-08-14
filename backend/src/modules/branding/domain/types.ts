import type { BrandColorTokenName } from './allowed-color-tokens.js';

export type BrandColorOverrides = Partial<Record<BrandColorTokenName, string>>;

export type TenantBrandingRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly lightColors: BrandColorOverrides | null;
  readonly darkColors: BrandColorOverrides | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UpsertTenantBrandingInput = {
  /** undefined = não altera; null = limpa scheme; objeto = merge parcial de tokens. */
  readonly lightColors?: BrandColorOverrides | null;
  readonly darkColors?: BrandColorOverrides | null;
};
