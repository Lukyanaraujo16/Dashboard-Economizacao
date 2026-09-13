import type { PrismaClient } from '../../../../generated/prisma/client.js';
import {
  emptyFinancialAccountCatalogUpsertCounters,
  type FinancialAccountCatalogUpsertCounters,
} from '../domain/conta-azul-financial-account-catalog-metrics.js';
import type {
  MappedFinancialAccount,
  MappedFinancialCategory,
  MappedInstallment,
  MappedParty,
} from '../domain/conta-azul-financial-mappers.js';
import {
  createContaAzulBalanceSnapshotRepository,
  type PersistedFinancialAccountForBalance,
  type UpsertDailyBalanceSnapshotInput,
} from './balance-snapshot.repository.js';

export type FinancialSyncScope = {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly syncedAt: Date;
};

export type ContaAzulFinancialRepository = {
  upsertCategories(
    scope: FinancialSyncScope,
    items: readonly MappedFinancialCategory[],
  ): Promise<void>;
  upsertAccounts(
    scope: FinancialSyncScope,
    items: readonly MappedFinancialAccount[],
  ): Promise<FinancialAccountCatalogUpsertCounters>;
  /**
   * Soft-inativa contas ativas da integration ausentes do snapshot completo.
   * presentExternalIds vazio → no-op (11-B: nunca mass-inactivate em empty snapshot).
   * Idempotente: rows já inactive não são tocadas.
   */
  markAbsentInactive(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly presentExternalIds: readonly string[];
    readonly syncedAt: Date;
  }): Promise<number>;
  upsertParties(scope: FinancialSyncScope, items: readonly MappedParty[]): Promise<void>;
  upsertReceivables(scope: FinancialSyncScope, items: readonly MappedInstallment[]): Promise<void>;
  upsertPayables(scope: FinancialSyncScope, items: readonly MappedInstallment[]): Promise<void>;
  /** Contas ativas do escopo — captura de saldo-atual (08-C1). */
  listActiveAccounts(scope: {
    readonly tenantId: string;
    readonly integrationId: string;
  }): Promise<readonly PersistedFinancialAccountForBalance[]>;
  upsertDailyBalanceSnapshot(input: UpsertDailyBalanceSnapshotInput): Promise<void>;
};

async function partyIdsByExternalId(
  prisma: PrismaClient,
  integrationId: string,
  externalIds: readonly string[],
): Promise<Map<string, string>> {
  const unique = [...new Set(externalIds.filter(Boolean))];
  if (unique.length === 0) {
    return new Map();
  }
  const rows = await prisma.party.findMany({
    where: { integrationId, externalId: { in: unique } },
    select: { id: true, externalId: true },
  });
  return new Map(rows.map((row) => [row.externalId, row.id]));
}

