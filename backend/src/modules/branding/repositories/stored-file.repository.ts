import type { PrismaClient } from '../../../generated/prisma/client.js';
import { BrandingDomainError } from '../domain/branding-domain-error.js';
import type { StoredFileRecord, StoredFileType } from '../domain/types.js';
import { mapStoredFileRecord } from './mappers.js';

export type CreateTenantStoredFileInput = {
  readonly tenantId: string;
  readonly fileType: 'TENANT_LOGO' | 'TENANT_ICON';
  readonly storageKey: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum: string;
};

export type CreatePlatformStoredFileInput = {
  readonly tenantId?: null;
  readonly fileType: 'PLATFORM_LOGO' | 'PLATFORM_ICON' | 'PLATFORM_FAVICON';
  readonly storageKey: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum: string;
};

export type CreateStoredFileInput = CreateTenantStoredFileInput | CreatePlatformStoredFileInput;

export type StoredFileRepository = {
  create(input: CreateStoredFileInput): Promise<StoredFileRecord>;
  findById(id: string): Promise<StoredFileRecord | null>;
  deleteById(id: string): Promise<void>;
  listStorageKeysByTenantId(tenantId: string): Promise<readonly string[]>;
};

function assertOwnershipConsistency(
  fileType: StoredFileType,
  tenantId: string | null | undefined,
): void {
  if (fileType === 'TENANT_LOGO' || fileType === 'TENANT_ICON') {
    if (tenantId == null || tenantId.length === 0) {
      throw new BrandingDomainError(
        'BRANDING_FILE_OWNERSHIP_INVALID',
        `Arquivo ${fileType} exige tenantId.`,
      );
    }
    return;
  }

  if (tenantId != null) {
    throw new BrandingDomainError(
      'BRANDING_FILE_OWNERSHIP_INVALID',
      `Arquivo ${fileType} deve ser global (tenantId null).`,
    );
  }
}

export function createStoredFileRepository(prisma: PrismaClient): StoredFileRepository {
  return {
    async create(input) {
      const tenantId =
        input.fileType === 'TENANT_LOGO' || input.fileType === 'TENANT_ICON' ? input.tenantId : null;
      assertOwnershipConsistency(input.fileType, tenantId);

      const row = await prisma.storedFile.create({
        data: {
          tenantId,
          fileType: input.fileType,
          storageKey: input.storageKey,
          mimeType: input.mimeType,
          size: input.size,
          checksum: input.checksum,
        },
      });
      return mapStoredFileRecord(row);
    },

    async findById(id) {
      const row = await prisma.storedFile.findUnique({ where: { id } });
      return row ? mapStoredFileRecord(row) : null;
    },

    async deleteById(id) {
      try {
        await prisma.storedFile.delete({ where: { id } });
      } catch {
        // already absent
      }
    },

    async listStorageKeysByTenantId(tenantId) {
      const rows = await prisma.storedFile.findMany({
        where: { tenantId },
        select: { storageKey: true },
      });
      return rows.map((row) => row.storageKey);
    },
  };
}
