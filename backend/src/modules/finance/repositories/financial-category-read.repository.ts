import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type { CategoryLookupQuery, FinancialCategoryReadRecord } from '../domain/types.js';
import { mapFinancialCategoryReadRecord } from './mappers.js';
import { assertTenantId } from './read-query.js';

export type FinancialCategoryReadRepository = {
  findByTenantAndExternalIds(
    query: CategoryLookupQuery,
  ): Promise<readonly FinancialCategoryReadRecord[]>;
  findByIdForTenant(
    tenantId: string,
    categoryId: string,
  ): Promise<FinancialCategoryReadRecord | null>;
  listByTenant(tenantId: string): Promise<readonly FinancialCategoryReadRecord[]>;
};

export function createFinancialCategoryReadRepository(
  prisma: PrismaClient,
): FinancialCategoryReadRepository {
  return {
    async findByTenantAndExternalIds(query) {
      assertTenantId(query.tenantId);
      const unique = [...new Set(query.externalIds.filter((id) => id.trim() !== ''))];
      if (unique.length === 0) {
        return [];
      }
      const where: Prisma.FinancialCategoryWhereInput = {
        tenantId: query.tenantId,
        externalId: { in: unique },
      };
      if (query.integrationId !== undefined && query.integrationId.trim() !== '') {
        where.integrationId = query.integrationId;
      }
      const rows = await prisma.financialCategory.findMany({
        where,
        orderBy: [{ externalId: 'asc' }, { id: 'asc' }],
      });
      return rows.map(mapFinancialCategoryReadRecord);
    },

    async findByIdForTenant(tenantId, categoryId) {
      assertTenantId(tenantId);
      const row = await prisma.financialCategory.findFirst({
        where: { id: categoryId, tenantId },
      });
      return row === null ? null : mapFinancialCategoryReadRecord(row);
    },

    async listByTenant(tenantId) {
      assertTenantId(tenantId);
      const rows = await prisma.financialCategory.findMany({
        where: { tenantId },
        orderBy: [{ type: 'asc' }, { name: 'asc' }, { id: 'asc' }],
      });
      return rows.map(mapFinancialCategoryReadRecord);
    },
  };
}
