import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const categories = createFinancialCategoryReadRepository(prisma);

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

async function createCategory(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly externalId: string;
  readonly name: string;
  readonly active: boolean;
  readonly type?: 'REVENUE' | 'EXPENSE' | 'UNKNOWN';
}) {
  return prisma.financialCategory.create({
    data: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      externalId: input.externalId,
      name: input.name,
      type: input.type ?? 'REVENUE',
      parentExternalId: null,
      upstreamVersion: 1,
      active: input.active,
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
  readonly categoryExternalIds: readonly string[];
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
        categoryExternalIds: [...input.categoryExternalIds],
      },
    ],
  );
}

async function seedPayable(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly externalId: string;
  readonly competenceDate: Date | null;
  readonly dueDate: Date;
  readonly categoryExternalIds: readonly string[];
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
        categoryExternalIds: [...input.categoryExternalIds],
      },
    ],
  );
}

async function seedSettlement(input: {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly transactionType: 'RECEIPT' | 'DISBURSEMENT';
  readonly occurredOn: Date;
  readonly externalId: string;
  readonly lifecycleStatus?: 'ACTIVE' | 'DELETED';
  readonly financialTransferId?: string | null;
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
      lifecycleStatus: input.lifecycleStatus ?? 'ACTIVE',
      financialTransferId: input.financialTransferId ?? null,
      syncedAt: new Date(),
    },
  });
}

const aug = civilMonthBoundsFromKey('2026-08');
const sep = civilMonthBoundsFromKey('2026-09');

