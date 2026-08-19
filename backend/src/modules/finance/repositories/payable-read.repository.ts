import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  DueDateRangeQuery,
  FinanceReadScope,
  FinancialInstallmentReadRecord,
} from '../domain/types.js';
import { mapPayableReadRecord } from './mappers.js';
import { assertTenantId, buildActiveInstallmentWhere } from './read-query.js';

export type PayableReadRepository = {
  findActiveByTenant(scope: FinanceReadScope): Promise<readonly FinancialInstallmentReadRecord[]>;
  findActiveByDueDateRange(
    query: DueDateRangeQuery,
  ): Promise<readonly FinancialInstallmentReadRecord[]>;
};

export function createPayableReadRepository(prisma: PrismaClient): PayableReadRepository {
  return {
    async findActiveByTenant(scope) {
      assertTenantId(scope.tenantId);
      const rows = await prisma.payable.findMany({
        where: buildActiveInstallmentWhere(scope),
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      });
      return rows.map(mapPayableReadRecord);
    },

    async findActiveByDueDateRange(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const rows = await prisma.payable.findMany({
        where: {
          ...buildActiveInstallmentWhere(query),
          dueDate: { gte: query.from, lte: query.to },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      });
      return rows.map(mapPayableReadRecord);
    },
  };
}
