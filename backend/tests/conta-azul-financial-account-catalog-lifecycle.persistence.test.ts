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

describe('Financial account catalog lifecycle (11-B repository)', () => {
  it('1/2/4/11) active/inactive upstream, reativa e nunca hard-delete', async () => {
    const { tenant, integration } = await seedConnected('fa-life-1');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    const created = await financial.upsertAccounts(scope, [
      { externalId: 'a', name: 'A', type: 'CONTA_CORRENTE', active: true },
    ]);
    expect(created.created).toBe(1);

    const inactivated = await financial.upsertAccounts(scope, [
      { externalId: 'a', name: 'A', type: 'CONTA_CORRENTE', active: false },
    ]);
    expect(inactivated.inactivatedByUpstream).toBe(1);

    const row = await prisma.financialAccount.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'a' },
    });
    expect(row.active).toBe(false);

    const reactivated = await financial.upsertAccounts(scope, [
      { externalId: 'a', name: 'A', type: 'CONTA_CORRENTE', active: true },
    ]);
    expect(reactivated.reactivated).toBe(1);
    expect(
      (
        await prisma.financialAccount.findFirstOrThrow({
          where: { id: row.id },
        })
      ).active,
    ).toBe(true);
    expect(await prisma.financialAccount.count({ where: { tenantId: tenant.id } })).toBe(1);
  });

  it('3/10) ausente após snapshot completo → inactive; isolation tenant', async () => {
    const a = await seedConnected('fa-life-a');
    const b = await seedConnected('fa-life-b');
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

    await financial.upsertAccounts(scopeA, [
      { externalId: 'keep', name: 'Keep', type: 'CONTA_CORRENTE', active: true },
      { externalId: 'gone', name: 'Gone', type: 'CONTA_CORRENTE', active: true },
    ]);
    await financial.upsertAccounts(scopeB, [
      { externalId: 'other', name: 'Other', type: 'CONTA_CORRENTE', active: true },
    ]);

    const absent = await financial.markAbsentInactive({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      presentExternalIds: ['keep'],
      syncedAt: new Date('2026-09-13T13:00:00.000Z'),
    });
    expect(absent).toBe(1);

    const rowsA = await prisma.financialAccount.findMany({ where: { tenantId: a.tenant.id } });
    const byExt = Object.fromEntries(rowsA.map((row) => [row.externalId, row.active]));
    expect(byExt.keep).toBe(true);
    expect(byExt.gone).toBe(false);

    const rowsB = await prisma.financialAccount.findMany({ where: { tenantId: b.tenant.id } });
    expect(rowsB).toHaveLength(1);
    expect(rowsB[0]?.active).toBe(true);
  });

  it('9) present vazio NÃO mass-inativa (empty snapshot conservador)', async () => {
    const { tenant, integration } = await seedConnected('fa-empty');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
    await financial.upsertAccounts(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt },
      [
        { externalId: 'a', name: 'A', type: 'CONTA_CORRENTE', active: true },
        { externalId: 'b', name: 'B', type: 'CONTA_CORRENTE', active: true },
      ],
    );

    const count = await financial.markAbsentInactive({
      tenantId: tenant.id,
      integrationId: integration.id,
      presentExternalIds: [],
      syncedAt: new Date('2026-09-13T15:00:00.000Z'),
    });
    expect(count).toBe(0);
    const rows = await prisma.financialAccount.findMany({ where: { tenantId: tenant.id } });
    expect(rows.every((row) => row.active)).toBe(true);
  });
});
