import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { createAnalyticsService } from '../src/modules/analytics/services/analytics.service.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const analytics = createAnalyticsService({
  receivables: createReceivableReadRepository(prisma),
  payables: createPayableReadRepository(prisma),
  categories: createFinancialCategoryReadRepository(prisma),
});

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

function installment(input: {
  readonly externalId: string;
  readonly status: FinancialInstallmentStatus;
  readonly dueDate: string;
  readonly unpaid?: string;
  readonly paid?: string;
  readonly total?: string;
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '10');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: input.externalId,
    dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status,
    upstreamStatus: input.status,
    total,
    paid,
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [],
  };
}

describe('AnalyticsService — snapshot AR/AP tenant-scoped', () => {
  const now = new Date('2026-08-19T15:00:00.000Z');

  it('rejeita tenantId vazio', async () => {
    await expect(analytics.getFinancialStockSnapshot({ tenantId: '  ', now })).rejects.toThrow(
      /tenantId/,
    );
  });

  it('isola tenants com o mesmo externalId', async () => {
    const a = await seedConnected('an-9a-a');
    const b = await seedConnected('an-9a-b');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [installment({ externalId: 'same', status: 'OPEN', dueDate: '2026-08-10', unpaid: '8' })],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [installment({ externalId: 'same', status: 'OPEN', dueDate: '2026-08-25', unpaid: '3' })],
    );

    const snapA = await analytics.getFinancialStockSnapshot({ tenantId: a.tenant.id, now });
    const snapB = await analytics.getFinancialStockSnapshot({ tenantId: b.tenant.id, now });
    expect(snapA.receivables.overdue.equals(new Prisma.Decimal('8'))).toBe(true);
    expect(snapA.receivables.upcoming.equals(new Prisma.Decimal(0))).toBe(true);
    expect(snapB.receivables.upcoming.equals(new Prisma.Decimal('3'))).toBe(true);
    expect(snapB.receivables.overdue.equals(new Prisma.Decimal(0))).toBe(true);
    expect(snapA.today.toISOString()).toBe('2026-08-19T00:00:00.000Z');
  });

  it('exclui PAID, LOST, RENEGOTIATED e UNKNOWN via read model', async () => {
    const seeded = await seedConnected('an-9a-status');
    const syncedAt = new Date();
    const excluded: FinancialInstallmentStatus[] = ['PAID', 'LOST', 'RENEGOTIATED', 'UNKNOWN'];
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({
          externalId: 'keep',
          status: 'OPEN',
          dueDate: '2026-08-18',
          unpaid: '5.5',
        }),
        ...excluded.map((status) =>
          installment({
            externalId: status,
            status,
            dueDate: '2026-08-18',
            unpaid: '99',
            paid: status === 'PAID' ? '99' : '0',
            total: '99',
          }),
        ),
      ],
    );
    await financial.upsertPayables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({
          externalId: 'ap-keep',
          status: 'PARTIALLY_PAID',
          dueDate: '2026-08-19',
          unpaid: '2.25',
          paid: '1',
          total: '3.25',
        }),
        installment({
          externalId: 'ap-paid',
          status: 'PAID',
          dueDate: '2026-08-01',
          unpaid: '0',
          paid: '50',
          total: '50',
        }),
      ],
    );

    const snap = await analytics.getFinancialStockSnapshot({ tenantId: seeded.tenant.id, now });
    expect(snap.receivables.open.equals(new Prisma.Decimal('5.5'))).toBe(true);
    expect(snap.receivables.overdue.equals(new Prisma.Decimal('5.5'))).toBe(true);
    expect(snap.payables.open.equals(new Prisma.Decimal('2.25'))).toBe(true);
    expect(snap.payables.upcoming.equals(new Prisma.Decimal('2.25'))).toBe(true);
    expect(snap.payables.overdue.equals(new Prisma.Decimal(0))).toBe(true);
    expect(
      snap.receivables.open.equals(snap.receivables.overdue.plus(snap.receivables.upcoming)),
    ).toBe(true);
    expect(snap.payables.open.equals(snap.payables.overdue.plus(snap.payables.upcoming))).toBe(
      true,
    );
  });

  it('OPEN ontem é overdue e OVERDUE persistido amanhã é upcoming', async () => {
    const seeded = await seedConnected('an-9a-authority');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({
          externalId: 'open-past',
          status: 'OPEN',
          dueDate: '2026-08-18',
          unpaid: '1',
        }),
        installment({
          externalId: 'overdue-future',
          status: 'OVERDUE',
          dueDate: '2026-08-20',
          unpaid: '4',
        }),
      ],
    );
    const snap = await analytics.getFinancialStockSnapshot({ tenantId: seeded.tenant.id, now });
    expect(snap.receivables.overdue.equals(new Prisma.Decimal('1'))).toBe(true);
    expect(snap.receivables.upcoming.equals(new Prisma.Decimal('4'))).toBe(true);
  });

  it('sem títulos ativos retorna zeros', async () => {
    const seeded = await seedConnected('an-9a-empty');
    const snap = await analytics.getFinancialStockSnapshot({ tenantId: seeded.tenant.id, now });
    expect(snap.receivables.open.equals(0)).toBe(true);
    expect(snap.payables.open.equals(0)).toBe(true);
    expect(snap.receivableDelinquency.rate).toBeNull();
  });

  it('taxa de inadimplência é isolada por tenant e ignora AP', async () => {
    const a = await seedConnected('an-9b-a');
    const b = await seedConnected('an-9b-b');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'ar-overdue',
          status: 'OPEN',
          dueDate: '2026-08-10',
          unpaid: '50',
        }),
        installment({
          externalId: 'ar-upcoming',
          status: 'OPEN',
          dueDate: '2026-08-25',
          unpaid: '50',
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'ap-overdue',
          status: 'OPEN',
          dueDate: '2026-08-01',
          unpaid: '999',
        }),
      ],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        installment({
          externalId: 'ar-overdue',
          status: 'OPEN',
          dueDate: '2026-08-01',
          unpaid: '20',
        }),
        installment({
          externalId: 'ar-upcoming',
          status: 'OPEN',
          dueDate: '2026-08-30',
          unpaid: '80',
        }),
      ],
    );

    const snapA = await analytics.getFinancialStockSnapshot({ tenantId: a.tenant.id, now });
    const snapB = await analytics.getFinancialStockSnapshot({ tenantId: b.tenant.id, now });
    expect(snapA.receivableDelinquency.rate!.equals(50)).toBe(true);
    expect(snapA.payables.overdue.equals(new Prisma.Decimal('999'))).toBe(true);
    expect(snapB.receivableDelinquency.rate!.equals(20)).toBe(true);
    expect(snapB.receivableDelinquency.openUnpaid.equals(100)).toBe(true);
  });
});