export function createContaAzulFinancialRepository(
  prisma: PrismaClient,
): ContaAzulFinancialRepository {
  const balanceSnapshots = createContaAzulBalanceSnapshotRepository(prisma);
  return {
    listActiveAccounts: (scope) => balanceSnapshots.listActiveAccounts(scope),
    upsertDailyBalanceSnapshot: (input) => balanceSnapshots.upsertDailyBalanceSnapshot(input),

    async upsertCategories(scope, items) {
      if (items.length === 0) {
        return;
      }
      await prisma.$transaction(
        items.map((item) =>
          prisma.financialCategory.upsert({
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
              name: item.name,
              type: item.type,
              parentExternalId: item.parentExternalId,
              upstreamVersion: item.upstreamVersion,
              syncedAt: scope.syncedAt,
            },
            update: {
              name: item.name,
              type: item.type,
              parentExternalId: item.parentExternalId,
              upstreamVersion: item.upstreamVersion,
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );
    },

    async upsertAccounts(scope, items) {
      if (items.length === 0) {
        return emptyFinancialAccountCatalogUpsertCounters();
      }

      const externalIds = items.map((item) => item.externalId);
      const existing = await prisma.financialAccount.findMany({
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
          prisma.financialAccount.upsert({
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
              name: item.name,
              type: item.type,
              active: item.active,
              syncedAt: scope.syncedAt,
            },
            update: {
              name: item.name,
              type: item.type,
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
      // 11-B: present vazio nunca mass-inativa (empty snapshot conservador).
      if (present.length === 0) {
        return 0;
      }
      const result = await prisma.financialAccount.updateMany({
        where: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          active: true,
          externalId: { notIn: present },
        },
        data: {
          active: false,
          syncedAt: input.syncedAt,
        },
      });
      return result.count;
    },

    async upsertParties(scope, items) {
      if (items.length === 0) {
        return;
      }
      await prisma.$transaction(
        items.map((item) =>
          prisma.party.upsert({
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
              name: item.name,
              document: item.document,
              active: item.active,
              profiles: item.profiles,
              syncedAt: scope.syncedAt,
            },
            update: {
              name: item.name,
              document: item.document,
              active: item.active,
              profiles: item.profiles,
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );
    },

    async upsertReceivables(scope, items) {
      if (items.length === 0) {
        return;
      }
      const partyIds = await partyIdsByExternalId(
        prisma,
        scope.integrationId,
        items.map((item) => item.externalPartyId ?? ''),
      );
      await prisma.$transaction(
        items.map((item) =>
          prisma.receivable.upsert({
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
              description: item.description,
              dueDate: item.dueDate,
              competenceDate: item.competenceDate,
              upstreamCreatedAt: item.upstreamCreatedAt,
              upstreamUpdatedAt: item.upstreamUpdatedAt,
              status: item.status,
              upstreamStatus: item.upstreamStatus,
              total: item.total,
              paid: item.paid,
              unpaid: item.unpaid,
              externalCustomerId: item.externalPartyId,
              partyId: item.externalPartyId ? (partyIds.get(item.externalPartyId) ?? null) : null,
              categoryExternalIds: item.categoryExternalIds,
              syncedAt: scope.syncedAt,
            },
            update: {
              description: item.description,
              dueDate: item.dueDate,
              competenceDate: item.competenceDate,
              upstreamCreatedAt: item.upstreamCreatedAt,
              upstreamUpdatedAt: item.upstreamUpdatedAt,
              status: item.status,
              upstreamStatus: item.upstreamStatus,
              total: item.total,
              paid: item.paid,
              unpaid: item.unpaid,
              externalCustomerId: item.externalPartyId,
              partyId: item.externalPartyId ? (partyIds.get(item.externalPartyId) ?? null) : null,
              categoryExternalIds: item.categoryExternalIds,
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );
    },

    async upsertPayables(scope, items) {
      if (items.length === 0) {
        return;
      }
      const partyIds = await partyIdsByExternalId(
        prisma,
        scope.integrationId,
        items.map((item) => item.externalPartyId ?? ''),
      );
      await prisma.$transaction(
        items.map((item) =>
          prisma.payable.upsert({
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
              description: item.description,
              dueDate: item.dueDate,
              competenceDate: item.competenceDate,
              upstreamCreatedAt: item.upstreamCreatedAt,
              upstreamUpdatedAt: item.upstreamUpdatedAt,
              status: item.status,
              upstreamStatus: item.upstreamStatus,
              total: item.total,
              paid: item.paid,
              unpaid: item.unpaid,
              externalSupplierId: item.externalPartyId,
              partyId: item.externalPartyId ? (partyIds.get(item.externalPartyId) ?? null) : null,
              categoryExternalIds: item.categoryExternalIds,
              syncedAt: scope.syncedAt,
            },
            update: {
              description: item.description,
              dueDate: item.dueDate,
              competenceDate: item.competenceDate,
              upstreamCreatedAt: item.upstreamCreatedAt,
              upstreamUpdatedAt: item.upstreamUpdatedAt,
              status: item.status,
              upstreamStatus: item.upstreamStatus,
              total: item.total,
              paid: item.paid,
              unpaid: item.unpaid,
              externalSupplierId: item.externalPartyId,
              partyId: item.externalPartyId ? (partyIds.get(item.externalPartyId) ?? null) : null,
              categoryExternalIds: item.categoryExternalIds,
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );
    },
  };
}
