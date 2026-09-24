import type { PrismaClient } from '../../../generated/prisma/client.js';
import type { CostCenterListVisibilityOptions } from '../domain/cost-center-visibility.js';
import { assertTenantId } from './read-query.js';
import { asCostCenterPrisma, type CostCenterRow } from './cost-center-prisma.js';

export type CostCenterReadRecord = {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
  readonly active: boolean;
};

export type CostCenterPeriodBounds = {
  readonly from: Date;
  readonly to: Date;
};

export type CostCenterReadRepository = {
  listByTenant(tenantId: string): Promise<readonly CostCenterReadRecord[]>;
  /**
   * Catálogo visível no seletor.
   *
   * visibility=active_only (Dashboard mês atual/futuro; Relatórios, 11-A.1):
   *   somente active=true
   *
   * visibility=historical (Dashboard mês passado):
   *   active=true
   *   OR allocation com parcela competenceDate no período
   *   OR allocation com parcela dueDate no período
   *   OR allocation cuja parcela tem settlement ACTIVE (não-transfer)
   *      com occurredOn no período (AR RECEIVABLE / AP PAYABLE).
   *
   * FinancialTransaction não tem FK Prisma para AR/AP; o vínculo é
   * (integrationId, installmentExternalId, installmentKind).
   */
  listVisibleForPeriod(
    tenantId: string,
    period: CostCenterPeriodBounds,
    options: CostCenterListVisibilityOptions,
  ): Promise<readonly CostCenterReadRecord[]>;
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

    async listVisibleForPeriod(tenantId, period, options) {
      assertTenantId(tenantId);
      if (period.from.getTime() > period.to.getTime()) {
        return [];
      }

      if (options.visibility === 'active_only') {
        const rows = await client.costCenter.findMany({
          where: { tenantId, active: true },
          orderBy: [{ active: 'desc' }, { name: 'asc' }, { id: 'asc' }],
          select: {
            id: true,
            name: true,
            code: true,
            active: true,
          },
        });
        return rows.map(mapCostCenter);
      }

      const installmentDateInPeriod = {
        OR: [
          { competenceDate: { gte: period.from, lte: period.to } },
          { dueDate: { gte: period.from, lte: period.to } },
        ],
      };

      // Mesma semântica cash: ACTIVE, sem ghost de transferência interna.
      const settlements = await prisma.financialTransaction.findMany({
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
      });

      const receivableKeys = uniqueInstallmentKeys(
        settlements.filter((row) => row.installmentKind === 'RECEIVABLE'),
      );
      const payableKeys = uniqueInstallmentKeys(
        settlements.filter((row) => row.installmentKind === 'PAYABLE'),
      );

      const rows = await client.costCenter.findMany({
        where: {
          tenantId,
          OR: [
            { active: true },
            {
              allocations: {
                some: {
                  tenantId,
                  OR: [
                    {
                      receivable: {
                        OR: [
                          installmentDateInPeriod,
                          ...receivableKeys.map((key) => ({
                            integrationId: key.integrationId,
                            externalId: key.externalId,
                          })),
                        ],
                      },
                    },
                    {
                      payable: {
                        OR: [
                          installmentDateInPeriod,
                          ...payableKeys.map((key) => ({
                            integrationId: key.integrationId,
                            externalId: key.externalId,
                          })),
                        ],
                      },
                    },
                  ],
                },
              },
            },
          ],
        },
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
