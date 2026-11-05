import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createCostCenterReadRepository } from '../src/modules/finance/repositories/cost-center-read.repository.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const costCenters = createContaAzulCostCenterRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const costCenterRead = createCostCenterReadRepository(prisma);

beforeAll(() => {
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

async function seedConnected(name: string) {
  const environment = loadEnvironment();
  const tenant = await tenants.create({ name, displayName: name });
  const integration = await integrations.persistConnectedTokens({
    tenantId: tenant.id,
    encryptedAccessToken: encryptSecret('access', environment.integrationEncryptionKey!),
    encryptedRefreshToken: encryptSecret('refresh', environment.integrationEncryptionKey!),
    accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    tokenType: 'Bearer',
    at: new Date(),
  });
  return { tenant, integration };
}

describe('Cost center catalog lifecycle (11-A repository)', () => {
  it('mantém ativo presente; inativa upstream inactive; reativa; marca ausentes', async () => {
    const a = await seedConnected('cc-life-a');
    const b = await seedConnected('cc-life-b');
    const syncedAt = new Date('2026-09-12T12:00:00.000Z');
    const scopeA = {
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      syncedAt,
    };
    const scopeB = {
      tenantId: b.tenant.id,
      integrationId: b.integration.id,
      syncedAt,
    };

    await costCenters.upsertCostCenters(scopeA, [
      { externalId: 'keep', code: 'K', name: 'Keep', active: true },
      { externalId: 'down', code: 'D', name: 'Down', active: true },
      { externalId: 'gone', code: 'G', name: 'Gone', active: true },
      { externalId: 'already', code: 'A', name: 'Already', active: false },
    ]);
    await costCenters.upsertCostCenters(scopeB, [
      { externalId: 'other', code: 'O', name: 'Other', active: true },
    ]);

    const upsert = await costCenters.upsertCostCenters(scopeA, [
      { externalId: 'keep', code: 'K', name: 'Keep', active: true },
      { externalId: 'down', code: 'D', name: 'Down', active: false },
      { externalId: 'already', code: 'A', name: 'Already', active: false },
      { externalId: 'back', code: null, name: 'Back', active: true },
    ]);
    expect(upsert.created).toBe(1);
    expect(upsert.inactivatedByUpstream).toBe(1);
    expect(upsert.alreadyInactive).toBe(1);

    // Reativa "already" via catálogo
    const reactivate = await costCenters.upsertCostCenters(scopeA, [
      { externalId: 'keep', code: 'K', name: 'Keep', active: true },
      { externalId: 'down', code: 'D', name: 'Down', active: false },
      { externalId: 'already', code: 'A', name: 'Already Again', active: true },
      { externalId: 'back', code: null, name: 'Back', active: true },
    ]);
    expect(reactivate.reactivated).toBe(1);

    const absent = await costCenters.markAbsentInactive({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      presentExternalIds: ['keep', 'down', 'already', 'back'],
      syncedAt: new Date('2026-09-12T13:00:00.000Z'),
    });
    expect(absent).toBe(1); // gone

    const listed = await costCenters.findCostCentersByTenant(a.tenant.id);
    const byExt = Object.fromEntries(listed.map((row) => [row.externalId, row]));
    expect(byExt.keep?.active).toBe(true);
    expect(byExt.down?.active).toBe(false);
    expect(byExt.gone?.active).toBe(false);
    expect(byExt.already?.active).toBe(true);
    expect(byExt.back?.active).toBe(true);

    const otherTenant = await costCenters.findCostCentersByTenant(b.tenant.id);
    expect(otherTenant).toHaveLength(1);
    expect(otherTenant[0]?.active).toBe(true);

    // Idempotência: ausente já inactive não incrementa
    const again = await costCenters.markAbsentInactive({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      presentExternalIds: ['keep', 'down', 'already', 'back'],
      syncedAt: new Date('2026-09-12T14:00:00.000Z'),
    });
    expect(again).toBe(0);
  });

  it('snapshot vazio completo inativa todos os ativos da integration', async () => {
    const { tenant, integration } = await seedConnected('cc-empty');
    const syncedAt = new Date('2026-09-12T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };
    await costCenters.upsertCostCenters(scope, [
      { externalId: 'a', code: null, name: 'A', active: true },
      { externalId: 'b', code: null, name: 'B', active: true },
      { externalId: 'c', code: null, name: 'C', active: false },
    ]);

    const count = await costCenters.markAbsentInactive({
      tenantId: tenant.id,
      integrationId: integration.id,
      presentExternalIds: [],
      syncedAt: new Date('2026-09-12T15:00:00.000Z'),
    });
    expect(count).toBe(2);

    const listed = await costCenters.findCostCentersByTenant(tenant.id);
    expect(listed.every((row) => row.active === false)).toBe(true);
  });

  it('enrichment não reativa inactive e materializa novo como inactive', async () => {
    const { tenant, integration } = await seedConnected('cc-enrich');
    const syncedAt = new Date('2026-09-12T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await costCenters.upsertCostCenters(scope, [
      { externalId: 'old', code: 'OLD', name: 'Old Name', active: false },
    ]);

    const existingId = await costCenters.upsertCostCenterByExternal(scope, {
      externalId: 'old',
      name: 'From Allocation',
    });
    const existing = await prisma.costCenter.findUniqueOrThrow({ where: { id: existingId } });
    expect(existing.active).toBe(false);
    expect(existing.code).toBe('OLD');
    expect(existing.name).toBe('From Allocation');

    const createdId = await costCenters.upsertCostCenterByExternal(scope, {
      externalId: 'hist',
      name: 'Historical Only',
    });
    const created = await prisma.costCenter.findUniqueOrThrow({ where: { id: createdId } });
    expect(created.active).toBe(false);
    expect(created.code).toBeNull();
    expect(created.name).toBe('Historical Only');
  });
});

describe('Centro de custo excluído no Conta Azul (catalogAbsentSince)', () => {
  function payable(externalId: string, dueDate: string) {
    return {
      externalId,
      description: null,
      dueDate: new Date(`${dueDate}T00:00:00.000Z`),
      competenceDate: new Date(`${dueDate}T00:00:00.000Z`),
      upstreamCreatedAt: null,
      upstreamUpdatedAt: null,
      status: 'PAID' as const,
      upstreamStatus: 'QUITADO',
      total: new Prisma.Decimal('100'),
      paid: new Prisma.Decimal('100'),
      unpaid: new Prisma.Decimal('0'),
      externalPartyId: null,
      externalPartyName: null,
      categoryExternalIds: [] as string[],
    };
  }

  /** keep = ativo; down = inativo no Conta Azul (presente); gone = excluído (ausente). */
  async function seedOctober(name: string) {
    const seeded = await seedConnected(name);
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date('2026-08-24T21:59:13.000Z'),
    };
    await costCenters.upsertCostCenters(scope, [
      { externalId: 'keep', code: null, name: 'Keep', active: true },
      { externalId: 'down', code: null, name: 'Down', active: true },
      { externalId: 'gone', code: null, name: 'Gone', active: true },
    ]);
    const ids = await costCenters.findCostCenterIdsByExternal(scope, ['keep', 'down', 'gone']);
    await financial.upsertPayables(scope, [
      payable('p-keep', '2026-10-10'),
      payable('p-down', '2026-10-11'),
      payable('p-gone', '2026-10-12'),
    ]);
    const local = new Map(
      (
        await prisma.payable.findMany({
          where: { tenantId: seeded.tenant.id },
          select: { id: true, externalId: true },
        })
      ).map((row) => [row.externalId, row.id]),
    );
    for (const key of ['keep', 'down', 'gone'] as const) {
      await costCenters.persistInstallmentCostCenterDetail({
        tenantId: seeded.tenant.id,
        kind: 'PAYABLE',
        installmentId: local.get(`p-${key}`)!,
        allocations: [{ costCenterId: ids.get(key)!, amount: new Prisma.Decimal('100') }],
        state: { status: 'FETCHED', syncedAt: scope.syncedAt, ruleVersion: 1 },
      });
    }
    return { seeded, scope, ids, local };
  }

  const october = {
    from: new Date('2026-10-01T00:00:00.000Z'),
    to: new Date('2026-10-31T00:00:00.000Z'),
  };

  it('descarta rateio só do excluído, reenfileira o título e some do mês passado', async () => {
    const { seeded, ids, local } = await seedOctober('cc-absent');
    const catalogSync = { ...{ tenantId: seeded.tenant.id, integrationId: seeded.integration.id } };
    const syncedAt = new Date('2026-11-05T14:22:44.000Z');

    // Catálogo completo devolve keep (ativo) e down (inativo); gone foi excluído.
    await costCenters.upsertCostCenters({ ...catalogSync, syncedAt }, [
      { externalId: 'keep', code: null, name: 'Keep', active: true },
      { externalId: 'down', code: null, name: 'Down', active: false },
    ]);
    await costCenters.markAbsentInactive({
      ...catalogSync,
      presentExternalIds: ['keep', 'down'],
      syncedAt,
    });

    const before = await costCenterRead.listVisibleForPeriod(seeded.tenant.id, october, {
      visibility: 'historical',
    });
    expect(before.map((row) => row.name).sort()).toEqual(['Down', 'Gone', 'Keep']);

    const purge = await costCenters.purgeCatalogAbsentCostCenters({
      ...catalogSync,
      presentExternalIds: ['keep', 'down'],
      syncedAt,
    });
    expect(purge).toEqual({ markedAbsent: 1, allocationsPurged: 1, installmentsRequeued: 1 });

    const after = await costCenterRead.listVisibleForPeriod(seeded.tenant.id, october, {
      visibility: 'historical',
    });
    // Inativo no Conta Azul mantém histórico; excluído some.
    expect(after.map((row) => row.name).sort()).toEqual(['Down', 'Keep']);

    const statuses = await prisma.payable.findMany({
      where: { tenantId: seeded.tenant.id },
      select: { id: true, costCenterDetailStatus: true },
    });
    const statusById = new Map(statuses.map((row) => [row.id, row.costCenterDetailStatus]));
    expect(statusById.get(local.get('p-gone')!)).toBe('UNKNOWN');
    expect(statusById.get(local.get('p-down')!)).toBe('FETCHED');
    expect(statusById.get(local.get('p-keep')!)).toBe('FETCHED');
    expect(
      await prisma.installmentCostCenterAllocation.count({ where: { costCenterId: ids.get('gone')! } }),
    ).toBe(0);

    expect(
      await costCenters.findCatalogAbsentExternalIds(catalogSync, ['keep', 'down', 'gone']),
    ).toEqual(new Set(['gone']));

    // Idempotente: segundo sync completo não muda nada.
    expect(
      await costCenters.purgeCatalogAbsentCostCenters({
        ...catalogSync,
        presentExternalIds: ['keep', 'down'],
        syncedAt,
      }),
    ).toEqual({ markedAbsent: 0, allocationsPurged: 0, installmentsRequeued: 0 });
  });

  it('centro já inativo antes da correção também é limpo (caso de produção)', async () => {
    const { seeded, ids } = await seedOctober('cc-absent-legacy');
    const catalogSync = { tenantId: seeded.tenant.id, integrationId: seeded.integration.id };
    // Estado legado: gone já foi inativado por ausência num sync antigo, sem purga.
    await prisma.costCenter.update({ where: { id: ids.get('gone')! }, data: { active: false } });

    const purge = await costCenters.purgeCatalogAbsentCostCenters({
      ...catalogSync,
      presentExternalIds: ['keep', 'down'],
      syncedAt: new Date('2026-11-05T15:00:00.000Z'),
    });
    expect(purge.allocationsPurged).toBe(1);
  });

  it('catálogo vazio não marca nem apaga nada', async () => {
    const { seeded } = await seedOctober('cc-absent-empty');
    const purge = await costCenters.purgeCatalogAbsentCostCenters({
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      presentExternalIds: [],
      syncedAt: new Date('2026-11-05T15:00:00.000Z'),
    });
    expect(purge).toEqual({ markedAbsent: 0, allocationsPurged: 0, installmentsRequeued: 0 });
    expect(
      await prisma.installmentCostCenterAllocation.count({ where: { tenantId: seeded.tenant.id } }),
    ).toBe(3);
  });

  it('centro que reaparece no catálogo deixa de ser excluído', async () => {
    const { seeded } = await seedOctober('cc-absent-back');
    const catalogSync = { tenantId: seeded.tenant.id, integrationId: seeded.integration.id };
    const syncedAt = new Date('2026-11-05T15:00:00.000Z');
    await costCenters.purgeCatalogAbsentCostCenters({
      ...catalogSync,
      presentExternalIds: ['keep', 'down'],
      syncedAt,
    });
    await costCenters.upsertCostCenters({ ...catalogSync, syncedAt }, [
      { externalId: 'gone', code: null, name: 'Gone', active: true },
    ]);
    expect(await costCenters.findCatalogAbsentExternalIds(catalogSync, ['gone'])).toEqual(new Set());
  });

  it('isola tenants: purga de A não toca rateios de B', async () => {
    const a = await seedOctober('cc-absent-a');
    const b = await seedOctober('cc-absent-b');
    await costCenters.purgeCatalogAbsentCostCenters({
      tenantId: a.seeded.tenant.id,
      integrationId: a.seeded.integration.id,
      presentExternalIds: ['keep', 'down'],
      syncedAt: new Date('2026-11-05T15:00:00.000Z'),
    });
    expect(
      await prisma.installmentCostCenterAllocation.count({ where: { tenantId: b.seeded.tenant.id } }),
    ).toBe(3);
  });
});
