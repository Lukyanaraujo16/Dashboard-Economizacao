import type {
  PlatformBranding as PlatformBrandingRow,
  StoredFile as StoredFileRow,
  TenantBranding as TenantBrandingRow,
} from '../../../generated/prisma/client.js';
import { Prisma } from '../../../generated/prisma/client.js';
import { parseBrandColorOverrides } from '../domain/color-validation.js';
import type {
  BrandColorOverrides,
  PlatformBrandingRecord,
  StoredFileRecord,
  TenantBrandingRecord,
} from '../domain/types.js';

type TenantBrandingWithAssets = TenantBrandingRow & {
  readonly logoFile?: StoredFileRow | null;
  readonly iconFile?: StoredFileRow | null;
};

type PlatformBrandingWithAssets = PlatformBrandingRow & {
  readonly logoFile?: StoredFileRow | null;
  readonly iconFile?: StoredFileRow | null;
  readonly faviconFile?: StoredFileRow | null;
};

function mapStoredColorOverrides(value: unknown, fieldLabel: string): BrandColorOverrides | null {
  if (value === null || value === undefined) {
    return null;
  }
  return parseBrandColorOverrides(value, fieldLabel);
}

export function mapStoredFileRecord(row: StoredFileRow): StoredFileRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    fileType: row.fileType,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    size: row.size,
    checksum: row.checksum,
    createdAt: row.createdAt,
  };
}

export function mapTenantBrandingRecord(row: TenantBrandingWithAssets): TenantBrandingRecord {
  const logoFile = row.logoFile ? mapStoredFileRecord(row.logoFile) : null;
  const iconFile = row.iconFile ? mapStoredFileRecord(row.iconFile) : null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    logoFileId: row.logoFileId,
    iconFileId: row.iconFileId,
    logoFile,
    iconFile,
    lightColors: mapStoredColorOverrides(row.lightColors, 'lightColors'),
    darkColors: mapStoredColorOverrides(row.darkColors, 'darkColors'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function mapPlatformBrandingRecord(row: PlatformBrandingWithAssets): PlatformBrandingRecord {
  return {
    id: row.id,
    name: row.name,
    logoFileId: row.logoFileId,
    iconFileId: row.iconFileId,
    faviconFileId: row.faviconFileId,
    logoFile: row.logoFile ? mapStoredFileRecord(row.logoFile) : null,
    iconFile: row.iconFile ? mapStoredFileRecord(row.iconFile) : null,
    faviconFile: row.faviconFile ? mapStoredFileRecord(row.faviconFile) : null,
    lightColors: mapStoredColorOverrides(row.lightColors, 'lightColors'),
    darkColors: mapStoredColorOverrides(row.darkColors, 'darkColors'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPrismaJsonColorOverrides(
  overrides: BrandColorOverrides | null,
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!overrides || Object.keys(overrides).length === 0) {
    return Prisma.DbNull;
  }
  return { ...overrides };
}
