import { afterAll, afterEach, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createRevenueGoalRepository } from '../src/modules/dashboard/repositories/revenue-goal.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const goals = createRevenueGoalRepository(prisma);

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedTenant(name: string) {
  return tenants.create({ name, displayName: name });
}

describe('RevenueGoalRepository', () => {
  it('cria e depois sobrescreve a meta da mesma competência (uma linha por mês)', async () => {
    const tenant = await seedTenant('goal-upsert');

    const created = await goals.upsert(tenant.id, '2026-08', new Prisma.Decimal('180000.00'));
    expect(created.monthKey).toBe('2026-08');
    expect(created.targetAmount.equals(180000)).toBe(true);

    const updated = await goals.upsert(tenant.id, '2026-08', new Prisma.Decimal('200000.50'));
    expect(updated.targetAmount.equals(new Prisma.Decimal('200000.50'))).toBe(true);

    const rows = await prisma.revenueGoal.findMany({ where: { tenantId: tenant.id } });
    expect(rows).toHaveLength(1);
  });

  it('mantém metas independentes por competência', async () => {
    const tenant = await seedTenant('goal-months');
    await goals.upsert(tenant.id, '2026-07', new Prisma.Decimal('100'));
    await goals.upsert(tenant.id, '2026-08', new Prisma.Decimal('200'));

    const july = await goals.findByTenantMonth(tenant.id, '2026-07');
    const august = await goals.findByTenantMonth(tenant.id, '2026-08');
    expect(july!.targetAmount.equals(100)).toBe(true);
    expect(august!.targetAmount.equals(200)).toBe(true);

    const listed = await goals.listByTenantMonths(tenant.id, ['2026-06', '2026-07', '2026-08']);
    expect(listed.map((goal) => goal.monthKey)).toEqual(['2026-07', '2026-08']);
  });

  it('isola metas entre empresas', async () => {
    const a = await seedTenant('goal-tenant-a');
    const b = await seedTenant('goal-tenant-b');
    await goals.upsert(a.id, '2026-08', new Prisma.Decimal('111'));
    await goals.upsert(b.id, '2026-08', new Prisma.Decimal('222'));

    expect((await goals.findByTenantMonth(a.id, '2026-08'))!.targetAmount.equals(111)).toBe(true);
    expect((await goals.findByTenantMonth(b.id, '2026-08'))!.targetAmount.equals(222)).toBe(true);
    expect(await goals.listByTenantMonths(a.id, ['2026-08'])).toHaveLength(1);
  });

  it('competência sem meta retorna null e lista vazia', async () => {
    const tenant = await seedTenant('goal-empty');
    expect(await goals.findByTenantMonth(tenant.id, '2026-08')).toBeNull();
    expect(await goals.listByTenantMonths(tenant.id, [])).toEqual([]);
  });

  it('recusa tenantId vazio', async () => {
    await expect(goals.findByTenantMonth('   ', '2026-08')).rejects.toThrow();
    await expect(goals.upsert('', '2026-08', new Prisma.Decimal('10'))).rejects.toThrow();
  });

  it('preserva a escala decimal da meta', async () => {
    const tenant = await seedTenant('goal-scale');
    const saved = await goals.upsert(tenant.id, '2026-08', new Prisma.Decimal('12345.6789'));
    expect(saved.targetAmount.equals(new Prisma.Decimal('12345.6789'))).toBe(true);
    expect(saved.targetAmount).toBeInstanceOf(Prisma.Decimal);
  });
});