describe('Financial category visibility (11-C)', () => {
  it('A/H) inactive usada em agosto por competence → aparece em historical agosto', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-comp');
    const inactive = await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'cat-aug',
      name: 'Hist Comp',
      active: false,
    });
    await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r1',
      competenceDate: new Date(Date.UTC(2026, 7, 15)),
      dueDate: new Date(Date.UTC(2026, 5, 1)),
      categoryExternalIds: ['cat-aug'],
    });

    const items = await categories.listVisibleForPeriod(tenant.id, aug, {
      visibility: 'historical',
    });
    expect(items.map((i) => i.id)).toEqual([inactive.id]);
  });

  it('B/N) inactive sem uso no período → não aparece', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-none');
    await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'ghost',
      name: 'Ghost',
      active: false,
    });
    await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-out',
      competenceDate: new Date(Date.UTC(2026, 5, 1)),
      dueDate: new Date(Date.UTC(2026, 5, 10)),
      categoryExternalIds: ['ghost'],
    });

    const items = await categories.listVisibleForPeriod(tenant.id, aug, {
      visibility: 'historical',
    });
    expect(items).toEqual([]);
  });

  it('C) active sem uso no período → aparece', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-active');
    const active = await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'live',
      name: 'Live',
      active: true,
    });
    const items = await categories.listVisibleForPeriod(tenant.id, aug, {
      visibility: 'historical',
    });
    expect(items.map((i) => i.id)).toEqual([active.id]);
  });

  it('D) active_only → somente active=true', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-only');
    const active = await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'a',
      name: 'A',
      active: true,
    });
    await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'b',
      name: 'B',
      active: false,
    });
    await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r1',
      competenceDate: new Date(Date.UTC(2026, 8, 5)),
      dueDate: new Date(Date.UTC(2026, 8, 5)),
      categoryExternalIds: ['b'],
    });

    const items = await categories.listVisibleForPeriod(tenant.id, sep, {
      visibility: 'active_only',
    });
    expect(items.map((i) => i.id)).toEqual([active.id]);
  });

  it('I) inactive + payable dueDate no período → aparece', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-due');
    const inactive = await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'ap-cat',
      name: 'AP Due',
      active: false,
      type: 'EXPENSE',
    });
    await seedPayable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'p1',
      competenceDate: new Date(Date.UTC(2026, 5, 1)),
      dueDate: new Date(Date.UTC(2026, 7, 20)),
      categoryExternalIds: ['ap-cat'],
    });

    const items = await categories.listVisibleForPeriod(tenant.id, aug, {
      visibility: 'historical',
    });
    expect(items.map((i) => i.id)).toEqual([inactive.id]);
  });

  it('J) inactive + settlement ACTIVE no período → aparece', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-set');
    const inactive = await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'cash-cat',
      name: 'Cash',
      active: false,
    });
    await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-out',
      competenceDate: new Date(Date.UTC(2026, 5, 1)),
      dueDate: new Date(Date.UTC(2026, 5, 10)),
      categoryExternalIds: ['cash-cat'],
    });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-out',
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
      occurredOn: new Date(Date.UTC(2026, 7, 12)),
      externalId: 'tx1',
    });

    const items = await categories.listVisibleForPeriod(tenant.id, aug, {
      visibility: 'historical',
    });
    expect(items.map((i) => i.id)).toEqual([inactive.id]);
  });

  it('K) settlement DELETED → não torna visível', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-del');
    await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'del-cat',
      name: 'Del',
      active: false,
    });
    await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-del',
      competenceDate: new Date(Date.UTC(2026, 5, 1)),
      dueDate: new Date(Date.UTC(2026, 5, 10)),
      categoryExternalIds: ['del-cat'],
    });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-del',
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
      occurredOn: new Date(Date.UTC(2026, 7, 12)),
      externalId: 'tx-del',
      lifecycleStatus: 'DELETED',
    });

    const items = await categories.listVisibleForPeriod(tenant.id, aug, {
      visibility: 'historical',
    });
    expect(items).toEqual([]);
  });

  it('L) settlement de transferência → não torna visível', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-xfer');
    await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'xfer-cat',
      name: 'Xfer',
      active: false,
    });
    await seedReceivable({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'r-xfer',
      competenceDate: new Date(Date.UTC(2026, 5, 1)),
      dueDate: new Date(Date.UTC(2026, 5, 10)),
      categoryExternalIds: ['xfer-cat'],
    });
    const transfer = await prisma.financialTransfer.create({
      data: {
        tenantId: tenant.id,
        integrationId: integration.id,
        externalId: 'tr-1',
        occurredOn: new Date(Date.UTC(2026, 7, 12)),
        amount: new Prisma.Decimal('100'),
        sourceFinancialAccountExternalId: 'src',
        destinationFinancialAccountExternalId: 'dst',
        matchStatus: 'UNMATCHED',
        syncedAt: new Date(),
      },
    });
    await seedSettlement({
      tenantId: tenant.id,
      integrationId: integration.id,
      installmentExternalId: 'r-xfer',
      installmentKind: 'RECEIVABLE',
      transactionType: 'RECEIPT',
      occurredOn: new Date(Date.UTC(2026, 7, 12)),
      externalId: 'tx-xfer',
      financialTransferId: transfer.id,
    });

    const items = await categories.listVisibleForPeriod(tenant.id, aug, {
      visibility: 'historical',
    });
    expect(items).toEqual([]);
  });

  it('M) mesmo categoryExternalId em integrations distintas → isolamento', async () => {
    const a = await seedConnected('fc-vis-iso-a');
    const b = await seedConnected('fc-vis-iso-b');
    const catA = await createCategory({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      externalId: 'shared',
      name: 'Cat A',
      active: false,
    });
    // Mesmo tenant A, integration de B (arquitetura Conta Azul é 1:1 tenant/provider;
    // o teste valida a chave histórica integrationId+externalId).
    const catB = await prisma.financialCategory.create({
      data: {
        tenantId: a.tenant.id,
        integrationId: b.integration.id,
        externalId: 'shared',
        name: 'Cat B',
        type: 'REVENUE',
        parentExternalId: null,
        upstreamVersion: 1,
        active: false,
        syncedAt: new Date(),
      },
    });

    await seedReceivable({
      tenantId: a.tenant.id,
      integrationId: a.integration.id,
      externalId: 'r-a',
      competenceDate: new Date(Date.UTC(2026, 7, 8)),
      dueDate: new Date(Date.UTC(2026, 7, 8)),
      categoryExternalIds: ['shared'],
    });

    const items = await categories.listVisibleForPeriod(a.tenant.id, aug, {
      visibility: 'historical',
    });
    expect(items.map((i) => i.id)).toEqual([catA.id]);
    expect(items.some((i) => i.id === catB.id)).toBe(false);
  });

  it('O) findByIdForTenant resolve inactive', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-lookup');
    const inactive = await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'old',
      name: 'Old',
      active: false,
    });
    const found = await categories.findByIdForTenant(tenant.id, inactive.id);
    expect(found?.id).toBe(inactive.id);
    expect(found?.active).toBe(false);
  });

  it('P) findByTenantAndExternalIds preserva histórico inactive', async () => {
    const { tenant, integration } = await seedConnected('fc-vis-ext');
    await createCategory({
      tenantId: tenant.id,
      integrationId: integration.id,
      externalId: 'e1',
      name: 'E1',
      active: false,
    });
    const rows = await categories.findByTenantAndExternalIds({
      tenantId: tenant.id,
      externalIds: ['e1'],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.active).toBe(false);
  });
});
