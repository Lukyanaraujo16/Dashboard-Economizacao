import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { parseCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
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

describe('Persistência CC1 centros de custo', () => {
  it('faz upsert de catálogo e alocações com unique por centro×parcela', async () => {
    const { tenant, integration } = await seedConnected('cc1-persist');
    const syncedAt = new Date('2026-08-20T12:00:00.000Z');
    const scope = {
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt,
    };

    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-1', code: 'JAC', name: 'Jacaraípe', active: true },
      { externalId: 'cc-2', code: null, name: 'Laranjeiras', active: true },
    ]);
    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-1', code: 'JAC', name: 'Clínica Jacaraípe', active: true },
    ]);

    const listed = await costCenters.findCostCentersByTenant(tenant.id);
    expect(listed).toHaveLength(2);
    expect(listed[0]?.name === 'Clínica Jacaraípe' || listed[1]?.name === 'Clínica Jacaraípe').toBe(
      true,
    );

    await financial.upsertReceivables(scope, [
      {
        externalId: 'ar-1',
        description: 'Consulta',
        dueDate: parseCivilDate('2026-08-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-08-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-08-19T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('100'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('100'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ]);

    const receivable = await prisma.receivable.findFirstOrThrow({
      where: { integrationId: integration.id, externalId: 'ar-1' },
    });
    const ids = await costCenters.findCostCenterIdsByExternal(
      { tenantId: tenant.id, integrationId: integration.id },
      ['cc-1', 'cc-2'],
    );

    await costCenters.replaceAllocationsForReceivable(
      tenant.id,
      receivable.id,
      [
        { costCenterId: ids.get('cc-1')!, amount: new Prisma.Decimal('60') },
        { costCenterId: ids.get('cc-2')!, amount: new Prisma.Decimal('40') },
      ],
      syncedAt,
    );

    await costCenters.replaceAllocationsForReceivable(
      tenant.id,
      receivable.id,
      [{ costCenterId: ids.get('cc-1')!, amount: new Prisma.Decimal('100') }],
      new Date('2026-08-20T13:00:00.000Z'),
    );

    const rows = await prisma.installmentCostCenterAllocation.findMany({
      where: { receivableId: receivable.id },
      orderBy: { amount: 'desc' },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.costCenterId).toBe(ids.get('cc-1'));
    expect(rows[0]?.amount.equals(new Prisma.Decimal('100'))).toBe(true);
    expect(rows[0]?.payableId).toBeNull();

    await expect(
      prisma.installmentCostCenterAllocation.create({
        data: {
          tenantId: tenant.id,
          receivableId: receivable.id,
          costCenterId: ids.get('cc-1')!,
          amount: new Prisma.Decimal('1'),
          syncedAt,
        },
      }),
    ).rejects.toMatchObject({ code: 'P2002' });
  });
});
