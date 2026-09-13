import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createCostCenterReadRepository } from '../src/modules/finance/repositories/cost-center-read.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const costCenters = createCostCenterReadRepository(prisma);

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

async function createInactiveCenter(
  tenantId: string,
  integrationId: string,
  externalId: string,
  name: string,
) {
  return prisma.costCenter.create({
    data: {
      tenantId,
      integrationId,
      externalId,
      code: null,
      name,
      active: false,
      syncedAt: new Date(),
    },
  });
}

async function createActiveCenter(
  tenantId: string,
  integrationId: string,
  externalId: string,
  name: string,
) {
  return prisma.costCenter.create({
    data: {
      tenantId,
      integrationId,
      externalId,
      code: null,
      name,
      active: true,
      syncedAt: new Date(),
    },
  });
}

async function seedReceivable(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly externalId: string;
  readonly competenceDate: Date | null;
  readonly dueDate: Date;
}) {
  const syncedAt = new Date();
  await financial.upsertReceivables(
    { tenantId: input.tenantId, integrationId: input.integrationId, syncedAt },
    [
      {
        externalId: input.externalId,
        description: 'r',
        dueDate: input.dueDate,
        competenceDate: input.competenceDate,
        upstreamCreatedAt: null,
        upstreamUpdatedAt: null,
        status: 'OPEN',
        upstreamStatus: 'OPEN',
        total: new Prisma.Decimal('100'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('100'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ],
  );
  return prisma.receivable.findFirstOrThrow({
    where: { integrationId: input.integrationId, externalId: input.externalId },
  });
}

async function seedPayable(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly externalId: string;
  readonly competenceDate: Date | null;
  readonly dueDate: Date;
}) {
  const syncedAt = new Date();
  await financial.upsertPayables(
    { tenantId: input.tenantId, integrationId: input.integrationId, syncedAt },
    [
      {
        externalId: input.externalId,
        description: 'p',
        dueDate: input.dueDate,
        competenceDate: input.competenceDate,
        upstreamCreatedAt: null,
        upstreamUpdatedAt: null,
        status: 'OPEN',
        upstreamStatus: 'OPEN',
        total: new Prisma.Decimal('100'),
        paid: new Prisma.Decimal('0'),
        unpaid: new Prisma.Decimal('100'),
        externalPartyId: null,
        categoryExternalIds: [],
      },
    ],
  );
  return prisma.payable.findFirstOrThrow({
    where: { integrationId: input.integrationId, externalId: input.externalId },
  });
}

async function linkAllocation(input: {
  readonly tenantId: string;
  readonly costCenterId: string;
  readonly receivableId?: string;
  readonly payableId?: string;
}) {
  await prisma.installmentCostCenterAllocation.create({
    data: {
      tenantId: input.tenantId,
      costCenterId: input.costCenterId,
      receivableId: input.receivableId ?? null,
      payableId: input.payableId ?? null,
      amount: new Prisma.Decimal('100'),
      syncedAt: new Date(),
    },
  });
}

async function seedSettlement(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly transactionType: 'RECEIPT' | 'DISBURSEMENT';
  readonly occurredOn: Date;
  readonly externalId: string;
}) {
  await prisma.financialTransaction.create({
    data: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      externalId: input.externalId,
      installmentExternalId: input.installmentExternalId,
      installmentKind: input.installmentKind,
      transactionType: input.transactionType,
      occurredOn: input.occurredOn,
      grossAmount: new Prisma.Decimal('100'),
      netAmount: new Prisma.Decimal('100'),
      interestAmount: new Prisma.Decimal('0'),
      fineAmount: new Prisma.Decimal('0'),
      discountAmount: new Prisma.Decimal('0'),
      feeAmount: new Prisma.Decimal('0'),
      lifecycleStatus: 'ACTIVE',
      financialTransferId: null,
      syncedAt: new Date(),
    },
  });
}

