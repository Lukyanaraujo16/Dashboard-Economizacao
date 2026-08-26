import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type {
  CompetenceDateRangeQuery,
  DueDateRangeQuery,
  FinanceReadScope,
  FinancialInstallmentReadRecord,
} from '../domain/types.js';
import { mapReceivableReadRecord } from './mappers.js';
import {
  assertTenantId,
  buildActiveInstallmentWhere,
  buildMonthlyCompetenceRevenueWhere,
} from './read-query.js';

export type ReceivableReadRepository = {
  findActiveByTenant(scope: FinanceReadScope): Promise<readonly FinancialInstallmentReadRecord[]>;
  findActiveByDueDateRange(
    query: DueDateRangeQuery,
  ): Promise<readonly FinancialInstallmentReadRecord[]>;
  findMonthlyCompetenceRevenue(
    query: CompetenceDateRangeQuery,
  ): Promise<readonly FinancialInstallmentReadRecord[]>;
  findByExternalIds(
    scope: FinanceReadScope,
    externalIds: readonly string[],
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

    async findMonthlyCompetenceRevenue(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const rows = await prisma.receivable.findMany({
        where: buildMonthlyCompetenceRevenueWhere(query, query.from, query.to),
        orderBy: [{ competenceDate: 'asc' }, { id: 'asc' }],
      });
      return rows.map(mapReceivableReadRecord);
    },

    async findByExternalIds(scope, externalIds) {
      assertTenantId(scope.tenantId);
      const unique = [...new Set(externalIds.filter((id) => id.trim() !== ''))];
      if (unique.length === 0) {
        return [];
      }
      const where: Prisma.ReceivableWhereInput = {
        tenantId: scope.tenantId,
        externalId: { in: unique },
      };
      if (scope.integrationId !== undefined && scope.integrationId.trim() !== '') {
        where.integrationId = scope.integrationId;
      }
      const rows = await prisma.receivable.findMany({
        where,
        orderBy: [{ id: 'asc' }],
      });
      return rows.map(mapReceivableReadRecord);
    },
  };
}
