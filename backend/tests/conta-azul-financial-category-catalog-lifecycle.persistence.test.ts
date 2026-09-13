import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);

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

const cat = (externalId: string, name: string, type: 'REVENUE' | 'EXPENSE' | 'UNKNOWN' = 'REVENUE') => ({
  externalId,
  name,
  type,
  parentExternalId: null as string | null,
  upstreamVersion: 1,
});

describe('Financial category catalog lifecycle (11-C repository)', () => {
  it('A/B/C/M) cria active, atualiza campos, reativa e nunca hard-delete', async () => {
    const { tenant, integration } = await seedConnected('fc-life-1');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    const created = await financial.upsertCategories(scope, [cat('a', 'Alpha')]);
    expect(created.created).toBe(1);

    const row = await prisma.financialCategory.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'a' },
    });
    expect(row.active).toBe(true);
    expect(row.name).toBe('Alpha');

    await prisma.financialCategory.update({
      where: { id: row.id },
      data: { active: false },
    });

    const reactivated = await financial.upsertCategories(scope, [
      {
        ...cat('a', 'Alpha Renomeada', 'EXPENSE'),
        parentExternalId: 'pai-x',
        upstreamVersion: 7,
      },
    ]);
    expect(reactivated.reactivated).toBe(1);

    const after = await prisma.financialCategory.findFirstOrThrow({ where: { id: row.id } });
    expect(after.active).toBe(true);
    expect(after.name).toBe('Alpha Renomeada');
    expect(after.type).toBe('EXPENSE');
    expect(after.parentExternalId).toBe('pai-x');
    expect(after.upstreamVersion).toBe(7);
    expect(await prisma.financialCategory.count({ where: { tenantId: tenant.id } })).toBe(1);
  });

  it('D/E/F) ausente → inactive; já inactive permanece; isolamento integration', async () => {
    const a = await seedConnected('fc-life-a');
    const b = await seedConnected('fc-life-b');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
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

    await financial.upsertCategories(scopeA, [cat('keep', 'Keep'), cat('gone', 'Gone')]);
    await financial.upsertCategories(scopeB, [cat('other', 'Other')]);

    await prisma.financialCategory.updateMany({
      where: { tenantId: a.tenant.id, externalId: 'gone-already' },
      data: { active: false },
    });
    await prisma.financialCategory.create({
      data: {
        tenantId: a.tenant.id,
        integrationId: a.integration.id,
        externalId: 'gone-already',
        name: 'Já Inactive',
        type: 'UNKNOWN',
        parentExternalId: null,
        upstreamVersion: 1,
        active: false,
        syncedAt,
      },
    });

    const absent = await financial.markAbsentCategoriesInactive({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      presentExternalIds: ['keep'],
    });
    expect(absent).toBe(1);

    const rowsA = await prisma.financialCategory.findMany({ where: { tenantId: a.tenant.id } });
    const byExt = Object.fromEntries(rowsA.map((row) => [row.externalId, row.active]));
    expect(byExt.keep).toBe(true);
    expect(byExt.gone).toBe(false);
    expect(byExt['gone-already']).toBe(false);

    const rowsB = await prisma.financialCategory.findMany({ where: { tenantId: b.tenant.id } });
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]?.active).toBe(true);

    const again = await financial.markAbsentCategoriesInactive({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      presentExternalIds: ['keep'],
    });
    expect(again).toBe(0);
  });

  it('G) present vazio NÃO mass-inativa (empty snapshot conservador)', async () => {
    const { tenant, integration } = await seedConnected('fc-empty');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
    await financial.upsertCategories(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt },
      [cat('a', 'A'), cat('b', 'B')],
    );

    const count = await financial.markAbsentCategoriesInactive({
      tenantId: tenant.id,
      integrationId: integration.id,
      presentExternalIds: [],
    });
    expect(count).toBe(0);
    const rows = await prisma.financialCategory.findMany({ where: { tenantId: tenant.id } });
    expect(rows.every((row) => row.active)).toBe(true);
  });

  it('L) reexecução idempotente sem duplicar', async () => {
    const { tenant, integration } = await seedConnected('fc-idem');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await financial.upsertCategories(scope, [cat('x', 'X')]);
    const second = await financial.upsertCategories(scope, [cat('x', 'X')]);
    expect(second.created).toBe(0);
    expect(second.updated).toBe(1);
    expect(second.reactivated).toBe(0);
    expect(await prisma.financialCategory.count({ where: { tenantId: tenant.id } })).toBe(1);
  });
});