describe('listVisibleForPeriod — semântica 11-A (competence/due/occurredOn)', () => {
  const aug = civilMonthBoundsFromKey('2026-08');
  const sep = civilMonthBoundsFromKey('2026-09');

  it('1) inactive + competenceDate no mês → aparece', async () => {
    const { tenant, integration } = await seedConnected('vis-comp');
    const center = await createInactiveCenter(tenant.id, integration.id, 'cc', 'Comp');
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r1',
      competenceDate: new Date(Date.UTC(2026, 7, 15)),
      dueDate: new Date(Date.UTC(2026, 5, 1)),
    });
    await linkAllocation({ tenantId: tenant.id, costCenterId: center.id, receivableId: r.id });

    const items = await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' });
    expect(items.map((i) => i.id)).toEqual([center.id]);
  });

  it('2) inactive + dueDate no mês → aparece', async () => {
    const { tenant, integration } = await seedConnected('vis-due');
    const center = await createInactiveCenter(tenant.id, integration.id, 'cc', 'Due');
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r1',
      competenceDate: new Date(Date.UTC(2026, 5, 1)),
      dueDate: new Date(Date.UTC(2026, 7, 20)),
    });
    await linkAllocation({ tenantId: tenant.id, costCenterId: center.id, receivableId: r.id });

    const items = await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' });
    expect(items.map((i) => i.id)).toEqual([center.id]);
  });

  it('3) inactive + competence/due fora + settlement occurredOn no mês → aparece', async () => {
    const { tenant, integration } = await seedConnected('vis-occ');
    const center = await createInactiveCenter(tenant.id, integration.id, 'cc', 'Occ');
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-out',
      competenceDate: new Date(Date.UTC(2026, 5, 1)),
      dueDate: new Date(Date.UTC(2026, 5, 10)),
    });
    await linkAllocation({ tenantId: tenant.id, costCenterId: center.id, receivableId: r.id });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-out',
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
      occurredOn: new Date(Date.UTC(2026, 7, 12)),
      externalId: 'ft-1',
    });

    const items = await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' });
    expect(items.map((i) => i.id)).toEqual([center.id]);
  });

  it('4) inactive + settlement occurredOn fora → não aparece', async () => {
    const { tenant, integration } = await seedConnected('vis-occ-out');
    const center = await createInactiveCenter(tenant.id, integration.id, 'cc', 'Out');
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-out',
      competenceDate: new Date(Date.UTC(2026, 5, 1)),
      dueDate: new Date(Date.UTC(2026, 5, 10)),
    });
    await linkAllocation({ tenantId: tenant.id, costCenterId: center.id, receivableId: r.id });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-out',
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
      occurredOn: new Date(Date.UTC(2026, 8, 12)),
      externalId: 'ft-1',
    });

    const items = await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' });
    expect(items).toEqual([]);
  });

  it('5) RECEIPT occurredOn no período → aparece', async () => {
    const { tenant, integration } = await seedConnected('vis-receipt');
    const center = await createInactiveCenter(tenant.id, integration.id, 'cc', 'Receipt');
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'ar-1',
      competenceDate: new Date(Date.UTC(2026, 0, 1)),
      dueDate: new Date(Date.UTC(2026, 0, 1)),
    });
    await linkAllocation({ tenantId: tenant.id, costCenterId: center.id, receivableId: r.id });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'ar-1',
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
      occurredOn: new Date(Date.UTC(2026, 7, 5)),
      externalId: 'ft-r',
    });
    expect((await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' })).map((i) => i.id)).toEqual([
      center.id,
    ]);
  });

  it('6) DISBURSEMENT occurredOn no período → aparece', async () => {
    const { tenant, integration } = await seedConnected('vis-disb');
    const center = await createInactiveCenter(tenant.id, integration.id, 'cc', 'Disb');
    const p = await seedPayable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'ap-1',
      competenceDate: new Date(Date.UTC(2026, 0, 1)),
      dueDate: new Date(Date.UTC(2026, 0, 1)),
    });
    await linkAllocation({ tenantId: tenant.id, costCenterId: center.id, payableId: p.id });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'ap-1',
      installmentKind: 'PAYABLE',
      transactionType: 'DISBURSEMENT',
      occurredOn: new Date(Date.UTC(2026, 7, 5)),
      externalId: 'ft-p',
    });
    expect((await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' })).map((i) => i.id)).toEqual([
      center.id,
    ]);
  });

  it('7) ativo sem movimento → aparece', async () => {
    const { tenant, integration } = await seedConnected('vis-active');
    const center = await createActiveCenter(tenant.id, integration.id, 'cc', 'Ativo');
    expect((await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' })).map((i) => i.id)).toEqual([
      center.id,
    ]);
  });

  it('8) inactive sem competência/due/occurredOn no período → não aparece', async () => {
    const { tenant, integration } = await seedConnected('vis-ghost');
    await createInactiveCenter(tenant.id, integration.id, 'cc', 'Ghost');
    expect(await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' })).toEqual([]);
  });

  it('9) múltiplas condições → uma ocorrência', async () => {
    const { tenant, integration } = await seedConnected('vis-dup');
    const center = await createInactiveCenter(tenant.id, integration.id, 'cc', 'Multi');
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-multi',
      competenceDate: new Date(Date.UTC(2026, 7, 2)),
      dueDate: new Date(Date.UTC(2026, 7, 3)),
    });
    await linkAllocation({ tenantId: tenant.id, costCenterId: center.id, receivableId: r.id });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-multi',
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
      occurredOn: new Date(Date.UTC(2026, 7, 4)),
      externalId: 'ft-m',
    });

    const items = await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' });
    expect(items).toHaveLength(1);
    expect(items[0]?.id).toBe(center.id);
  });

  it('10) occurredOn em agosto, não em setembro', async () => {
    const { tenant, integration } = await seedConnected('vis-months');
    const center = await createInactiveCenter(tenant.id, integration.id, 'cc', 'Meses');
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-m',
      competenceDate: new Date(Date.UTC(2026, 0, 1)),
      dueDate: new Date(Date.UTC(2026, 0, 1)),
    });
    await linkAllocation({ tenantId: tenant.id, costCenterId: center.id, receivableId: r.id });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-m',
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
      occurredOn: new Date(Date.UTC(2026, 7, 18)),
      externalId: 'ft-m',
    });

    expect((await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' })).map((i) => i.id)).toEqual([
      center.id,
    ]);
    expect(await costCenters.listVisibleForPeriod(tenant.id, sep, { visibility: 'historical' })).toEqual([]);
  });

  it('11) range multi-mês inclui settlement em um dos meses', async () => {
    const { tenant, integration } = await seedConnected('vis-range');
    const center = await createInactiveCenter(tenant.id, integration.id, 'cc', 'Range');
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-r',
      competenceDate: new Date(Date.UTC(2026, 0, 1)),
      dueDate: new Date(Date.UTC(2026, 0, 1)),
    });
    await linkAllocation({ tenantId: tenant.id, costCenterId: center.id, receivableId: r.id });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-r',
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
      occurredOn: new Date(Date.UTC(2026, 8, 2)),
      externalId: 'ft-r',
    });

    const range = {
      from: civilMonthBoundsFromKey('2026-08').from,
      to: civilMonthBoundsFromKey('2026-09').to,
    };
    expect((await costCenters.listVisibleForPeriod(tenant.id, range, { visibility: 'historical' })).map((i) => i.id)).toEqual([
      center.id,
    ]);
  });
});
