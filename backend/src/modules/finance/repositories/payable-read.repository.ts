import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type {
  CompetenceDateRangeQuery,
  DueDateRangeQuery,
  FinanceReadScope,
  FinancialInstallmentReadRecord,
} from '../domain/types.js';
import { mapPayableReadRecord } from './mappers.js';
import {
  assertTenantId,
  buildActiveInstallmentWhere,
  buildMonthlyCompetenceWhere,
} from './read-query.js';

export type PayableReadRepository = {
  findActiveByTenant(scope: FinanceReadScope): Promise<readonly FinancialInstallmentReadRecord[]>;
  findActiveByDueDateRange(
    query: DueDateRangeQuery,
  ): Promise<readonly FinancialInstallmentReadRecord[]>;
  findMonthlyCompetenceExpenses(
    query: CompetenceDateRangeQuery,
  ): Promise<readonly FinancialInstallmentReadRecord[]>;
  findByExternalIds(
    scope: FinanceReadScope,
    externalIds: readonly string[],
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

    async findMonthlyCompetenceExpenses(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const rows = await prisma.payable.findMany({
        where: buildMonthlyCompetenceWhere(query, query.from, query.to),
        orderBy: [{ competenceDate: 'asc' }, { id: 'asc' }],
      });
      return rows.map(mapPayableReadRecord);
    },

    async findByExternalIds(scope, externalIds) {
      assertTenantId(scope.tenantId);
      const unique = [...new Set(externalIds.filter((id) => id.trim() !== ''))];
      if (unique.length === 0) {
        return [];
      }
      const where: Prisma.PayableWhereInput = {
        tenantId: scope.tenantId,
        externalId: { in: unique },
      };
      if (scope.integrationId !== undefined && scope.integrationId.trim() !== '') {
        where.integrationId = scope.integrationId;
      }
      const rows = await prisma.payable.findMany({
        where,
        orderBy: [{ id: 'asc' }],
      });
      return rows.map(mapPayableReadRecord);
    },
  };
}
