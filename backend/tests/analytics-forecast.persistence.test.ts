import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
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

const now = new Date('2026-08-19T15:00:00.000Z');

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

describe('AnalyticsService — próximos vencimentos', () => {
  it('rejeita nDays inválido sem default silencioso', async () => {
    await expect(
      analytics.getUpcomingReceivables({ tenantId: 'tenant', nDays: -1, now }),
    ).rejects.toThrow(/nDays/);
    await expect(
      analytics.getUpcomingReceivables({ tenantId: 'tenant', nDays: 1.5, now }),
    ).rejects.toThrow(/nDays/);
  });

  it('sem títulos retorna lista vazia', async () => {
    const seeded = await seedConnected('an-9c-up-empty');
    const result = await analytics.getUpcomingReceivables({
      tenantId: seeded.tenant.id,
      nDays: 7,
      now,
    });
    expect(result.items).toEqual([]);
    expect(result.from.toISOString()).toBe('2026-08-19T00:00:00.000Z');
  });

  it('nDays=0 inclui somente hoje e ordena dueDate/id', async () => {
    const seeded = await seedConnected('an-9c-up-today');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({ externalId: 'yesterday', status: 'OPEN', dueDate: '2026-08-18' }),
        installment({ externalId: 'today-b', status: 'OPEN', dueDate: '2026-08-19', unpaid: '2' }),
        installment({
          externalId: 'today-a',
          status: 'PARTIALLY_PAID',
          dueDate: '2026-08-19',
          unpaid: '1.5',
          paid: '1',
          total: '2.5',
        }),
        installment({ externalId: 'tomorrow', status: 'OPEN', dueDate: '2026-08-20' }),
      ],
    );
    const todayOnly = await analytics.getUpcomingReceivables({
      tenantId: seeded.tenant.id,
      nDays: 0,
      now,
    });
    expect(todayOnly.items).toHaveLength(2);
    expect(
      todayOnly.items.every((item) => item.dueDate.toISOString() === '2026-08-19T00:00:00.000Z'),
    ).toBe(true);
    const week = await analytics.getUpcomingReceivables({
      tenantId: seeded.tenant.id,
      nDays: 1,
      now,
    });
    expect(week.items).toHaveLength(3);
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({ externalId: 'day7', status: 'OPEN', dueDate: '2026-08-26', unpaid: '7' }),
        installment({ externalId: 'day8', status: 'OPEN', dueDate: '2026-08-27', unpaid: '8' }),
      ],
    );
    const n7 = await analytics.getUpcomingReceivables({
      tenantId: seeded.tenant.id,
      nDays: 7,
      now,
    });
    expect(n7.items.some((item) => item.unpaid.equals(7))).toBe(true);
    expect(n7.items.some((item) => item.unpaid.equals(8))).toBe(false);
  });

  it('isola tenants e ignora PAID no read model', async () => {
    const a = await seedConnected('an-9c-up-a');
    const b = await seedConnected('an-9c-up-b');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({ externalId: 'same', status: 'OPEN', dueDate: '2026-08-20', unpaid: '4' }),
        installment({
          externalId: 'paid',
          status: 'PAID',
          dueDate: '2026-08-20',
          unpaid: '0',
          paid: '9',
          total: '9',
        }),
      ],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [installment({ externalId: 'same', status: 'OPEN', dueDate: '2026-08-20', unpaid: '11' })],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [installment({ externalId: 'ap', status: 'OPEN', dueDate: '2026-08-21', unpaid: '15' })],
    );
    const snapA = await analytics.getUpcomingReceivables({
      tenantId: a.tenant.id,
      nDays: 5,
      now,
    });
    const snapB = await analytics.getUpcomingReceivables({
      tenantId: b.tenant.id,
      nDays: 5,
      now,
    });
    const payA = await analytics.getUpcomingPayables({
      tenantId: a.tenant.id,
      nDays: 5,
      now,
    });
    expect(snapA.items).toHaveLength(1);
    expect(snapA.items[0]?.unpaid.equals(4)).toBe(true);
    expect(snapB.items[0]?.unpaid.equals(11)).toBe(true);
    expect(payA.items).toHaveLength(1);
    expect(payA.items[0]?.unpaid.equals(15)).toBe(true);
  });
});

describe('AnalyticsService — fluxo previsto 90 dias', () => {
  it('hoje e dia 90 entram; passado, dia 91 e OVERDUE futuro ativo respeitam dueDate', async () => {
    const seeded = await seedConnected('an-9c-cf');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({ externalId: 'past', status: 'OPEN', dueDate: '2026-08-18', unpaid: '50' }),
        installment({ externalId: 'today', status: 'OPEN', dueDate: '2026-08-19', unpaid: '3' }),
        installment({
          externalId: 'overdue-future',
          status: 'OVERDUE',
          dueDate: '2026-09-01',
          unpaid: '4',
        }),
        installment({
          externalId: 'partial',
          status: 'PARTIALLY_PAID',
          dueDate: '2026-10-10',
          unpaid: '1.25',
          paid: '2',
          total: '3.25',
        }),
        installment({ externalId: 'day90', status: 'OPEN', dueDate: '2026-11-17', unpaid: '6' }),
        installment({ externalId: 'day91', status: 'OPEN', dueDate: '2026-11-18', unpaid: '99' }),
        installment({
          externalId: 'lost',
          status: 'LOST',
          dueDate: '2026-09-01',
          unpaid: '40',
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [installment({ externalId: 'ap-sep', status: 'OPEN', dueDate: '2026-09-15', unpaid: '2' })],
    );

    const forecast = await analytics.getCashFlowForecast({ tenantId: seeded.tenant.id, now });
    const byKey = Object.fromEntries(forecast.buckets.map((item) => [item.key, item]));
    expect(forecast.buckets.map((item) => item.key)).toEqual([
      '2026-08',
      '2026-09',
      '2026-10',
      '2026-11',
    ]);
    expect(byKey['2026-08']?.inflows.equals(3)).toBe(true);
    expect(byKey['2026-09']?.inflows.equals(4)).toBe(true);
    expect(byKey['2026-09']?.outflows.equals(2)).toBe(true);
    expect(byKey['2026-09']?.net.equals(2)).toBe(true);
    expect(byKey['2026-10']?.inflows.equals(new Prisma.Decimal('1.25'))).toBe(true);
    expect(byKey['2026-11']?.inflows.equals(6)).toBe(true);

    const snapshot = await analytics.getFinancialStockSnapshot({
      tenantId: seeded.tenant.id,
      now,
    });
    expect(snapshot.receivableDelinquency.rate).not.toBeUndefined();
    expect(snapshot.receivables.overdue.equals(50)).toBe(true);
  });

  it('isola buckets por tenant com o mesmo externalId', async () => {
    const a = await seedConnected('an-9c-cf-a');
    const b = await seedConnected('an-9c-cf-b');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [installment({ externalId: 'same', status: 'OPEN', dueDate: '2026-09-01', unpaid: '8' })],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [installment({ externalId: 'same', status: 'OPEN', dueDate: '2026-09-01', unpaid: '1' })],
    );
    const fa = await analytics.getCashFlowForecast({ tenantId: a.tenant.id, now });
    const fb = await analytics.getCashFlowForecast({ tenantId: b.tenant.id, now });
    const sepA = fa.buckets.find((item) => item.key === '2026-09');
    const sepB = fb.buckets.find((item) => item.key === '2026-09');
    expect(sepA?.inflows.equals(8)).toBe(true);
    expect(sepB?.inflows.equals(1)).toBe(true);
  });
});
