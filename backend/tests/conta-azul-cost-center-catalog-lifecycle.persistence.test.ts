import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const costCenters = createContaAzulCostCenterRepository(prisma);

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
