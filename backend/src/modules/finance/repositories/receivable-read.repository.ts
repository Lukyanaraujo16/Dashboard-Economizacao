import type { PrismaClient } from '../../../generated/prisma/client.js';
import type {
  DueDateRangeQuery,
  FinanceReadScope,
  FinancialInstallmentReadRecord,
} from '../domain/types.js';
import { mapReceivableReadRecord } from './mappers.js';
import { assertTenantId, buildActiveInstallmentWhere } from './read-query.js';

export type ReceivableReadRepository = {
  findActiveByTenant(scope: FinanceReadScope): Promise<readonly FinancialInstallmentReadRecord[]>;
  findActiveByDueDateRange(
    query: DueDateRangeQuery,
  ): Promise<readonly FinancialInstallmentReadRecord[]>;
};

export function createReceivableReadRepository(prisma: PrismaClient): ReceivableReadRepository {
  return {
    async findActiveByTenant(scope) {
      assertTenantId(scope.tenantId);
      const rows = await prisma.receivable.findMany({
        where: buildActiveInstallmentWhere(scope),
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      });
      return rows.map(mapReceivableReadRecord);
    },

    async findActiveByDueDateRange(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const rows = await prisma.receivable.findMany({
        where: {
          ...buildActiveInstallmentWhere(query),
          dueDate: { gte: query.from, lte: query.to },
        },
        orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
      });
      return rows.map(mapReceivableReadRecord);
    },
  };
}
