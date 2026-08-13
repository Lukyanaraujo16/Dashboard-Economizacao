import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { CreateTenantInput, TenantRecord } from '../domain/types.js';
import { mapTenantRecord } from './mappers.js';

export type TenantRepository = {
  create(input: CreateTenantInput): Promise<TenantRecord>;
  findById(id: string): Promise<TenantRecord | null>;
};

export function createTenantRepository(prisma: PrismaClient): TenantRepository {
  return {
    async create(input) {
      const row = await prisma.tenant.create({
        data: {
          name: input.name,
          displayName: input.displayName,
          status: input.status ?? 'ACTIVE',
        },
      });

      return mapTenantRecord(row);
    },

    async findById(id) {
      const row = await prisma.tenant.findUnique({ where: { id } });
      return row ? mapTenantRecord(row) : null;
    },
  };
}
