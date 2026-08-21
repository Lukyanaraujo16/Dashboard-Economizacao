import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import type { MappedCostCenter } from '../domain/conta-azul-cost-center-mappers.js';
import type { FinancialSyncScope } from './financial.repository.js';

export type CostCenterAllocationWrite = {
  readonly costCenterId: string;
  readonly amount: Prisma.Decimal;
};

export type CostCenterAllocationCandidate = {
  readonly kind: 'RECEIVABLE' | 'PAYABLE';
  readonly localId: string;
  readonly externalId: string;
  readonly total: Prisma.Decimal;
};

export type ContaAzulCostCenterRepository = {
  upsertCostCenters(scope: FinancialSyncScope, items: readonly MappedCostCenter[]): Promise<void>;
  upsertCostCenterByExternal(
    scope: FinancialSyncScope,
    item: { readonly externalId: string; readonly name: string },
  ): Promise<string>;
  findCostCenterIdsByExternal(
    scope: { readonly tenantId: string; readonly integrationId: string },
    externalIds: readonly string[],
  ): Promise<Map<string, string>>;
  findCostCentersByTenant(tenantId: string): Promise<
    Array<{
      readonly id: string;
      readonly externalId: string;
      readonly code: string | null;
      readonly name: string;
      readonly active: boolean;
    }>
  >;
  replaceAllocationsForReceivable(
    tenantId: string,
    receivableId: string,
    allocations: readonly CostCenterAllocationWrite[],
    syncedAt: Date,
  ): Promise<void>;
  replaceAllocationsForPayable(
    tenantId: string,
    payableId: string,
    allocations: readonly CostCenterAllocationWrite[],
    syncedAt: Date,
  ): Promise<void>;
  listInstallmentsNeedingAllocationSync(scope: {
    readonly tenantId: string;
    readonly integrationId: string;
  }): Promise<CostCenterAllocationCandidate[]>;
};

export function createContaAzulCostCenterRepository(
  prisma: PrismaClient,
): ContaAzulCostCenterRepository {
  return {
    async upsertCostCenters(scope, items) {
      if (items.length === 0) {
        return;
      }
      await prisma.$transaction(
        items.map((item) =>
          prisma.costCenter.upsert({
            where: {
              integrationId_externalId: {
                integrationId: scope.integrationId,
                externalId: item.externalId,
              },
            },
            create: {
              tenantId: scope.tenantId,
              integrationId: scope.integrationId,
              externalId: item.externalId,
              code: item.code,
              name: item.name,
              active: item.active,
              syncedAt: scope.syncedAt,
            },
            update: {
              code: item.code,
              name: item.name,
              active: item.active,
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );
    },

    async upsertCostCenterByExternal(scope, item) {
      const row = await prisma.costCenter.upsert({
        where: {
          integrationId_externalId: {
            integrationId: scope.integrationId,
            externalId: item.externalId,
          },
        },
        create: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          externalId: item.externalId,
          code: null,
          name: item.name,
          active: true,
          syncedAt: scope.syncedAt,
        },
        update: {
          name: item.name,
          syncedAt: scope.syncedAt,
        },
        select: { id: true },
      });
      return row.id;
    },

    async findCostCenterIdsByExternal(scope, externalIds) {
      const unique = [...new Set(externalIds.filter(Boolean))];
      if (unique.length === 0) {
        return new Map();
      }
      const rows = await prisma.costCenter.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          externalId: { in: unique },
        },
        select: { id: true, externalId: true },
      });
      return new Map(rows.map((row) => [row.externalId, row.id]));
    },

    async findCostCentersByTenant(tenantId) {
      return prisma.costCenter.findMany({
        where: { tenantId },
        orderBy: [{ active: 'desc' }, { name: 'asc' }],
        select: {
          id: true,
          externalId: true,
          code: true,
          name: true,
          active: true,
        },
      });
    },

    async replaceAllocationsForReceivable(tenantId, receivableId, allocations, syncedAt) {
      await prisma.$transaction(async (tx) => {
        await tx.installmentCostCenterAllocation.deleteMany({
          where: { tenantId, receivableId },
        });
        if (allocations.length === 0) {
          return;
        }
        await tx.installmentCostCenterAllocation.createMany({
          data: allocations.map((item) => ({
            tenantId,
            receivableId,
            costCenterId: item.costCenterId,
            amount: item.amount,
            syncedAt,
          })),
        });
      });
    },

    async replaceAllocationsForPayable(tenantId, payableId, allocations, syncedAt) {
      await prisma.$transaction(async (tx) => {
        await tx.installmentCostCenterAllocation.deleteMany({
          where: { tenantId, payableId },
        });
        if (allocations.length === 0) {
          return;
        }
        await tx.installmentCostCenterAllocation.createMany({
          data: allocations.map((item) => ({
            tenantId,
            payableId,
            costCenterId: item.costCenterId,
            amount: item.amount,
            syncedAt,
          })),
        });
      });
    },

    async listInstallmentsNeedingAllocationSync(scope) {
      const [receivables, payables] = await Promise.all([
        prisma.receivable.findMany({
          where: {
            tenantId: scope.tenantId,
            integrationId: scope.integrationId,
          },
          select: {
            id: true,
            externalId: true,
            total: true,
            upstreamUpdatedAt: true,
            costCenterAllocations: {
              select: { syncedAt: true },
              orderBy: { syncedAt: 'desc' },
              take: 1,
            },
          },
        }),
        prisma.payable.findMany({
          where: {
            tenantId: scope.tenantId,
            integrationId: scope.integrationId,
          },
          select: {
            id: true,
            externalId: true,
            total: true,
            upstreamUpdatedAt: true,
            costCenterAllocations: {
              select: { syncedAt: true },
              orderBy: { syncedAt: 'desc' },
              take: 1,
            },
          },
        }),
      ]);

      const needsSync = <
        T extends {
          readonly upstreamUpdatedAt: Date | null;
          readonly costCenterAllocations: readonly { readonly syncedAt: Date }[];
        },
      >(
        row: T,
      ): boolean => {
        const maxSynced = row.costCenterAllocations[0]?.syncedAt;
        if (!maxSynced) {
          return true;
        }
        if (!row.upstreamUpdatedAt) {
          return false;
        }
        return row.upstreamUpdatedAt.getTime() > maxSynced.getTime();
      };

      return [
        ...receivables.filter(needsSync).map((row) => ({
          kind: 'RECEIVABLE' as const,
          localId: row.id,
          externalId: row.externalId,
          total: row.total,
        })),
        ...payables.filter(needsSync).map((row) => ({
          kind: 'PAYABLE' as const,
          localId: row.id,
          externalId: row.externalId,
          total: row.total,
        })),
      ];
    },
  };
}
