import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createExpenseCeilingRepository } from '../src/modules/dashboard/repositories/expense-ceiling.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const ceilings = createExpenseCeilingRepository(prisma);

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

describe('ExpenseCeilingRepository', () => {
  it('isola teto por empresa e por mês e só faz upsert', async () => {
    const tenantA = await tenants.create({ name: 'ceiling-a', displayName: 'A' });
    const tenantB = await tenants.create({ name: 'ceiling-b', displayName: 'B' });

    await ceilings.upsert(tenantA.id, '2026-09', new Prisma.Decimal('100'));
    await ceilings.upsert(tenantA.id, '2026-09', new Prisma.Decimal('120.5000'));
    await ceilings.upsert(tenantA.id, '2026-10', new Prisma.Decimal('80'));
    await ceilings.upsert(tenantB.id, '2026-09', new Prisma.Decimal('50'));

    const september = await ceilings.findByTenantMonth(tenantA.id, '2026-09');
    const october = await ceilings.findByTenantMonth(tenantA.id, '2026-10');
    const other = await ceilings.findByTenantMonth(tenantB.id, '2026-09');
    expect(september?.ceilingAmount.equals('120.5000')).toBe(true);
    expect(october?.ceilingAmount.equals(80)).toBe(true);
    expect(other?.ceilingAmount.equals(50)).toBe(true);
    expect(await ceilings.findByTenantMonth(tenantA.id, '2026-08')).toBeNull();
    expect(await prisma.expenseCeiling.count({ where: { tenantId: tenantA.id } })).toBe(2);
    expect('delete' in ceilings).toBe(false);
  });

  it('recusa tenantId vazio', async () => {
    await expect(ceilings.findByTenantMonth('  ', '2026-09')).rejects.toThrow();
    await expect(ceilings.upsert('', '2026-09', new Prisma.Decimal('10'))).rejects.toThrow();
  });
});
