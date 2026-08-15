import type { BrandColorTokenName } from './allowed-color-tokens.js';

export type BrandColorOverrides = Partial<Record<BrandColorTokenName, string>>;

export type StoredFileType = 'TENANT_LOGO';

export type StoredFileRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly fileType: StoredFileType;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum: string;
  readonly createdAt: Date;
};

export type TenantBrandingRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly logoFileId: string | null;
  readonly logoFile: StoredFileRecord | null;
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
