import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';
import type { FinancialCategoryListVisibilityOptions } from '../domain/financial-category-visibility.js';
import type { CategoryLookupQuery, FinancialCategoryReadRecord } from '../domain/types.js';
import { mapFinancialCategoryReadRecord } from './mappers.js';
import { assertTenantId } from './read-query.js';

export type FinancialCategoryPeriodBounds = {
  readonly from: Date;
  readonly to: Date;
};

export type FinancialCategoryReadRepository = {
  findByTenantAndExternalIds(
    query: CategoryLookupQuery,
  ): Promise<readonly FinancialCategoryReadRecord[]>;
  findByIdForTenant(
    tenantId: string,
    categoryId: string,
  ): Promise<FinancialCategoryReadRecord | null>;
  listByTenant(tenantId: string): Promise<readonly FinancialCategoryReadRecord[]>;
  /**
   * Catálogo visível no seletor (11-C).
   *
   * visibility=active_only (Dashboard mês atual/futuro):
   *   somente active=true
   *
   * visibility=historical (Dashboard mês passado / Relatórios):
   *   active=true
   *   OR categoria (integrationId, externalId) referenciada por AR/AP
   *      com competenceDate ou dueDate no período
   *   OR referenciada por installment com settlement ACTIVE (não-transfer)
   *      com occurredOn no período.
   *
   * Lookups por id/externalIds NÃO filtram active — resolução histórica separada.
   */
  listVisibleForPeriod(
    tenantId: string,
    period: FinancialCategoryPeriodBounds,
    options: FinancialCategoryListVisibilityOptions,
  ): Promise<readonly FinancialCategoryReadRecord[]>;
};

const LIST_ORDER: Prisma.FinancialCategoryOrderByWithRelationInput[] = [
  { active: 'desc' },
  { type: 'asc' },
  { name: 'asc' },
  { id: 'asc' },
];

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
        orderBy: LIST_ORDER,
      });
      return rows.map(mapFinancialCategoryReadRecord);
    },

    async listVisibleForPeriod(tenantId, period, options) {
      assertTenantId(tenantId);
      if (period.from.getTime() > period.to.getTime()) {
        return [];
      }

      if (options.visibility === 'active_only') {
        const rows = await prisma.financialCategory.findMany({
          where: { tenantId, active: true },
          orderBy: LIST_ORDER,
        });
        return rows.map(mapFinancialCategoryReadRecord);
      }

      const historicallyUsed = await collectHistoricallyUsedCategoryKeys(prisma, tenantId, period);
      const historicalOr: Prisma.FinancialCategoryWhereInput[] = historicallyUsed.map((key) => ({
        integrationId: key.integrationId,
        externalId: key.externalId,
      }));

      const rows = await prisma.financialCategory.findMany({
        where: {
          tenantId,
          OR: [{ active: true }, ...historicalOr],
        },
        orderBy: LIST_ORDER,
      });
      return rows.map(mapFinancialCategoryReadRecord);
    },
  };
}

type CategoryKey = {
  readonly integrationId: string;
  readonly externalId: string;
};

async function collectHistoricallyUsedCategoryKeys(
  prisma: PrismaClient,
  tenantId: string,
  period: FinancialCategoryPeriodBounds,
): Promise<CategoryKey[]> {
  const installmentDateInPeriod = {
    OR: [
      { competenceDate: { gte: period.from, lte: period.to } },
      { dueDate: { gte: period.from, lte: period.to } },
    ],
  };

  const [receivablesByDate, payablesByDate, settlements] = await Promise.all([
    prisma.receivable.findMany({
      where: { tenantId, ...installmentDateInPeriod },
      select: { integrationId: true, categoryExternalIds: true },
    }),
    prisma.payable.findMany({
      where: { tenantId, ...installmentDateInPeriod },
      select: { integrationId: true, categoryExternalIds: true },
    }),
    prisma.financialTransaction.findMany({
      where: {
        tenantId,
        lifecycleStatus: 'ACTIVE',
        financialTransferId: null,
        occurredOn: { gte: period.from, lte: period.to },
      },
      select: {
        installmentExternalId: true,
        installmentKind: true,
        integrationId: true,
      },
    }),
  ]);

  const seen = new Set<string>();
  const out: CategoryKey[] = [];

  function addFromInstallments(
    rows: readonly {
      readonly integrationId: string;
      readonly categoryExternalIds: readonly string[];
    }[],
  ): void {
    for (const row of rows) {
      for (const externalId of row.categoryExternalIds) {
        if (!externalId) {
          continue;
        }
        const key = `${row.integrationId}:${externalId}`;
        if (seen.has(key)) {
          continue;
        }
        seen.add(key);
        out.push({ integrationId: row.integrationId, externalId });
      }
    }
  }

  addFromInstallments(receivablesByDate);
  addFromInstallments(payablesByDate);

  const receivableKeys = uniqueInstallmentKeys(
    settlements.filter((row) => row.installmentKind === 'RECEIVABLE'),
  );
  const payableKeys = uniqueInstallmentKeys(
    settlements.filter((row) => row.installmentKind === 'PAYABLE'),
  );

  if (receivableKeys.length > 0) {
    const settlementReceivables = await prisma.receivable.findMany({
      where: {
        tenantId,
        OR: receivableKeys.map((key) => ({
          integrationId: key.integrationId,
          externalId: key.externalId,
        })),
      },
      select: { integrationId: true, categoryExternalIds: true },
    });
    addFromInstallments(settlementReceivables);
  }

  if (payableKeys.length > 0) {
    const settlementPayables = await prisma.payable.findMany({
      where: {
        tenantId,
        OR: payableKeys.map((key) => ({
          integrationId: key.integrationId,
          externalId: key.externalId,
        })),
      },
      select: { integrationId: true, categoryExternalIds: true },
    });
    addFromInstallments(settlementPayables);
  }

  return out;
}

function uniqueInstallmentKeys(
  rows: readonly {
    readonly integrationId: string;
    readonly installmentExternalId: string;
  }[],
): Array<{ readonly integrationId: string; readonly externalId: string }> {
  const seen = new Set<string>();
  const out: Array<{ readonly integrationId: string; readonly externalId: string }> = [];
  for (const row of rows) {
    const key = `${row.integrationId}:${row.installmentExternalId}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push({
      integrationId: row.integrationId,
      externalId: row.installmentExternalId,
    });
  }
  return out;
}
