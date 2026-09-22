import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import type { MappedCostCenter } from '../domain/conta-azul-cost-center-mappers.js';
import {
  emptyCostCenterCatalogUpsertCounters,
  type CostCenterCatalogUpsertCounters,
} from '../domain/conta-azul-cost-center-catalog-metrics.js';
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
  upsertCostCenters(
    scope: FinancialSyncScope,
    items: readonly MappedCostCenter[],
  ): Promise<CostCenterCatalogUpsertCounters>;
  /**
   * Soft-inativa centros ativos da integration ausentes do snapshot completo.
   * Snapshot vazio válido → inativa todos os ativos da integration.
   * Idempotente: rows já inactive não são tocadas.
   */
  markAbsentInactive(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly presentExternalIds: readonly string[];
    readonly syncedAt: Date;
  }): Promise<number>;
  /**
   * Materializa centro visto só em rateio histórico.
   * Create: active=false (sem evidência de catálogo).
   * Update: não reativa inactive; atualiza nome/syncedAt apenas.
   */
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
        return emptyCostCenterCatalogUpsertCounters();
      }

      const externalIds = items.map((item) => item.externalId);
      const existing = await prisma.costCenter.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          externalId: { in: externalIds },
        },
        select: { externalId: true, active: true },
      });
      const existingByExternal = new Map(existing.map((row) => [row.externalId, row.active]));

      let created = 0;
      let updated = 0;
      let reactivated = 0;
      let inactivatedByUpstream = 0;
      let alreadyInactive = 0;

      for (const item of items) {
        const priorActive = existingByExternal.get(item.externalId);
        if (priorActive === undefined) {
          created += 1;
        } else if (priorActive === false && item.active) {
          reactivated += 1;
        } else if (priorActive === true && !item.active) {
          inactivatedByUpstream += 1;
        } else if (priorActive === false && !item.active) {
          alreadyInactive += 1;
        } else {
          updated += 1;
        }
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

      return {
        created,
        updated,
        reactivated,
        inactivatedByUpstream,
        alreadyInactive,
      };
    },

    async markAbsentInactive(input) {
      const present = [...new Set(input.presentExternalIds.filter(Boolean))];
      const result = await prisma.costCenter.updateMany({
        where: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          active: true,
          ...(present.length > 0 ? { externalId: { notIn: present } } : {}),
        },
        data: {
          active: false,
          syncedAt: input.syncedAt,
        },
      });
      return result.count;
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
          // Sem evidência de catálogo: materializa inactive para preservar FK/histórico.
          active: false,
          syncedAt: scope.syncedAt,
        },
        update: {
          name: item.name,
          syncedAt: scope.syncedAt,
          // Não altera active — reativação exige evidência do catálogo oficial.
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
            lifecycleStatus: 'ACTIVE',
          },
          select,
        }),
        prisma.payable.findMany({
          where: {
            tenantId: scope.tenantId,
            integrationId: scope.integrationId,
            lifecycleStatus: 'ACTIVE',
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
