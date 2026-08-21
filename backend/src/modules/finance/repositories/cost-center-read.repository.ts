import type { PrismaClient } from '../../../generated/prisma/client.js';
import { assertTenantId } from './read-query.js';
import { asCostCenterPrisma, type CostCenterRow } from './cost-center-prisma.js';

export type CostCenterReadRecord = {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly active: boolean;
};

export type CostCenterReadRepository = {
  listByTenant(tenantId: string): Promise<readonly CostCenterReadRecord[]>;
  findByIdForTenant(tenantId: string, costCenterId: string): Promise<CostCenterReadRecord | null>;
};

export function createCostCenterReadRepository(prisma: PrismaClient): CostCenterReadRepository {
  const client = asCostCenterPrisma(prisma);
  return {
    async listByTenant(tenantId) {
      assertTenantId(tenantId);
      const rows = await client.costCenter.findMany({
        where: { tenantId },
        orderBy: [{ active: 'desc' }, { name: 'asc' }, { id: 'asc' }],
        select: {
          id: true,
          name: true,
          code: true,
          active: true,
        },
      });
      return rows.map(mapCostCenter);
    },

    async findByIdForTenant(tenantId, costCenterId) {
      assertTenantId(tenantId);
      const row = await client.costCenter.findFirst({
        where: { id: costCenterId, tenantId },
        select: {
          id: true,
          name: true,
          code: true,
          active: true,
        },
      });
      return row === null ? null : mapCostCenter(row);
    },
  };
}

function mapCostCenter(
  row: Pick<CostCenterRow, 'id' | 'name' | 'code' | 'active'>,
): CostCenterReadRecord {
  return {
    id: row.id,
    name: row.name,
    code: row.code,
    active: row.active,
  };
}
