import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import type { MappedCostCenter } from '../domain/conta-azul-cost-center-mappers.js';
import {
  emptyCostCenterCatalogUpsertCounters,
  type CostCenterCatalogUpsertCounters,
} from '../domain/conta-azul-cost-center-catalog-metrics.js';
import {
  classifyCostCenterAllocationMutation,
  COST_CENTER_DETAIL_RULE_VERSION,
  selectCostCenterDetailCandidates,
  type CostCenterAllocationMutation,
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
  persistInstallmentCostCenterDetail(input: {
    readonly tenantId: string;
    readonly kind: 'RECEIVABLE' | 'PAYABLE';
    readonly installmentId: string;
    readonly allocations: readonly CostCenterAllocationWrite[];
    readonly state: CostCenterDetailStateWrite;
  }): Promise<{ readonly mutation: CostCenterAllocationMutation }>;
  findActiveInstallmentForAllocation(
    scope: { readonly tenantId: string; readonly integrationId: string },
    kind: 'RECEIVABLE' | 'PAYABLE',
    externalId: string,
  ): Promise<CostCenterAllocationCandidate | null>;
  listInstallmentsNeedingAllocationSync(scope: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly now?: Date;
    readonly staleAfterMs?: number;
    readonly staleLimit?: number;
  }): Promise<{
    readonly candidates: CostCenterAllocationCandidate[];
    readonly totalInstallments: number;
    readonly skippedFresh: number;
    readonly staleSelected: number;
    readonly staleHotSelected: number;
    readonly staleColdSelected: number;
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

    async persistInstallmentCostCenterDetail(input) {
      return prisma.$transaction(async (tx) => {
        const allocationWhere =
          input.kind === 'RECEIVABLE'
            ? { tenantId: input.tenantId, receivableId: input.installmentId }
            : { tenantId: input.tenantId, payableId: input.installmentId };
        const previous = await tx.installmentCostCenterAllocation.findMany({
          where: allocationWhere,
          select: { costCenterId: true, amount: true },
        });
        await tx.installmentCostCenterAllocation.deleteMany({ where: allocationWhere });
        if (input.allocations.length > 0) {
          await tx.installmentCostCenterAllocation.createMany({
            data: input.allocations.map((item) =>
              input.kind === 'RECEIVABLE'
                ? {
                    tenantId: input.tenantId,
                    receivableId: input.installmentId,
                    costCenterId: item.costCenterId,
                    amount: item.amount,
                    syncedAt: input.state.syncedAt,
                  }
                : {
                    tenantId: input.tenantId,
                    payableId: input.installmentId,
                    costCenterId: item.costCenterId,
                    amount: item.amount,
                    syncedAt: input.state.syncedAt,
                  },
            ),
          });
        }
        const detailData = {
          costCenterDetailStatus: input.state.status,
          costCenterDetailSyncedAt: input.state.syncedAt,
          costCenterDetailRuleVersion: input.state.ruleVersion,
        };
        if (input.kind === 'RECEIVABLE') {
          await tx.receivable.updateMany({
            where: { id: input.installmentId, tenantId: input.tenantId },
            data: detailData,
          });
        } else {
          await tx.payable.updateMany({
            where: { id: input.installmentId, tenantId: input.tenantId },
            data: detailData,
          });
        }
        const previousFingerprint = allocationFingerprint(previous);
        const nextFingerprint = allocationFingerprint(input.allocations);
        return {
          mutation: classifyCostCenterAllocationMutation(
            previous.length,
            input.allocations.length,
            previousFingerprint === nextFingerprint,
          ),
        };
      });
    },

    async findActiveInstallmentForAllocation(scope, kind, externalId) {
      const where = {
        tenantId: scope.tenantId,
        integrationId: scope.integrationId,
        externalId,
        lifecycleStatus: 'ACTIVE' as const,
      };
      const select = { id: true, externalId: true, total: true } as const;
      if (kind === 'RECEIVABLE') {
        const row = await prisma.receivable.findFirst({ where, select });
        return row
          ? {
              kind,
              localId: row.id,
              externalId: row.externalId,
              total: row.total,
            }
          : null;
      }
      const row = await prisma.payable.findFirst({ where, select });
      return row
        ? {
            kind,
            localId: row.id,
            externalId: row.externalId,
            total: row.total,
          }
        : null;
    },

    async listInstallmentsNeedingAllocationSync(scope) {
      const select = {
        id: true,
        externalId: true,
        total: true,
        dueDate: true,
        competenceDate: true,
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

      const selected = selectCostCenterDetailCandidates(
        [
          ...receivables.map((row) => ({
            kind: 'RECEIVABLE' as const,
            localId: row.id,
            externalId: row.externalId,
            total: row.total,
            status: row.costCenterDetailStatus,
            detailSyncedAt: row.costCenterDetailSyncedAt,
            detailRuleVersion: row.costCenterDetailRuleVersion,
            upstreamUpdatedAt: row.upstreamUpdatedAt,
            dueDate: row.dueDate,
            competenceDate: row.competenceDate,
          })),
          ...payables.map((row) => ({
            kind: 'PAYABLE' as const,
            localId: row.id,
            externalId: row.externalId,
            total: row.total,
            status: row.costCenterDetailStatus,
            detailSyncedAt: row.costCenterDetailSyncedAt,
            detailRuleVersion: row.costCenterDetailRuleVersion,
            upstreamUpdatedAt: row.upstreamUpdatedAt,
            dueDate: row.dueDate,
            competenceDate: row.competenceDate,
          })),
        ],
        {
          now: scope.now,
          staleAfterMs: scope.staleAfterMs,
          staleLimit: scope.staleLimit,
          currentRuleVersion: COST_CENTER_DETAIL_RULE_VERSION,
        },
      );

      return {
        candidates: selected.candidates.map((row) => ({
          kind: row.kind,
          localId: row.localId,
          externalId: row.externalId,
          total: row.total,
        })),
        totalInstallments: receivables.length + payables.length,
        skippedFresh: selected.skippedFresh,
        staleSelected: selected.staleSelected,
        staleHotSelected: selected.staleHotSelected,
        staleColdSelected: selected.staleColdSelected,
      };
    },
  };
}

function allocationFingerprint(
  rows: readonly { readonly costCenterId: string; readonly amount: Prisma.Decimal }[],
): string {
  return rows
    .map((row) => `${row.costCenterId}:${row.amount.toFixed(4)}`)
    .sort()
    .join('|');
}
