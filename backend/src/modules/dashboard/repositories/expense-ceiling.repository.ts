import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';

export type ExpenseCeilingRecord = {
  readonly monthKey: string;
  readonly ceilingAmount: Prisma.Decimal;
  readonly updatedAt: Date;
};

/** `costCenterId` null (padrão) = teto geral da empresa; uuid = teto daquele centro. */
export type ExpenseCeilingRepository = {
  findByTenantMonth(
    tenantId: string,
    monthKey: string,
    costCenterId?: string | null,
  ): Promise<ExpenseCeilingRecord | null>;
  upsert(
    tenantId: string,
    monthKey: string,
    ceilingAmount: Prisma.Decimal,
    costCenterId?: string | null,
  ): Promise<ExpenseCeilingRecord>;
};

type RawRow = { monthKey: string; ceilingAmount: Prisma.Decimal; updatedAt: Date };

function assertTenantId(tenantId: string): void {
  if (tenantId.trim() === '') {
    throw new Error('tenantId é obrigatório na leitura do teto de gastos.');
  }
}

function toRecord(row: {
  monthKey: string;
  ceilingAmount: Prisma.Decimal;
  updatedAt: Date;
}): ExpenseCeilingRecord {
  return {
    monthKey: row.monthKey,
    ceilingAmount: row.ceilingAmount,
    updatedAt: row.updatedAt,
  };
}

/** Teto mensal de gastos por competência. Só o último valor é guardado. Sem delete. */
export function createExpenseCeilingRepository(prisma: PrismaClient): ExpenseCeilingRepository {
  return {
    async findByTenantMonth(tenantId, monthKey, costCenterId = null) {
      assertTenantId(tenantId);
      const row = await prisma.expenseCeiling.findFirst({
        where: { tenantId, monthKey, costCenterId },
      });
      return row === null ? null : toRecord(row);
    },

    async upsert(tenantId, monthKey, ceilingAmount, costCenterId = null) {
      assertTenantId(tenantId);
      // Upsert atômico contra os índices únicos parciais (geral × centro); o upsert do Prisma
      // não alcança índice parcial.
      const rows =
        costCenterId === null
          ? await prisma.$queryRaw<RawRow[]>`
              INSERT INTO "expense_ceilings" ("id", "tenant_id", "month_key", "ceiling_amount", "updated_at")
              VALUES (gen_random_uuid(), ${tenantId}::uuid, ${monthKey}, ${ceilingAmount}, now())
              ON CONFLICT ("tenant_id", "month_key") WHERE "cost_center_id" IS NULL
              DO UPDATE SET "ceiling_amount" = EXCLUDED."ceiling_amount", "updated_at" = now()
              RETURNING "month_key" AS "monthKey", "ceiling_amount" AS "ceilingAmount", "updated_at" AS "updatedAt"`
          : await prisma.$queryRaw<RawRow[]>`
              INSERT INTO "expense_ceilings" ("id", "tenant_id", "month_key", "cost_center_id", "ceiling_amount", "updated_at")
              VALUES (gen_random_uuid(), ${tenantId}::uuid, ${monthKey}, ${costCenterId}::uuid, ${ceilingAmount}, now())
              ON CONFLICT ("tenant_id", "month_key", "cost_center_id") WHERE "cost_center_id" IS NOT NULL
              DO UPDATE SET "ceiling_amount" = EXCLUDED."ceiling_amount", "updated_at" = now()
              RETURNING "month_key" AS "monthKey", "ceiling_amount" AS "ceilingAmount", "updated_at" AS "updatedAt"`;
      const row = rows[0];
      if (row === undefined) {
        throw new Error('Upsert do teto de gastos não retornou linha.');
      }
      return toRecord(row);
    },
  };
}
