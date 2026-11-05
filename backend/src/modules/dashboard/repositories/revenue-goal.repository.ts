import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';

export type RevenueGoalRecord = {
  readonly monthKey: string;
  readonly targetAmount: Prisma.Decimal;
  readonly updatedAt: Date;
};

/** `costCenterId` null (padrão) = meta geral da empresa; uuid = meta daquele centro. */
export type RevenueGoalRepository = {
  findByTenantMonth(
    tenantId: string,
    monthKey: string,
    costCenterId?: string | null,
  ): Promise<RevenueGoalRecord | null>;
  listByTenantMonths(
    tenantId: string,
    monthKeys: readonly string[],
    costCenterId?: string | null,
  ): Promise<readonly RevenueGoalRecord[]>;
  upsert(
    tenantId: string,
    monthKey: string,
    targetAmount: Prisma.Decimal,
    costCenterId?: string | null,
  ): Promise<RevenueGoalRecord>;
};

function assertTenantId(tenantId: string): void {
  if (tenantId.trim() === '') {
    throw new Error('tenantId é obrigatório na leitura da meta de faturamento.');
  }
}

type RawRow = { monthKey: string; targetAmount: Prisma.Decimal; updatedAt: Date };

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
    async findByTenantMonth(tenantId, monthKey, costCenterId = null) {
      assertTenantId(tenantId);
      const row = await prisma.revenueGoal.findFirst({
        where: { tenantId, monthKey, costCenterId },
      });
      return row === null ? null : toRecord(row);
    },

    async listByTenantMonths(tenantId, monthKeys, costCenterId = null) {
      assertTenantId(tenantId);
      const unique = [...new Set(monthKeys.filter((key) => key.trim() !== ''))];
      if (unique.length === 0) {
        return [];
      }
      const rows = await prisma.revenueGoal.findMany({
        where: { tenantId, monthKey: { in: unique }, costCenterId },
        orderBy: { monthKey: 'asc' },
      });
      return rows.map(toRecord);
    },

    async upsert(tenantId, monthKey, targetAmount, costCenterId = null) {
      assertTenantId(tenantId);
      // Upsert atômico contra os índices únicos parciais (geral × centro); o upsert do Prisma
      // não alcança índice parcial.
      const rows =
        costCenterId === null
          ? await prisma.$queryRaw<RawRow[]>`
              INSERT INTO "revenue_goals" ("id", "tenant_id", "month_key", "target_amount", "updated_at")
              VALUES (gen_random_uuid(), ${tenantId}::uuid, ${monthKey}, ${targetAmount}, now())
              ON CONFLICT ("tenant_id", "month_key") WHERE "cost_center_id" IS NULL
              DO UPDATE SET "target_amount" = EXCLUDED."target_amount", "updated_at" = now()
              RETURNING "month_key" AS "monthKey", "target_amount" AS "targetAmount", "updated_at" AS "updatedAt"`
          : await prisma.$queryRaw<RawRow[]>`
              INSERT INTO "revenue_goals" ("id", "tenant_id", "month_key", "cost_center_id", "target_amount", "updated_at")
              VALUES (gen_random_uuid(), ${tenantId}::uuid, ${monthKey}, ${costCenterId}::uuid, ${targetAmount}, now())
              ON CONFLICT ("tenant_id", "month_key", "cost_center_id") WHERE "cost_center_id" IS NOT NULL
              DO UPDATE SET "target_amount" = EXCLUDED."target_amount", "updated_at" = now()
              RETURNING "month_key" AS "monthKey", "target_amount" AS "targetAmount", "updated_at" AS "updatedAt"`;
      const row = rows[0];
      if (row === undefined) {
        throw new Error('Upsert da meta de faturamento não retornou linha.');
      }
      return toRecord(row);
    },
  };
}
