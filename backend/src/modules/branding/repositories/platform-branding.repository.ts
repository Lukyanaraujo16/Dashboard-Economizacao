import type { PrismaClient } from '../../../generated/prisma/client.js';
import { BrandingDomainError } from '../domain/branding-domain-error.js';
import {
  normalizeUpsertPlatformBrandingInput,
  resolveUpsertBrandColorSchemes,
} from '../domain/branding-normalization.js';
import { PLATFORM_BRANDING_SINGLETON_KEY } from '../domain/platform-brand-name.js';
import type { PlatformBrandingRecord, UpsertPlatformBrandingInput } from '../domain/types.js';
import { mapPlatformBrandingRecord, toPrismaJsonColorOverrides } from './mappers.js';

const brandingWithAssets = {
  logoFile: true,
  faviconFile: true,
} as const;

export type PlatformBrandingRepository = {
  /** Ausência de registro → null (fallback Theme Default no runtime futuro). */
  get(): Promise<PlatformBrandingRecord | null>;
  /**
   * Merge parcial de name/cores. Não altera logo/favicon (lifecycle de assets separado).
   * Primeira criação exige `name`.
   */
  upsert(input: UpsertPlatformBrandingInput): Promise<PlatformBrandingRecord>;
  /** Remove somente PlatformBranding. Não toca TenantBranding nem Theme Default. */
  reset(): Promise<void>;
  /** Anexa referência a StoredFile PLATFORM_LOGO global (sem upload nesta fase). */
  attachLogo(fileId: string): Promise<PlatformBrandingRecord>;
  attachFavicon(fileId: string): Promise<PlatformBrandingRecord>;
  clearLogo(): Promise<PlatformBrandingRecord | null>;
  clearFavicon(): Promise<PlatformBrandingRecord | null>;
};

async function requireExistingPlatformBranding(
  prisma: PrismaClient,
): Promise<PlatformBrandingRecord> {
  const row = await prisma.platformBranding.findUnique({
    where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
    include: brandingWithAssets,
  });
  if (!row) {
    throw new BrandingDomainError(
      'PLATFORM_BRANDING_NOT_FOUND',
      'Branding da plataforma ainda não foi configurado.',
    );
  }
  return mapPlatformBrandingRecord(row);
}

async function assertPlatformAsset(
  prisma: PrismaClient,
  fileId: string,
  expectedType: 'PLATFORM_LOGO' | 'PLATFORM_FAVICON',
): Promise<void> {
  const file = await prisma.storedFile.findUnique({
    where: { id: fileId },
    select: { id: true, tenantId: true, fileType: true },
  });

  if (!file) {
    throw new BrandingDomainError('BRANDING_FILE_NOT_FOUND', 'Arquivo de branding não encontrado.');
  }

  if (file.tenantId !== null || file.fileType !== expectedType) {
    throw new BrandingDomainError(
      'BRANDING_FILE_OWNERSHIP_INVALID',
      expectedType === 'PLATFORM_LOGO'
        ? 'Logo da plataforma deve referenciar um arquivo PLATFORM_LOGO global.'
        : 'Favicon da plataforma deve referenciar um arquivo PLATFORM_FAVICON global.',
    );
  }
}

/**
 * Persistência singleton de Platform Branding (1.5B).
 * Estratégia: unique `singleton_key = "default"` (docs/17).
 */
export function createPlatformBrandingRepository(prisma: PrismaClient): PlatformBrandingRepository {
  return {
    async get() {
      const row = await prisma.platformBranding.findUnique({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
        include: brandingWithAssets,
      });
      return row ? mapPlatformBrandingRecord(row) : null;
    },

    async upsert(input) {
      const normalized = normalizeUpsertPlatformBrandingInput(input);
      const existing = await prisma.platformBranding.findUnique({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
        include: brandingWithAssets,
      });

      if (!existing && normalized.name === undefined) {
        throw new BrandingDomainError(
          'PLATFORM_BRANDING_INVALID_NAME',
          'Nome da plataforma é obrigatório na primeira configuração.',
        );
      }

      const existingMapped = existing
        ? mapPlatformBrandingRecord(existing)
        : { lightColors: null, darkColors: null, name: '' };

      const resolved = resolveUpsertBrandColorSchemes(existingMapped, normalized);
      const name = normalized.name ?? existingMapped.name;

      const data = {
        name,
        lightColors: toPrismaJsonColorOverrides(resolved.lightColors),
        darkColors: toPrismaJsonColorOverrides(resolved.darkColors),
      };

      const row = existing
        ? await prisma.platformBranding.update({
            where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
            data,
            include: brandingWithAssets,
          })
        : await prisma.platformBranding.create({
            data: {
              singletonKey: PLATFORM_BRANDING_SINGLETON_KEY,
              ...data,
            },
            include: brandingWithAssets,
          });

      return mapPlatformBrandingRecord(row);
    },

    async reset() {
      const existing = await prisma.platformBranding.findUnique({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
        select: { id: true, logoFileId: true, faviconFileId: true },
      });

      if (!existing) {
        return;
      }

      // Remove somente a config. FKs SET NULL nos files; limpeza de bytes fica para 1.5C (upload/delete).
      await prisma.platformBranding.delete({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
      });
    },

    async attachLogo(fileId) {
      await requireExistingPlatformBranding(prisma);
      await assertPlatformAsset(prisma, fileId, 'PLATFORM_LOGO');

      const row = await prisma.platformBranding.update({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
        data: { logoFileId: fileId },
        include: brandingWithAssets,
      });
      return mapPlatformBrandingRecord(row);
    },

    async attachFavicon(fileId) {
      await requireExistingPlatformBranding(prisma);
      await assertPlatformAsset(prisma, fileId, 'PLATFORM_FAVICON');

      const row = await prisma.platformBranding.update({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
        data: { faviconFileId: fileId },
        include: brandingWithAssets,
      });
      return mapPlatformBrandingRecord(row);
    },

    async clearLogo() {
      const existing = await prisma.platformBranding.findUnique({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
        include: brandingWithAssets,
      });
      if (!existing) {
        return null;
      }

      const row = await prisma.platformBranding.update({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
        data: { logoFileId: null },
        include: brandingWithAssets,
      });
      return mapPlatformBrandingRecord(row);
    },

    async clearFavicon() {
      const existing = await prisma.platformBranding.findUnique({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
        include: brandingWithAssets,
      });
      if (!existing) {
        return null;
      }

      const row = await prisma.platformBranding.update({
        where: { singletonKey: PLATFORM_BRANDING_SINGLETON_KEY },
        data: { faviconFileId: null },
        include: brandingWithAssets,
      });
      return mapPlatformBrandingRecord(row);
    },
  };
}
