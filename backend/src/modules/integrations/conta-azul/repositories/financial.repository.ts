import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type {
  MappedFinancialAccount,
  MappedFinancialCategory,
  MappedInstallment,
  MappedParty,
} from '../domain/conta-azul-financial-mappers.js';

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
  ): Promise<void>;
  upsertParties(scope: FinancialSyncScope, items: readonly MappedParty[]): Promise<void>;
  upsertReceivables(scope: FinancialSyncScope, items: readonly MappedInstallment[]): Promise<void>;
  upsertPayables(scope: FinancialSyncScope, items: readonly MappedInstallment[]): Promise<void>;
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
  return {
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
        return;
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
