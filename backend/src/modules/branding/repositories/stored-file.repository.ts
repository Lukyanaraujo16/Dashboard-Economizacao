import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { StoredFileRecord } from '../domain/types.js';
import { mapStoredFileRecord } from './mappers.js';

export type CreateStoredFileInput = {
  readonly tenantId: string;
  readonly fileType: 'TENANT_LOGO';
  readonly storageKey: string;
  readonly mimeType: string;
  readonly size: number;
  readonly checksum: string;
};

export type StoredFileRepository = {
  create(input: CreateStoredFileInput): Promise<StoredFileRecord>;
  findById(id: string): Promise<StoredFileRecord | null>;
  deleteById(id: string): Promise<void>;
  listStorageKeysByTenantId(tenantId: string): Promise<readonly string[]>;
};

export function createStoredFileRepository(prisma: PrismaClient): StoredFileRepository {
  return {
    async create(input) {
      const row = await prisma.storedFile.create({
        data: {
          tenantId: input.tenantId,
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
