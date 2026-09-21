import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createPartyReadRepository } from '../src/modules/finance/repositories/party-read.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const partyRead = createPartyReadRepository(prisma);

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

const party = (
  externalId: string,
  name: string,
  active = true,
  document: string | null = null,
  profiles: Array<'CUSTOMER' | 'SUPPLIER'> = ['CUSTOMER'],
) => ({
  externalId,
  name,
  document,
  active,
  profiles,
});

describe('Party catalog lifecycle (11-D repository)', () => {
  it('A/B/C) cria active, inativa por ativo=false upstream e reativa', async () => {
    const { tenant, integration } = await seedConnected('party-life-1');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    const created = await financial.upsertParties(scope, [party('p-1', 'Maria')]);
    expect(created.created).toBe(1);

    const row = await prisma.party.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'p-1' },
    });
    expect(row.active).toBe(true);

    const inactivated = await financial.upsertParties(scope, [
      party('p-1', 'Maria', false),
    ]);
    expect(inactivated.inactivatedByUpstream).toBe(1);
    expect(
      (
        await prisma.party.findFirstOrThrow({
          where: { id: row.id },
        })
      ).active,
    ).toBe(false);

    const reactivated = await financial.upsertParties(scope, [
      party('p-1', 'Maria Renomeada', true, '123', ['CUSTOMER', 'SUPPLIER']),
    ]);
    expect(reactivated.reactivated).toBe(1);

    const after = await prisma.party.findFirstOrThrow({ where: { id: row.id } });
    expect(after.active).toBe(true);
    expect(after.name).toBe('Maria Renomeada');
    expect(after.document).toBe('123');
    expect(after.profiles).toEqual(['CUSTOMER', 'SUPPLIER']);
    expect(await prisma.party.count({ where: { tenantId: tenant.id } })).toBe(1);
  });

  it('D/E) ausência no snapshot → inactive; upsert parcial (incremental) NÃO inativa', async () => {
    const { tenant, integration } = await seedConnected('party-life-d');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await financial.upsertParties(scope, [party('keep', 'Keep'), party('gone', 'Gone')]);

    // E) simula janela incremental só com "keep" — sem markAbsent.
    await financial.upsertParties(scope, [party('keep', 'Keep Updated')]);
    const afterIncremental = await prisma.party.findMany({ where: { tenantId: tenant.id } });
    const byExtInc = Object.fromEntries(afterIncremental.map((row) => [row.externalId, row.active]));
    expect(byExtInc.keep).toBe(true);
    expect(byExtInc.gone).toBe(true);

    // D) snapshot completo com present=['keep'] → inativa gone.
    const absent = await financial.markAbsentPartiesInactive({
      tenantId: tenant.id,
      integrationId: integration.id,
      presentExternalIds: ['keep'],
    });
    expect(absent).toBe(1);

    const gone = await prisma.party.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'gone' },
    });
    expect(gone.active).toBe(false);
    expect(await prisma.party.count({ where: { tenantId: tenant.id } })).toBe(2);
  });

  it('K/L) isolamento tenant e integration (cada tenant = integration distinta)', async () => {
    const a = await seedConnected('party-iso-a');
    const b = await seedConnected('party-iso-b');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');

    await financial.upsertParties(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [party('shared', 'A'), party('gone-a', 'Gone A')],
    );
    await financial.upsertParties(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [party('shared', 'B'), party('gone-b', 'Gone B')],
    );

    const inactivated = await financial.markAbsentPartiesInactive({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      presentExternalIds: ['shared'],
    });
    expect(inactivated).toBe(1);

    const aGone = await prisma.party.findFirstOrThrow({
      where: { integrationId: a.integration.id, externalId: 'gone-a' },
    });
    expect(aGone.active).toBe(false);

    const bGone = await prisma.party.findFirstOrThrow({
      where: { integrationId: b.integration.id, externalId: 'gone-b' },
    });
    expect(bGone.active).toBe(true);

    const bShared = await prisma.party.findFirstOrThrow({
      where: { integrationId: b.integration.id, externalId: 'shared' },
    });
    expect(bShared.active).toBe(true);
  });

  it('J-repo) present vazio NÃO mass-inativa', async () => {
    const { tenant, integration } = await seedConnected('party-empty');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
    await financial.upsertParties(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt },
      [party('a', 'A'), party('b', 'B')],
    );

    const count = await financial.markAbsentPartiesInactive({
      tenantId: tenant.id,
      integrationId: integration.id,
      presentExternalIds: [],
    });
    expect(count).toBe(0);
    const rows = await prisma.party.findMany({ where: { tenantId: tenant.id } });
    expect(rows.every((row) => row.active)).toBe(true);
  });

  it('M) Party inactive continua resolvível no party-read (sem filtro active)', async () => {
    const { tenant, integration } = await seedConnected('party-hist');
    const syncedAt = new Date('2026-09-13T12:00:00.000Z');
    await financial.upsertParties(
      { tenantId: tenant.id, integrationId: integration.id, syncedAt },
      [party('hist', 'Histórica')],
    );
    await financial.markAbsentPartiesInactive({
      tenantId: tenant.id,
      integrationId: integration.id,
      presentExternalIds: ['other-only'],
    });

    const row = await prisma.party.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'hist' },
    });
    expect(row.active).toBe(false);

    const names = await partyRead.findNamesByIds(
      { tenantId: tenant.id, integrationId: integration.id },
      [row.id],
    );
    expect(names.get(row.id)).toBe('Histórica');
  });
});
