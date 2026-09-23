import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { createExpectedPayableDetailsService } from '../src/modules/analytics/services/expected-payable-details.service.js';
import { createExpectedReceivableDetailsService } from '../src/modules/analytics/services/expected-receivable-details.service.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { createPartyReadRepository } from '../src/modules/finance/repositories/party-read.repository.js';
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
const payables = createPayableReadRepository(prisma);
const receivables = createReceivableReadRepository(prisma);
const categories = createFinancialCategoryReadRepository(prisma);
const parties = createPartyReadRepository(prisma);
const payableDetails = createExpectedPayableDetailsService({
  payables,
  categories,
  parties,
});
const receivableDetails = createExpectedReceivableDetailsService({
  receivables,
  categories,
  parties,
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

describe('estoque financeiro — persistência', () => {
  const now = new Date('2026-09-23T15:00:00.000Z');

  it('11 — isolamento multi-tenant no stock-details', async () => {
    const a = await seedConnected('stock-tenant-a');
    const b = await seedConnected('stock-tenant-b');
    const syncedAt = new Date();
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [installment({ externalId: 'ap-a', status: 'OPEN', dueDate: '2026-08-20', unpaid: '100' })],
    );
    await financial.upsertPayables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [installment({ externalId: 'ap-b', status: 'OPEN', dueDate: '2026-08-20', unpaid: '999' })],
    );

    const stockA = await payableDetails.getPayableStockDetails({
      tenantId: a.tenant.id,
      monthKey: '2026-08',
      now,
    });
    const stockB = await payableDetails.getPayableStockDetails({
      tenantId: b.tenant.id,
      monthKey: '2026-08',
      now,
    });

    expect(stockA.items.map((item) => item.externalId)).toEqual(['ap-a']);
    expect(stockA.total?.toString()).toBe('100');
    expect(stockB.items.map((item) => item.externalId)).toEqual(['ap-b']);
    expect(stockB.total?.toString()).toBe('999');
  });

  it('7 — DELETED sai do estoque atual', async () => {
    const seeded = await seedConnected('stock-deleted');
    const syncedAt = new Date();
    await financial.upsertPayables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [installment({ externalId: 'ap-del', status: 'OPEN', dueDate: '2026-08-20', unpaid: '80' })],
    );

    const before = await payableDetails.getPayableStockDetails({
      tenantId: seeded.tenant.id,
      monthKey: '2026-08',
      now,
    });
    expect(before.total?.toString()).toBe('80');

    await prisma.payable.updateMany({
      where: { tenantId: seeded.tenant.id, externalId: 'ap-del' },
      data: { lifecycleStatus: 'DELETED' },
    });

    const after = await payableDetails.getPayableStockDetails({
      tenantId: seeded.tenant.id,
      monthKey: '2026-08',
      now,
    });
    expect(after.items).toHaveLength(0);
    expect(after.total?.toString()).toBe('0');
  });

  it('4/8 — receivable de agosto só entra no recorte de agosto', async () => {
    const seeded = await seedConnected('stock-overdue-month');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [installment({ externalId: 'ar-aug', status: 'OPEN', dueDate: '2026-08-20', unpaid: '55' })],
    );

    const september = await receivableDetails.getReceivableStockDetails({
      tenantId: seeded.tenant.id,
      monthKey: '2026-09',
      now,
    });
    expect(september.items).toHaveLength(0);
    expect(september.total?.toString()).toBe('0');

    const august = await receivableDetails.getReceivableStockDetails({
      tenantId: seeded.tenant.id,
      monthKey: '2026-08',
      now,
    });
    expect(august.items).toHaveLength(1);
    expect(august.items[0]?.situation).toBe('OVERDUE');
    expect(august.overdue?.toString()).toBe('55');
    expect(august.total?.toString()).toBe('55');
  });

  it('7 card/modal — stock-details reconcilia com o recorte mensal do seletor', async () => {
    const seeded = await seedConnected('stock-month-window');
    const syncedAt = new Date();
    await financial.upsertPayables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({ externalId: 'ap-aug', status: 'OPEN', dueDate: '2026-08-20', unpaid: '80' }),
        installment({ externalId: 'ap-sep', status: 'OPEN', dueDate: '2026-09-22', unpaid: '25' }),
      ],
    );

    const september = await payableDetails.getPayableStockDetails({
      tenantId: seeded.tenant.id,
      monthKey: '2026-09',
      now,
    });
    expect(september.items.map((item) => item.externalId)).toEqual(['ap-sep']);
    expect(september.total?.toString()).toBe('25');
    expect(september.overdue?.toString()).toBe('25');
  });
});
