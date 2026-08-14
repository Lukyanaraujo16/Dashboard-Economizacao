import { Prisma } from '../../../generated/prisma/client.js';
import type { TenantBranding as TenantBrandingRow } from '../../../generated/prisma/client.js';
import { parseBrandColorOverrides } from '../domain/color-validation.js';
import type { TenantBrandingRecord } from '../domain/types.js';

function mapStoredColorOverrides(
  value: unknown,
  fieldLabel: string,
): TenantBrandingRecord['lightColors'] {
  if (value === null || value === undefined) {
    return null;
  }
  return parseBrandColorOverrides(value, fieldLabel);
}

export function mapTenantBrandingRecord(row: TenantBrandingRow): TenantBrandingRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    lightColors: mapStoredColorOverrides(row.lightColors, 'lightColors'),
    darkColors: mapStoredColorOverrides(row.darkColors, 'darkColors'),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function toPrismaJsonColorOverrides(
  overrides: TenantBrandingRecord['lightColors'],
): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (!overrides || Object.keys(overrides).length === 0) {
    return Prisma.DbNull;
  }
  return { ...overrides };
}
