import type { PrismaClient } from '../../../generated/prisma/client.js';
import { BrandingDomainError } from '../domain/branding-domain-error.js';
import {
  normalizeUpsertTenantBrandingInput,
  resolveUpsertBrandColorSchemes,
  shouldPersistTenantBranding,
} from '../domain/branding-normalization.js';
import type { TenantBrandingRecord, UpsertTenantBrandingInput } from '../domain/types.js';
import { mapTenantBrandingRecord, toPrismaJsonColorOverrides } from './mappers.js';

export type TenantBrandingRepository = {
  findByTenantId(tenantId: string): Promise<TenantBrandingRecord | null>;
  upsert(tenantId: string, input: UpsertTenantBrandingInput): Promise<TenantBrandingRecord | null>;
  deleteByTenantId(tenantId: string): Promise<void>;
};

async function assertTenantExists(prisma: PrismaClient, tenantId: string): Promise<void> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true },
  });

  if (!tenant) {
    throw new BrandingDomainError('TENANT_NOT_FOUND', 'Empresa não encontrada.');
  }
}

export function createTenantBrandingRepository(prisma: PrismaClient): TenantBrandingRepository {
  return {
    async findByTenantId(tenantId) {
      const row = await prisma.tenantBranding.findUnique({
        where: { tenantId },
      });
      return row ? mapTenantBrandingRecord(row) : null;
    },

    async upsert(tenantId, input) {
      await assertTenantExists(prisma, tenantId);

      const normalized = normalizeUpsertTenantBrandingInput(input);
      const existing = await prisma.tenantBranding.findUnique({
        where: { tenantId },
      });

      const resolved = resolveUpsertBrandColorSchemes(
        existing ? mapTenantBrandingRecord(existing) : { lightColors: null, darkColors: null },
        normalized,
      );

      if (!shouldPersistTenantBranding(resolved.lightColors, resolved.darkColors)) {
        if (existing) {
          await prisma.tenantBranding.delete({ where: { tenantId } });
        }
        return null;
      }

      const data = {
        lightColors: toPrismaJsonColorOverrides(resolved.lightColors),
        darkColors: toPrismaJsonColorOverrides(resolved.darkColors),
      };

      const row = existing
        ? await prisma.tenantBranding.update({
            where: { tenantId },
            data,
          })
        : await prisma.tenantBranding.create({
            data: {
              tenantId,
              ...data,
            },
          });

      return mapTenantBrandingRecord(row);
    },

    async deleteByTenantId(tenantId) {
      await assertTenantExists(prisma, tenantId);

      const existing = await prisma.tenantBranding.findUnique({
        where: { tenantId },
        select: { id: true },
      });

      if (!existing) {
        return;
      }

      await prisma.tenantBranding.delete({ where: { tenantId } });
    },
  };
}
