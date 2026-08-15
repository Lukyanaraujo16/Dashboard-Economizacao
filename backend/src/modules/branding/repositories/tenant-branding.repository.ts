import type { PrismaClient } from '../../../generated/prisma/client.js';
import { BrandingDomainError } from '../domain/branding-domain-error.js';
import {
  normalizeUpsertTenantBrandingInput,
  resolveUpsertBrandColorSchemes,
  shouldPersistTenantBranding,
} from '../domain/branding-normalization.js';
import type { TenantBrandingRecord, UpsertTenantBrandingInput } from '../domain/types.js';
import { mapTenantBrandingRecord, toPrismaJsonColorOverrides } from './mappers.js';

const brandingWithLogo = { logoFile: true } as const;

export type TenantBrandingRepository = {
  findByTenantId(tenantId: string): Promise<TenantBrandingRecord | null>;
  upsert(tenantId: string, input: UpsertTenantBrandingInput): Promise<TenantBrandingRecord | null>;
  setLogo(tenantId: string, logoFileId: string): Promise<TenantBrandingRecord>;
  clearLogo(tenantId: string): Promise<TenantBrandingRecord | null>;
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
        include: brandingWithLogo,
      });
      return row ? mapTenantBrandingRecord(row) : null;
    },

    async upsert(tenantId, input) {
      await assertTenantExists(prisma, tenantId);

      const normalized = normalizeUpsertTenantBrandingInput(input);
      const existing = await prisma.tenantBranding.findUnique({
        where: { tenantId },
        include: brandingWithLogo,
      });

      const resolved = resolveUpsertBrandColorSchemes(
        existing ? mapTenantBrandingRecord(existing) : { lightColors: null, darkColors: null },
        normalized,
      );

      const logoFileId = existing?.logoFileId ?? null;
      if (!shouldPersistTenantBranding(resolved.lightColors, resolved.darkColors, logoFileId)) {
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
            include: brandingWithLogo,
          })
        : await prisma.tenantBranding.create({
            data: {
              tenantId,
              ...data,
            },
            include: brandingWithLogo,
          });

      return mapTenantBrandingRecord(row);
    },

    async setLogo(tenantId, logoFileId) {
      await assertTenantExists(prisma, tenantId);

      const file = await prisma.storedFile.findUnique({
        where: { id: logoFileId },
        select: { id: true, tenantId: true, fileType: true },
      });

      if (!file || file.tenantId !== tenantId || file.fileType !== 'TENANT_LOGO') {
        throw new BrandingDomainError('BRANDING_FILE_NOT_FOUND', 'Arquivo de logo não encontrado.');
      }

      const existing = await prisma.tenantBranding.findUnique({ where: { tenantId } });
      const row = existing
        ? await prisma.tenantBranding.update({
            where: { tenantId },
            data: { logoFileId },
            include: brandingWithLogo,
          })
        : await prisma.tenantBranding.create({
            data: { tenantId, logoFileId },
            include: brandingWithLogo,
          });

      return mapTenantBrandingRecord(row);
    },

    async clearLogo(tenantId) {
      await assertTenantExists(prisma, tenantId);

      const existing = await prisma.tenantBranding.findUnique({
        where: { tenantId },
        include: brandingWithLogo,
      });

      if (!existing) {
        return null;
      }

      const mapped = mapTenantBrandingRecord(existing);
      if (!shouldPersistTenantBranding(mapped.lightColors, mapped.darkColors, null)) {
        await prisma.tenantBranding.delete({ where: { tenantId } });
        return null;
      }

      const row = await prisma.tenantBranding.update({
        where: { tenantId },
        data: { logoFileId: null },
        include: brandingWithLogo,
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
