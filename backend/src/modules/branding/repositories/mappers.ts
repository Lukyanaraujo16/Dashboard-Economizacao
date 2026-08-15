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

type TenantBrandingWithLogo = TenantBrandingRow & {
  readonly logoFile?: StoredFileRow | null;
};

type PlatformBrandingWithAssets = PlatformBrandingRow & {
  readonly logoFile?: StoredFileRow | null;
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

export function mapTenantBrandingRecord(row: TenantBrandingWithLogo): TenantBrandingRecord {
  const logoFile = row.logoFile ? mapStoredFileRecord(row.logoFile) : null;
  return {
    id: row.id,
    tenantId: row.tenantId,
    logoFileId: row.logoFileId,
    logoFile,
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
    faviconFileId: row.faviconFileId,
    logoFile: row.logoFile ? mapStoredFileRecord(row.logoFile) : null,
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
