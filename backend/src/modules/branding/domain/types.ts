import type { BrandColorTokenName } from './allowed-color-tokens.js';

export type BrandColorOverrides = Partial<Record<BrandColorTokenName, string>>;

export type StoredFileType =
  | 'TENANT_LOGO'
  | 'TENANT_ICON'
  | 'PLATFORM_LOGO'
  | 'PLATFORM_ICON'
  | 'PLATFORM_FAVICON';

export type StoredFileRecord = {
  readonly id: string;
  /** null = asset global da plataforma (PLATFORM_*). */
  readonly tenantId: string | null;
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
  readonly iconFileId: string | null;
  readonly logoFile: StoredFileRecord | null;
  readonly iconFile: StoredFileRecord | null;
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

export type PlatformBrandingRecord = {
  readonly id: string;
  readonly name: string;
  readonly logoFileId: string | null;
  readonly iconFileId: string | null;
  readonly faviconFileId: string | null;
  readonly logoFile: StoredFileRecord | null;
  readonly iconFile: StoredFileRecord | null;
  readonly faviconFile: StoredFileRecord | null;
  readonly lightColors: BrandColorOverrides | null;
  readonly darkColors: BrandColorOverrides | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type UpsertPlatformBrandingInput = {
  /** undefined = não altera; string = normaliza e persiste. Obrigatório na primeira criação. */
  readonly name?: string;
  /** undefined = não altera; null = limpa scheme; objeto = merge parcial de tokens. */
  readonly lightColors?: BrandColorOverrides | null;
  readonly darkColors?: BrandColorOverrides | null;
};
