import type { PrismaClient } from '../../../../generated/prisma/client.js';
import {
  emptyFinancialAccountCatalogUpsertCounters,
  type FinancialAccountCatalogUpsertCounters,
} from '../domain/conta-azul-financial-account-catalog-metrics.js';
import {
  emptyFinancialCategoryCatalogUpsertCounters,
  type FinancialCategoryCatalogUpsertCounters,
} from '../domain/conta-azul-financial-category-catalog-metrics.js';
import {
  emptyPartyCatalogUpsertCounters,
  type PartyCatalogUpsertCounters,
} from '../domain/conta-azul-party-catalog-metrics.js';
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
  ): Promise<FinancialCategoryCatalogUpsertCounters>;
  /**
   * Soft-inativa categorias ativas da integration ausentes do snapshot completo.
   * presentExternalIds vazio → no-op (11-C: nunca mass-inactivate em empty snapshot).
   * Idempotente: rows já inactive não são tocadas. Não altera syncedAt.
   */
  markAbsentCategoriesInactive(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly presentExternalIds: readonly string[];
  }): Promise<number>;
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
  upsertParties(
    scope: FinancialSyncScope,
    items: readonly MappedParty[],
  ): Promise<PartyCatalogUpsertCounters>;
  /**
   * Soft-inativa parties ativas da integration ausentes do snapshot completo.
   * presentExternalIds vazio → no-op (11-D: nunca mass-inactivate em empty snapshot).
   * Idempotente: rows já inactive não são tocadas. Não altera syncedAt.
   */
  markAbsentPartiesInactive(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly presentExternalIds: readonly string[];
  }): Promise<number>;
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
        return emptyFinancialCategoryCatalogUpsertCounters();
      }

      const externalIds = items.map((item) => item.externalId);
      const existing = await prisma.financialCategory.findMany({
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

      for (const item of items) {
        const priorActive = existingByExternal.get(item.externalId);
        if (priorActive === undefined) {
          created += 1;
        } else if (priorActive === false) {
          // Presente no snapshot ⇒ sempre reativa (API sem campo ativo).
          reactivated += 1;
        } else {
          updated += 1;
        }
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
              active: true,
              syncedAt: scope.syncedAt,
            },
            update: {
              name: item.name,
              type: item.type,
              parentExternalId: item.parentExternalId,
              upstreamVersion: item.upstreamVersion,
              active: true,
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );

      return {
        created,
        updated,
        reactivated,
        alreadyInactive: 0,
      };
    },

    async markAbsentCategoriesInactive(input) {
      const present = [...new Set(input.presentExternalIds.filter(Boolean))];
      // 11-C: present vazio nunca mass-inativa (empty snapshot conservador).
      if (present.length === 0) {
        return 0;
      }
      const result = await prisma.financialCategory.updateMany({
        where: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          active: true,
          externalId: { notIn: present },
        },
        data: {
          active: false,
        },
      });
      return result.count;
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
        return emptyPartyCatalogUpsertCounters();
      }

      const externalIds = items.map((item) => item.externalId);
      const existing = await prisma.party.findMany({
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

      return {
        created,
        updated,
        reactivated,
        inactivatedByUpstream,
        alreadyInactive,
      };
    },

    async markAbsentPartiesInactive(input) {
      const present = [...new Set(input.presentExternalIds.filter(Boolean))];
      // 11-D: present vazio nunca mass-inativa (empty snapshot conservador).
      if (present.length === 0) {
        return 0;
      }
      const result = await prisma.party.updateMany({
        where: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          active: true,
          externalId: { notIn: present },
        },
        data: {
          active: false,
        },
      });
      return result.count;
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
      const externalIds = items.map((item) => item.externalId);
      const previouslyDeleted = await prisma.receivable.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          externalId: { in: externalIds },
          lifecycleStatus: 'DELETED',
        },
        select: { externalId: true },
      });
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
              lifecycleStatus: 'ACTIVE',
              lifecycleDeletedAt: null,
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
              lifecycleStatus: 'ACTIVE',
              lifecycleDeletedAt: null,
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );
      if (previouslyDeleted.length > 0) {
        process.stdout.write(
          `${JSON.stringify({
            event: 'conta_azul_installment_presence_reactivate',
            kind: 'RECEIVABLE',
            tenantId: scope.tenantId,
            integrationId: scope.integrationId,
            reactivated: previouslyDeleted.length,
          })}\n`,
        );
      }
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
      const externalIds = items.map((item) => item.externalId);
      const previouslyDeleted = await prisma.payable.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          externalId: { in: externalIds },
          lifecycleStatus: 'DELETED',
        },
        select: { externalId: true },
      });
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
              lifecycleStatus: 'ACTIVE',
              lifecycleDeletedAt: null,
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
              lifecycleStatus: 'ACTIVE',
              lifecycleDeletedAt: null,
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );
      if (previouslyDeleted.length > 0) {
        process.stdout.write(
          `${JSON.stringify({
            event: 'conta_azul_installment_presence_reactivate',
            kind: 'PAYABLE',
            tenantId: scope.tenantId,
            integrationId: scope.integrationId,
            reactivated: previouslyDeleted.length,
          })}\n`,
        );
      }
    },
  };
}
