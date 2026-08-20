import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';

export type RevenueGoalRecord = {
  readonly monthKey: string;
  readonly targetAmount: Prisma.Decimal;
  readonly updatedAt: Date;
};

export type RevenueGoalRepository = {
  findByTenantMonth(tenantId: string, monthKey: string): Promise<RevenueGoalRecord | null>;
  listByTenantMonths(
    tenantId: string,
    monthKeys: readonly string[],
  ): Promise<readonly RevenueGoalRecord[]>;
  upsert(
    tenantId: string,
    monthKey: string,
    targetAmount: Prisma.Decimal,
  ): Promise<RevenueGoalRecord>;
};

function assertTenantId(tenantId: string): void {
  if (tenantId.trim() === '') {
    throw new Error('tenantId é obrigatório na leitura da meta de faturamento.');
  }
}

function toRecord(row: {
  monthKey: string;
  targetAmount: Prisma.Decimal;
  updatedAt: Date;
}): RevenueGoalRecord {
  return { monthKey: row.monthKey, targetAmount: row.targetAmount, updatedAt: row.updatedAt };
}

/** Meta mensal de faturamento por competência. Só o último valor é guardado (sem histórico de revisões). */
export function createRevenueGoalRepository(prisma: PrismaClient): RevenueGoalRepository {
  return {
    async findByTenantMonth(tenantId, monthKey) {
      assertTenantId(tenantId);
      const row = await prisma.revenueGoal.findUnique({
        where: { tenantId_monthKey: { tenantId, monthKey } },
      });
      return row === null ? null : toRecord(row);
    },

    async listByTenantMonths(tenantId, monthKeys) {
      assertTenantId(tenantId);
      const unique = [...new Set(monthKeys.filter((key) => key.trim() !== ''))];
      if (unique.length === 0) {
        return [];
      }
      const rows = await prisma.revenueGoal.findMany({
        where: { tenantId, monthKey: { in: unique } },
        orderBy: { monthKey: 'asc' },
      });
      return rows.map(toRecord);
    },

    async upsert(tenantId, monthKey, targetAmount) {
      assertTenantId(tenantId);
      const row = await prisma.revenueGoal.upsert({
        where: { tenantId_monthKey: { tenantId, monthKey } },
        create: { tenantId, monthKey, targetAmount },
        update: { targetAmount },
      });
      return toRecord(row);
    },
  };
}
