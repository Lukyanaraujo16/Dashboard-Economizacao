import type { Prisma, PrismaClient } from '../../../generated/prisma/client.js';

export type ExpenseCeilingRecord = {
  readonly monthKey: string;
  readonly ceilingAmount: Prisma.Decimal;
  readonly updatedAt: Date;
};

export type ExpenseCeilingRepository = {
  findByTenantMonth(tenantId: string, monthKey: string): Promise<ExpenseCeilingRecord | null>;
  upsert(
    tenantId: string,
    monthKey: string,
    ceilingAmount: Prisma.Decimal,
  ): Promise<ExpenseCeilingRecord>;
};

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
    async findByTenantMonth(tenantId, monthKey) {
      assertTenantId(tenantId);
      const row = await prisma.expenseCeiling.findUnique({
        where: { tenantId_monthKey: { tenantId, monthKey } },
      });
      return row === null ? null : toRecord(row);
    },

    async upsert(tenantId, monthKey, ceilingAmount) {
      assertTenantId(tenantId);
      const row = await prisma.expenseCeiling.upsert({
        where: { tenantId_monthKey: { tenantId, monthKey } },
        create: { tenantId, monthKey, ceilingAmount },
        update: { ceilingAmount },
      });
      return toRecord(row);
    },
  };
}
