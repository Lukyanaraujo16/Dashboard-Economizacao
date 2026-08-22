import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import type { MappedCostCenter } from '../domain/conta-azul-cost-center-mappers.js';
import {
  COST_CENTER_DETAIL_RULE_VERSION,
  shouldFetchCostCenterDetail,
  type CostCenterDetailStatusValue,
} from '../domain/conta-azul-cost-center-detail-fetch.js';
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

export type CostCenterDetailStateWrite = {
  readonly status: Exclude<CostCenterDetailStatusValue, 'UNKNOWN'>;
  readonly syncedAt: Date;
  readonly ruleVersion: number;
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
  markReceivableCostCenterDetailState(
    tenantId: string,
    receivableId: string,
    state: CostCenterDetailStateWrite,
  ): Promise<void>;
  markPayableCostCenterDetailState(
    tenantId: string,
    payableId: string,
    state: CostCenterDetailStateWrite,
  ): Promise<void>;
  listInstallmentsNeedingAllocationSync(scope: {
    readonly tenantId: string;
    readonly integrationId: string;
  }): Promise<{
    readonly candidates: CostCenterAllocationCandidate[];
    readonly totalInstallments: number;
    readonly skippedFresh: number;
  }>;
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

    async markReceivableCostCenterDetailState(tenantId, receivableId, state) {
      await prisma.receivable.updateMany({
        where: { id: receivableId, tenantId },
        data: {
          costCenterDetailStatus: state.status,
          costCenterDetailSyncedAt: state.syncedAt,
          costCenterDetailRuleVersion: state.ruleVersion,
        },
      });
    },

    async markPayableCostCenterDetailState(tenantId, payableId, state) {
      await prisma.payable.updateMany({
        where: { id: payableId, tenantId },
        data: {
          costCenterDetailStatus: state.status,
          costCenterDetailSyncedAt: state.syncedAt,
          costCenterDetailRuleVersion: state.ruleVersion,
        },
      });
    },

    async listInstallmentsNeedingAllocationSync(scope) {
      const select = {
        id: true,
        externalId: true,
        total: true,
        upstreamUpdatedAt: true,
        costCenterDetailStatus: true,
        costCenterDetailSyncedAt: true,
        costCenterDetailRuleVersion: true,
      } as const;

      const [receivables, payables] = await Promise.all([
        prisma.receivable.findMany({
          where: {
            tenantId: scope.tenantId,
            integrationId: scope.integrationId,
          },
          select,
        }),
        prisma.payable.findMany({
          where: {
            tenantId: scope.tenantId,
            integrationId: scope.integrationId,
          },
          select,
        }),
      ]);

      const candidates: CostCenterAllocationCandidate[] = [];
      let skippedFresh = 0;
      const totalInstallments = receivables.length + payables.length;

      const consider = (
        kind: 'RECEIVABLE' | 'PAYABLE',
        row: {
          readonly id: string;
          readonly externalId: string;
          readonly total: Prisma.Decimal;
          readonly upstreamUpdatedAt: Date | null;
          readonly costCenterDetailStatus: CostCenterDetailStatusValue;
          readonly costCenterDetailSyncedAt: Date | null;
          readonly costCenterDetailRuleVersion: number;
        },
      ) => {
        const decision = shouldFetchCostCenterDetail({
          status: row.costCenterDetailStatus,
          detailSyncedAt: row.costCenterDetailSyncedAt,
          detailRuleVersion: row.costCenterDetailRuleVersion,
          upstreamUpdatedAt: row.upstreamUpdatedAt,
          currentRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        });
        if (!decision.shouldFetch) {
          skippedFresh += 1;
          return;
        }
        candidates.push({
          kind,
          localId: row.id,
          externalId: row.externalId,
          total: row.total,
        });
      };

      for (const row of receivables) {
        consider('RECEIVABLE', row);
      }
      for (const row of payables) {
        consider('PAYABLE', row);
      }

      return { candidates, totalInstallments, skippedFresh };
    },
  };
}
