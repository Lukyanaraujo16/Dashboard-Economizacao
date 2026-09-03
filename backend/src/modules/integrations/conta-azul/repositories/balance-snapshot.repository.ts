import type { Prisma, PrismaClient } from '../../../../generated/prisma/client.js';

export type BalanceSnapshotSyncScope = {
  readonly tenantId: string;
  readonly integrationId: string;
};

export type PersistedFinancialAccountForBalance = {
  readonly id: string;
  readonly externalId: string;
  readonly active: boolean;
};

export type UpsertDailyBalanceSnapshotInput = {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly financialAccountId: string;
  readonly financialAccountExternalId: string;
  readonly balance: Prisma.Decimal;
  readonly balanceDate: Date;
  readonly capturedAt: Date;
  readonly accountActiveAtCapture: boolean;
};

export type PersistedBalanceSnapshot = {
  readonly id: string;
  readonly tenantId: string;
  readonly financialAccountId: string;
  readonly financialAccountExternalId: string;
  readonly balance: Prisma.Decimal;
  readonly balanceDate: Date;
  readonly capturedAt: Date;
  readonly accountActiveAtCapture: boolean;
};

export type ContaAzulBalanceSnapshotRepository = {
  listActiveAccounts(scope: BalanceSnapshotSyncScope): Promise<readonly PersistedFinancialAccountForBalance[]>;
  listActiveAccountsByTenant(tenantId: string): Promise<readonly PersistedFinancialAccountForBalance[]>;
  upsertDailyBalanceSnapshot(input: UpsertDailyBalanceSnapshotInput): Promise<void>;
  listByTenantAndDateRange(input: {
    readonly tenantId: string;
    readonly from: Date;
    readonly to: Date;
  }): Promise<readonly PersistedBalanceSnapshot[]>;
  countActiveAccounts(tenantId: string): Promise<number>;
};

export function createContaAzulBalanceSnapshotRepository(
  prisma: PrismaClient,
): ContaAzulBalanceSnapshotRepository {
  return {
    async listActiveAccounts(scope) {
      return prisma.financialAccount.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          active: true,
        },
        select: { id: true, externalId: true, active: true },
        orderBy: { externalId: 'asc' },
      });
    },

    async listActiveAccountsByTenant(tenantId) {
      return prisma.financialAccount.findMany({
        where: { tenantId, active: true },
        select: { id: true, externalId: true, active: true },
        orderBy: { externalId: 'asc' },
      });
    },

    async upsertDailyBalanceSnapshot(input) {
      await prisma.financialAccountBalanceSnapshot.upsert({
        where: {
          financialAccountId_balanceDate: {
            financialAccountId: input.financialAccountId,
            balanceDate: input.balanceDate,
          },
        },
        create: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          financialAccountId: input.financialAccountId,
          financialAccountExternalId: input.financialAccountExternalId,
          balance: input.balance,
          balanceDate: input.balanceDate,
          capturedAt: input.capturedAt,
          accountActiveAtCapture: input.accountActiveAtCapture,
        },
        update: {
          balance: input.balance,
          capturedAt: input.capturedAt,
          accountActiveAtCapture: input.accountActiveAtCapture,
          financialAccountExternalId: input.financialAccountExternalId,
        },
      });
    },

    async listByTenantAndDateRange(input) {
      const rows = await prisma.financialAccountBalanceSnapshot.findMany({
        where: {
          tenantId: input.tenantId,
          balanceDate: { gte: input.from, lte: input.to },
        },
        orderBy: [{ balanceDate: 'asc' }, { financialAccountExternalId: 'asc' }],
      });
      return rows.map((row) => ({
        id: row.id,
        tenantId: row.tenantId,
        financialAccountId: row.financialAccountId,
        financialAccountExternalId: row.financialAccountExternalId,
        balance: row.balance,
        balanceDate: row.balanceDate,
        capturedAt: row.capturedAt,
        accountActiveAtCapture: row.accountActiveAtCapture,
      }));
    },

    async countActiveAccounts(tenantId) {
      return prisma.financialAccount.count({
        where: { tenantId, active: true },
      });
    },
  };
}
