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
import { COST_CENTER_DETAIL_RULE_VERSION } from '../src/modules/integrations/conta-azul/domain/conta-azul-cost-center-detail-fetch.js';
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

describe('CC1.2 cost center detail status persistence', () => {
  it('lista só UNKNOWN/ERROR/stale; NO_ALLOCATION confirmado é skipped; tenant isolation', async () => {
    const a = await seedConnected('cc12-a');
    const b = await seedConnected('cc12-b');
    const syncedAt = new Date('2026-08-21T12:00:00.000Z');
    const scopeA = {
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      syncedAt,
    };

    await financial.upsertPayables(scopeA, [
      {
        externalId: 'ap-unknown',
        description: 'unknown',
        dueDate: parseCivilDate('2026-08-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-08-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-08-01T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('10'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('10'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
      {
        externalId: 'ap-no-alloc',
        description: 'no alloc',
        dueDate: parseCivilDate('2026-08-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-08-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-08-01T10:00:00.000Z'),
        status: 'PAID',
        upstreamStatus: 'RECEBIDO',
        total: new Prisma.Decimal('20'),
        paid: new Prisma.Decimal('20'),
        unpaid: new Prisma.Decimal('0'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
      {
        externalId: 'ap-fetched',
        description: 'fetched',
        dueDate: parseCivilDate('2026-08-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-08-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-08-01T10:00:00.000Z'),
        status: 'OPEN',
        upstreamStatus: 'EM_ABERTO',
        total: new Prisma.Decimal('30'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('30'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ]);

    const unknown = await prisma.payable.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'ap-unknown' },
    });
    const noAlloc = await prisma.payable.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'ap-no-alloc' },
    });
    const fetched = await prisma.payable.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'ap-fetched' },
    });

    await costCenters.markPayableCostCenterDetailState(a.tenant.id, noAlloc.id, {
      status: 'NO_ALLOCATION',
      syncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });
    await costCenters.markPayableCostCenterDetailState(a.tenant.id, fetched.id, {
      status: 'FETCHED',
      syncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const listed = await costCenters.listInstallmentsNeedingAllocationSync({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
    });
    expect(listed.totalInstallments).toBe(3);
    expect(listed.skippedFresh).toBe(2);
    expect(listed.candidates).toHaveLength(1);
    expect(listed.candidates[0]?.localId).toBe(unknown.id);

    const listedB = await costCenters.listInstallmentsNeedingAllocationSync({
      tenantId: b.tenant.id,
      integrationId: b.integration.id,
    });
    expect(listedB.totalInstallments).toBe(0);
    expect(listedB.candidates).toHaveLength(0);
  });

  it('marca NO_ALLOCATION após replace vazio e deixa de ser candidato', async () => {
    const { tenant, integration } = await seedConnected('cc12-noalloc');
    const syncedAt = new Date('2026-08-21T15:00:00.000Z');
    const scope = { tenantId: tenant.id, integrationId: integration.id, syncedAt };

    await financial.upsertReceivables(scope, [
      {
        externalId: 'ar-1',
        description: 'sem rateio',
        dueDate: parseCivilDate('2026-08-10', 'dueDate'),
        competenceDate: parseCivilDate('2026-08-01', 'competenceDate'),
        upstreamCreatedAt: null,
        upstreamUpdatedAt: new Date('2026-08-01T10:00:00.000Z'),
        status: 'PAID',
        upstreamStatus: 'RECEBIDO',
        total: new Prisma.Decimal('50'),
        paid: new Prisma.Decimal('50'),
        unpaid: new Prisma.Decimal('0'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ]);
    const receivable = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ar-1' },
    });

    await costCenters.replaceAllocationsForReceivable(tenant.id, receivable.id, [], syncedAt);
    await costCenters.markReceivableCostCenterDetailState(tenant.id, receivable.id, {
      status: 'NO_ALLOCATION',
      syncedAt,
      ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
    });

    const first = await costCenters.listInstallmentsNeedingAllocationSync({
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(first.candidates).toHaveLength(0);
    expect(first.skippedFresh).toBe(1);

    const second = await costCenters.listInstallmentsNeedingAllocationSync({
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(second.candidates).toHaveLength(0);
  });
});
