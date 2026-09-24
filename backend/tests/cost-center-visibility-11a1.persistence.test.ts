import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { resolveCostCenterListVisibility } from '../src/modules/dashboard/domain/resolve-cost-center-list-visibility.js';
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

async function createCenter(
  tenantId: string,
  integrationId: string,
  externalId: string,
  name: string,
  active: boolean,
) {
  return prisma.costCenter.create({
    data: {
      tenantId,
      integrationId,
      externalId,
      code: null,
      name,
      active,
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

async function linkAllocation(input: {
  readonly tenantId: string;
  readonly costCenterId: string;
  readonly receivableId: string;
}) {
  await prisma.installmentCostCenterAllocation.create({
    data: {
      tenantId: input.tenantId,
      costCenterId: input.costCenterId,
      receivableId: input.receivableId,
      payableId: null,
      amount: new Prisma.Decimal('100'),
      syncedAt: new Date(),
    },
  });
}

async function seedSettlement(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly installmentExternalId: string;
  readonly occurredOn: Date;
  readonly externalId: string;
}) {
  await prisma.financialTransaction.create({
    data: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      externalId: input.externalId,
      installmentExternalId: input.installmentExternalId,
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
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

const sep = civilMonthBoundsFromKey('2026-09');
const aug = civilMonthBoundsFromKey('2026-08');
const oct = civilMonthBoundsFromKey('2026-10');

describe('11-A.1 — visibilidade temporal Dashboard vs Reports', () => {
  it('A) active_only: active sem movimento → aparece', async () => {
    const { tenant, integration } = await seedConnected('a11a1-a');
    const active = await createCenter(tenant.id, integration.id, 'tik', 'TIKTOK SHOP', true);
    const items = await costCenters.listVisibleForPeriod(tenant.id, sep, {
      visibility: 'active_only',
    });
    expect(items.map((i) => i.id)).toEqual([active.id]);
  });

  it('B/C/D) active_only: inactive com competence/due/occurredOn no mês → NÃO aparece', async () => {
    const { tenant, integration } = await seedConnected('a11a1-bcd');
    await createCenter(tenant.id, integration.id, 'tik', 'TIKTOK SHOP', true);
    const inactive = await createCenter(tenant.id, integration.id, 'dev', 'Desenvolvedor', false);
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-sep',
      competenceDate: new Date(Date.UTC(2026, 8, 10)),
      dueDate: new Date(Date.UTC(2026, 8, 15)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: inactive.id,
      receivableId: r.id,
    });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-sep',
      occurredOn: new Date(Date.UTC(2026, 8, 12)),
      externalId: 'ft-sep',
    });

    const items = await costCenters.listVisibleForPeriod(tenant.id, sep, {
      visibility: 'active_only',
    });
    expect(items.map((i) => i.name)).toEqual(['TIKTOK SHOP']);
    expect(items.some((i) => i.id === inactive.id)).toBe(false);
  });

  it('E/F/G) historical mês passado: inactive com competence/due/occurredOn → aparece', async () => {
    const { tenant, integration } = await seedConnected('a11a1-efg');
    const inactive = await createCenter(tenant.id, integration.id, 'mkt', 'Marketing', false);
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-aug',
      competenceDate: new Date(Date.UTC(2026, 7, 5)),
      dueDate: new Date(Date.UTC(2026, 7, 8)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: inactive.id,
      receivableId: r.id,
    });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-aug',
      occurredOn: new Date(Date.UTC(2026, 7, 9)),
      externalId: 'ft-aug',
    });

    const items = await costCenters.listVisibleForPeriod(tenant.id, aug, {
      visibility: 'historical',
    });
    expect(items.map((i) => i.id)).toEqual([inactive.id]);
  });

  it('H) historical mês passado: inactive sem movimento → não aparece', async () => {
    const { tenant, integration } = await seedConnected('a11a1-h');
    await createCenter(tenant.id, integration.id, 'ges', 'Gestor', false);
    expect(
      await costCenters.listVisibleForPeriod(tenant.id, aug, { visibility: 'historical' }),
    ).toEqual([]);
  });

  it('I/J/K) active_only mês futuro: inactive com due/competence/allocation futura → NÃO aparece', async () => {
    const { tenant, integration } = await seedConnected('a11a1-ijk');
    const active = await createCenter(tenant.id, integration.id, 'tik', 'TIKTOK SHOP', true);
    const inactive = await createCenter(tenant.id, integration.id, 'rec', 'Recrutador', false);
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-fut',
      competenceDate: new Date(Date.UTC(2026, 9, 10)),
      dueDate: new Date(Date.UTC(2026, 9, 20)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: inactive.id,
      receivableId: r.id,
    });

    const items = await costCenters.listVisibleForPeriod(tenant.id, oct, {
      visibility: 'active_only',
    });
    expect(items.map((i) => i.id)).toEqual([active.id]);
  });

  it('L/M) Relatórios reports_range: range passado e range incluindo mês atual → somente ativos', async () => {
    const { tenant, integration } = await seedConnected('a11a1-lm');
    const active = await createCenter(tenant.id, integration.id, 'tik', 'TIKTOK SHOP', true);
    const inactive = await createCenter(tenant.id, integration.id, 'dev', 'Desenvolvedor', false);
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-range',
      competenceDate: new Date(Date.UTC(2026, 7, 12)),
      dueDate: new Date(Date.UTC(2026, 7, 12)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: inactive.id,
      receivableId: r.id,
    });

    const visibility = resolveCostCenterListVisibility({
      context: 'reports_range',
      monthKey: null,
    });
    expect(visibility).toBe('active_only');

    const pastRange = {
      from: civilMonthBoundsFromKey('2026-07').from,
      to: civilMonthBoundsFromKey('2026-08').to,
    };
    const withCurrent = {
      from: civilMonthBoundsFromKey('2026-08').from,
      to: civilMonthBoundsFromKey('2026-09').to,
    };

    expect(
      (await costCenters.listVisibleForPeriod(tenant.id, pastRange, { visibility })).map(
        (i) => i.id,
      ),
    ).toEqual([active.id]);
    expect(
      (await costCenters.listVisibleForPeriod(tenant.id, withCurrent, { visibility })).map(
        (i) => i.id,
      ),
    ).toEqual([active.id]);
    expect(await prisma.installmentCostCenterAllocation.count({ where: { costCenterId: inactive.id } })).toBe(
      1,
    );
    expect(await costCenters.findByIdForTenant(tenant.id, inactive.id)).toEqual(
      expect.objectContaining({ id: inactive.id, active: false }),
    );
  });

  it('N) Relatórios reports_range futuro: somente ativos; inactive com due futura NÃO aparece', async () => {
    const { tenant, integration } = await seedConnected('a11a1-n');
    const active = await createCenter(tenant.id, integration.id, 'tik', 'TIKTOK SHOP', true);
    const inactive = await createCenter(tenant.id, integration.id, 'ges', 'Gestor', false);
    const r = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-fut-r',
      competenceDate: new Date(Date.UTC(2026, 9, 1)),
      dueDate: new Date(Date.UTC(2026, 9, 15)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: inactive.id,
      receivableId: r.id,
    });

    const visibility = resolveCostCenterListVisibility({
      context: 'reports_range',
      monthKey: null,
    });
    expect(visibility).toBe('active_only');

    const futureRange = {
      from: civilMonthBoundsFromKey('2026-10').from,
      to: civilMonthBoundsFromKey('2026-11').to,
    };
    expect(
      (await costCenters.listVisibleForPeriod(tenant.id, futureRange, { visibility })).map(
        (i) => i.id,
      ),
    ).toEqual([active.id]);
    expect(await prisma.installmentCostCenterAllocation.count({ where: { costCenterId: inactive.id } })).toBe(
      1,
    );
  });

  it('L2) Relatórios mês atual: inactive com allocation ou baixa NÃO aparece; ativo aparece', async () => {
    const { tenant, integration } = await seedConnected('a11a1-l2');
    const active = await createCenter(tenant.id, integration.id, 'tik', 'TIKTOK SHOP', true);
    const inactiveAlloc = await createCenter(tenant.id, integration.id, 'dev', 'Desenvolvedor', false);
    const inactiveCash = await createCenter(tenant.id, integration.id, 'rec', 'Recrutador', false);

    const rAlloc = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-sep-alloc',
      competenceDate: new Date(Date.UTC(2026, 8, 10)),
      dueDate: new Date(Date.UTC(2026, 8, 15)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: inactiveAlloc.id,
      receivableId: rAlloc.id,
    });

    const rCash = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-sep-cash',
      competenceDate: new Date(Date.UTC(2026, 8, 8)),
      dueDate: new Date(Date.UTC(2026, 8, 8)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: inactiveCash.id,
      receivableId: rCash.id,
    });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-sep-cash',
      occurredOn: new Date(Date.UTC(2026, 8, 12)),
      externalId: 'ft-sep-cash',
    });

    const visibility = resolveCostCenterListVisibility({
      context: 'reports_range',
      monthKey: null,
    });
    expect(visibility).toBe('active_only');
    const items = await costCenters.listVisibleForPeriod(tenant.id, sep, { visibility });
    expect(items.map((i) => i.id)).toEqual([active.id]);
    expect(items.some((i) => i.id === inactiveAlloc.id)).toBe(false);
    expect(items.some((i) => i.id === inactiveCash.id)).toBe(false);
    expect(await prisma.installmentCostCenterAllocation.count({ where: { tenantId: tenant.id } })).toBe(
      2,
    );
  });

  it('isola tenant no catálogo reports_range', async () => {
    const a = await seedConnected('a11a1-iso-a');
    const b = await seedConnected('a11a1-iso-b');
    const activeA = await createCenter(a.tenant.id, a.integration.id, 'a-live', 'Ativo A', true);
    await createCenter(b.tenant.id, b.integration.id, 'b-live', 'Ativo B', true);

    const visibility = resolveCostCenterListVisibility({
      context: 'reports_range',
      monthKey: null,
    });
    expect(
      (await costCenters.listVisibleForPeriod(a.tenant.id, sep, { visibility })).map((i) => i.id),
    ).toEqual([activeA.id]);
  });

  it('Blooty SET/2026: somente TIKTOK SHOP; AGO/2026: inativos relevantes', async () => {
    const { tenant, integration } = await seedConnected('a11a1-blooty');
    const tiktok = await createCenter(tenant.id, integration.id, 'tik', 'TIKTOK SHOP', true);
    const dev = await createCenter(tenant.id, integration.id, 'dev', 'Desenvolvedor', false);
    const rec = await createCenter(tenant.id, integration.id, 'rec', 'Recrutador', false);
    await createCenter(tenant.id, integration.id, 'ges', 'Gestor', false);
    await createCenter(tenant.id, integration.id, 'mkt', 'Marketing', false);

    const rSepDev = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-sep-dev',
      competenceDate: new Date(Date.UTC(2026, 8, 5)),
      dueDate: new Date(Date.UTC(2026, 8, 5)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: dev.id,
      receivableId: rSepDev.id,
    });

    const rSepRec = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-sep-rec',
      competenceDate: new Date(Date.UTC(2026, 8, 6)),
      dueDate: new Date(Date.UTC(2026, 8, 6)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: rec.id,
      receivableId: rSepRec.id,
    });

    const rAugDev = await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-aug-dev',
      competenceDate: new Date(Date.UTC(2026, 7, 10)),
      dueDate: new Date(Date.UTC(2026, 7, 10)),
    });
    await linkAllocation({
      tenantId: tenant.id,
      costCenterId: dev.id,
      receivableId: rAugDev.id,
    });

    const setItems = await costCenters.listVisibleForPeriod(tenant.id, sep, {
      visibility: 'active_only',
    });
    expect(setItems.map((i) => i.name)).toEqual(['TIKTOK SHOP']);
    expect(setItems.map((i) => i.id)).toEqual([tiktok.id]);

    const agoItems = await costCenters.listVisibleForPeriod(tenant.id, aug, {
      visibility: 'historical',
    });
    expect(agoItems.map((i) => i.name).sort()).toEqual(['Desenvolvedor', 'TIKTOK SHOP']);
  });
});
