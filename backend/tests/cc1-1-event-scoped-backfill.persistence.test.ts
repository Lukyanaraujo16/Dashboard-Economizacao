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
import {
  applyEventScopedSingleCenterBackfill,
  listEventScopedSingleCenterOverCandidates,
} from '../scripts/cc1-1-fix-event-scoped-backfill.js';
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

describe('CC1.1 backfill EVENT_SCOPED_SINGLE_CENTER', () => {
  it('corrige OVER 1-centro e é idempotente; isola tenant', async () => {
    const a = await seedConnected('cc11-a');
    const b = await seedConnected('cc11-b');
    const syncedAt = new Date('2026-08-21T12:00:00.000Z');

    for (const ctx of [a, b]) {
      const scope = {
        tenantId: ctx.tenant.id,
        integrationId: ctx.integration.id,
        syncedAt,
      };
      await costCenters.upsertCostCenters(scope, [
        { externalId: 'cc-1', code: null, name: 'Centro', active: true },
      ]);
      await financial.upsertPayables(scope, [
        {
          externalId: `ap-${ctx.tenant.name}`,
          description: '14/36 - serie',
          dueDate: parseCivilDate('2026-05-10', 'dueDate'),
          competenceDate: parseCivilDate('2026-05-01', 'competenceDate'),
          upstreamCreatedAt: null,
          upstreamUpdatedAt: new Date('2026-05-01T10:00:00.000Z'),
          status: 'OPEN',
          upstreamStatus: 'EM_ABERTO',
          total: new Prisma.Decimal('315.21'),
          paid: new Prisma.Decimal('0'),
          unpaid: new Prisma.Decimal('315.21'),
          externalPartyId: null,
          categoryExternalIds: [],
        },
        {
          externalId: `ap-match-${ctx.tenant.name}`,
          description: 'avulso',
          dueDate: parseCivilDate('2026-08-10', 'dueDate'),
          competenceDate: parseCivilDate('2026-08-01', 'competenceDate'),
          upstreamCreatedAt: null,
          upstreamUpdatedAt: new Date('2026-08-01T10:00:00.000Z'),
          status: 'OPEN',
          upstreamStatus: 'EM_ABERTO',
          total: new Prisma.Decimal('100'),
          paid: new Prisma.Decimal('0'),
          unpaid: new Prisma.Decimal('100'),
          externalPartyId: null,
          categoryExternalIds: [],
        },
      ]);
    }

    const payableA = await prisma.payable.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'ap-cc11-a' },
    });
    const matchA = await prisma.payable.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'ap-match-cc11-a' },
    });
    const payableB = await prisma.payable.findFirstOrThrow({
      where: { tenantId: b.tenant.id, externalId: 'ap-cc11-b' },
    });

    const idsA = await costCenters.findCostCenterIdsByExternal(
      { tenantId: a.tenant.id, integrationId: a.integration.id },
      ['cc-1'],
    );
    const idsB = await costCenters.findCostCenterIdsByExternal(
      { tenantId: b.tenant.id, integrationId: b.integration.id },
      ['cc-1'],
    );

    await costCenters.replaceAllocationsForPayable(
      a.tenant.id,
      payableA.id,
      [{ costCenterId: idsA.get('cc-1')!, amount: new Prisma.Decimal('11357.52') }],
      syncedAt,
    );
    await costCenters.replaceAllocationsForPayable(
      a.tenant.id,
      matchA.id,
      [{ costCenterId: idsA.get('cc-1')!, amount: new Prisma.Decimal('100') }],
      syncedAt,
    );
    await costCenters.replaceAllocationsForPayable(
      b.tenant.id,
      payableB.id,
      [{ costCenterId: idsB.get('cc-1')!, amount: new Prisma.Decimal('9999') }],
      syncedAt,
    );

    const candidatesA = await listEventScopedSingleCenterOverCandidates(prisma, a.tenant.id);
    expect(candidatesA).toHaveLength(1);
    expect(candidatesA[0]?.afterAmount.equals(new Prisma.Decimal('315.21'))).toBe(true);

    const first = await applyEventScopedSingleCenterBackfill(prisma, candidatesA);
    expect(first).toBe(1);

    const allocA = await prisma.installmentCostCenterAllocation.findFirstOrThrow({
      where: { payableId: payableA.id },
    });
    expect(allocA.amount.equals(new Prisma.Decimal('315.21'))).toBe(true);

    const matchAlloc = await prisma.installmentCostCenterAllocation.findFirstOrThrow({
      where: { payableId: matchA.id },
    });
    expect(matchAlloc.amount.equals(new Prisma.Decimal('100'))).toBe(true);

    const secondCandidates = await listEventScopedSingleCenterOverCandidates(
      prisma,
      a.tenant.id,
    );
    expect(secondCandidates).toHaveLength(0);
    const second = await applyEventScopedSingleCenterBackfill(prisma, secondCandidates);
    expect(second).toBe(0);

    const allocB = await prisma.installmentCostCenterAllocation.findFirstOrThrow({
      where: { payableId: payableB.id },
    });
    expect(allocB.amount.equals(new Prisma.Decimal('9999'))).toBe(true);
  });
});
