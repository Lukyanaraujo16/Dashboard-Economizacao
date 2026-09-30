import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { parseCivilDate } from '../src/modules/integrations/conta-azul/domain/conta-azul-dates.js';
import { createContaAzulCostCenterRepository } from '../src/modules/integrations/conta-azul/repositories/cost-center.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
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

function payable(input: {
  readonly externalId: string;
  readonly total: string;
  readonly dueDate: string;
}) {
  const total = new Prisma.Decimal(input.total);
  return {
    externalId: input.externalId,
    description: null,
    dueDate: parseCivilDate(input.dueDate, 'dueDate'),
    competenceDate: parseCivilDate(input.dueDate, 'competenceDate'),
    upstreamCreatedAt: null,
    upstreamUpdatedAt: new Date('2026-09-01T10:00:00.000Z'),
    status: 'OPEN' as const,
    upstreamStatus: 'EM_ABERTO',
    total,
    paid: new Prisma.Decimal('0'),
    unpaid: total,
    externalPartyId: null,
    categoryExternalIds: [] as string[],
  };
}

describe('detail FETCHED após mudança de total', () => {
  it('não mantém FETCHED quando o total posterior fica abaixo da alocação', async () => {
    const environment = loadEnvironment();
    const tenant = await tenants.create({
      name: 'stale-detail',
      displayName: 'stale-detail',
    });
    const integration = await integrations.persistConnectedTokens({
      tenantId: tenant.id,
      encryptedAccessToken: encryptSecret('access', environment.integrationEncryptionKey!),
      encryptedRefreshToken: encryptSecret('refresh', environment.integrationEncryptionKey!),
      accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      tokenType: 'Bearer',
      at: new Date('2026-09-29T17:23:19.369Z'),
    });
    const scope = {
      tenantId: tenant.id,
      integrationId: integration.id,
      syncedAt: new Date('2026-09-29T17:23:19.369Z'),
    };
    await costCenters.upsertCostCenters(scope, [
      { externalId: 'cc-a', code: null, name: 'Centro A', active: true },
      { externalId: 'cc-b', code: null, name: 'Centro B', active: true },
    ]);
    await financial.upsertPayables(scope, [
      payable({ externalId: 'ap-stale', total: '840', dueDate: '2027-09-30' }),
      payable({ externalId: 'ap-healthy', total: '90', dueDate: '2026-09-22' }),
      payable({ externalId: 'ap-multi', total: '1000', dueDate: '2026-09-12' }),
    ]);
    await financial.upsertReceivables(scope, [
      {
        ...payable({ externalId: 'ar-stale', total: '840', dueDate: '2027-10-30' }),
        externalPartyId: null,
      },
    ]);

    const stale = await prisma.payable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ap-stale' },
    });
    const healthy = await prisma.payable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ap-healthy' },
    });
    const multi = await prisma.payable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ap-multi' },
    });
    const receivable = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: tenant.id, externalId: 'ar-stale' },
    });
    const ids = await costCenters.findCostCenterIdsByExternal(
      { tenantId: tenant.id, integrationId: integration.id },
      ['cc-a', 'cc-b'],
    );
    const centerA = ids.get('cc-a');
    const centerB = ids.get('cc-b');
    if (centerA === undefined || centerB === undefined) {
      throw new Error('centros não persistidos');
    }
    const detailSyncedAt = new Date('2026-09-29T17:23:19.369Z');
    await costCenters.persistInstallmentCostCenterDetail({
      tenantId: tenant.id,
      kind: 'PAYABLE',
      installmentId: stale.id,
      allocations: [{ costCenterId: centerA, amount: new Prisma.Decimal('840') }],
      state: { status: 'FETCHED', syncedAt: detailSyncedAt, ruleVersion: 1 },
    });
    await costCenters.persistInstallmentCostCenterDetail({
      tenantId: tenant.id,
      kind: 'PAYABLE',
      installmentId: healthy.id,
      allocations: [{ costCenterId: centerB, amount: new Prisma.Decimal('90') }],
      state: { status: 'FETCHED', syncedAt: detailSyncedAt, ruleVersion: 1 },
    });
    await costCenters.persistInstallmentCostCenterDetail({
      tenantId: tenant.id,
      kind: 'PAYABLE',
      installmentId: multi.id,
      allocations: [
        { costCenterId: centerA, amount: new Prisma.Decimal('600') },
        { costCenterId: centerB, amount: new Prisma.Decimal('400') },
      ],
      state: { status: 'FETCHED', syncedAt: detailSyncedAt, ruleVersion: 1 },
    });
    await costCenters.persistInstallmentCostCenterDetail({
      tenantId: tenant.id,
      kind: 'RECEIVABLE',
      installmentId: receivable.id,
      allocations: [{ costCenterId: centerA, amount: new Prisma.Decimal('840') }],
      state: { status: 'FETCHED', syncedAt: detailSyncedAt, ruleVersion: 1 },
    });

    await financial.upsertPayables(
      { ...scope, syncedAt: new Date('2026-09-29T19:29:53.566Z') },
      [
        payable({ externalId: 'ap-stale', total: '180', dueDate: '2027-09-30' }),
        payable({ externalId: 'ap-healthy', total: '90', dueDate: '2026-09-22' }),
        payable({ externalId: 'ap-multi', total: '180', dueDate: '2026-09-12' }),
      ],
    );
    await financial.upsertReceivables(
      { ...scope, syncedAt: new Date('2026-09-29T19:29:55.280Z') },
      [
        {
          ...payable({ externalId: 'ar-stale', total: '180', dueDate: '2027-10-30' }),
          externalPartyId: null,
        },
      ],
    );

    const staleAfter = await prisma.payable.findFirstOrThrow({
      where: { id: stale.id },
      include: { costCenterAllocations: true },
    });
    const healthyAfter = await prisma.payable.findFirstOrThrow({
      where: { id: healthy.id },
    });
    const multiAfter = await prisma.payable.findFirstOrThrow({
      where: { id: multi.id },
      include: { costCenterAllocations: { orderBy: { amount: 'asc' } } },
    });
    const receivableAfter = await prisma.receivable.findFirstOrThrow({
      where: { id: receivable.id },
      include: { costCenterAllocations: true },
    });

    expect(staleAfter.costCenterDetailStatus).toBe('ERROR');
    expect(staleAfter.total.toString()).toBe('180');
    expect(staleAfter.costCenterAllocations).toHaveLength(1);
    expect(staleAfter.costCenterAllocations[0]?.amount.toString()).toBe('840');
    expect(healthyAfter.costCenterDetailStatus).toBe('FETCHED');
    expect(multiAfter.costCenterDetailStatus).toBe('ERROR');
    expect(multiAfter.costCenterAllocations.map((row) => row.amount.toString())).toEqual([
      '400',
      '600',
    ]);
    expect(receivableAfter.costCenterDetailStatus).toBe('ERROR');
    expect(receivableAfter.costCenterAllocations[0]?.amount.toString()).toBe('840');
  });
});
