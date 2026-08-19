import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createReceivableReadRepository } from '../src/modules/finance/repositories/receivable-read.repository.js';
import { createPayableReadRepository } from '../src/modules/finance/repositories/payable-read.repository.js';
import { createFinancialCategoryReadRepository } from '../src/modules/finance/repositories/financial-category-read.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const receivables = createReceivableReadRepository(prisma);
const payables = createPayableReadRepository(prisma);
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

function civilDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function installment(input: {
  readonly externalId: string;
  readonly status: FinancialInstallmentStatus;
  readonly dueDate: string;
  readonly total?: string;
  readonly paid?: string;
  readonly unpaid?: string;
  readonly categoryExternalIds?: readonly string[];
}) {
  const total = new Prisma.Decimal(input.total ?? '100.0000');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const unpaid = new Prisma.Decimal(input.unpaid ?? input.total ?? '100.0000');
  return {
    externalId: input.externalId,
    description: input.externalId,
    dueDate: civilDate(input.dueDate),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status,
    upstreamStatus: input.status,
    total,
    paid,
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [...(input.categoryExternalIds ?? [])],
  };
}

const ALL_STATUSES: readonly FinancialInstallmentStatus[] = [
  'OPEN',
  'OVERDUE',
  'PARTIALLY_PAID',
  'PAID',
  'LOST',
  'RENEGOTIATED',
  'UNKNOWN',
];

describe('Read model financeiro (Fase 8A)', () => {
  it('isola receivables e payables entre tenants com o mesmo externalId', async () => {
    const a = await seedConnected('fin-read-a');
    const b = await seedConnected('fin-read-b');
    const syncedAt = new Date();
    const shared = installment({
      externalId: 'same-ext',
      status: 'OPEN',
      dueDate: '2026-08-20',
    });
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [shared],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [shared],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [shared],
    );
    await financial.upsertPayables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [shared],
    );

    const arA = await receivables.findActiveByTenant({ tenantId: a.tenant.id });
    const arB = await receivables.findActiveByTenant({ tenantId: b.tenant.id });
    const apA = await payables.findActiveByTenant({ tenantId: a.tenant.id });
    const apB = await payables.findActiveByTenant({ tenantId: b.tenant.id });

    expect(arA).toHaveLength(1);
    expect(arB).toHaveLength(1);
    expect(arA[0]?.tenantId).toBe(a.tenant.id);
    expect(arB[0]?.tenantId).toBe(b.tenant.id);
    expect(arA[0]?.externalId).toBe('same-ext');
    expect(arB[0]?.externalId).toBe('same-ext');
    expect(apA[0]?.tenantId).toBe(a.tenant.id);
    expect(apB[0]?.tenantId).toBe(b.tenant.id);

    const withWrongIntegration = await receivables.findActiveByTenant({
      tenantId: a.tenant.id,
      integrationId: b.integration.id,
    });
    expect(withWrongIntegration).toEqual([]);
  });

  it('seleciona somente títulos ativos em AR e AP', async () => {
    const seeded = await seedConnected('fin-read-status');
    const syncedAt = new Date();
    const items = ALL_STATUSES.map((status, index) =>
      installment({
        externalId: `item-${status}`,
        status,
        dueDate: `2026-08-${String(10 + index).padStart(2, '0')}`,
        unpaid: status === 'PAID' ? '0' : '10.0000',
        paid: status === 'PAID' ? '10.0000' : status === 'PARTIALLY_PAID' ? '4.0000' : '0',
        total: '10.0000',
      }),
    );
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      items,
    );
    await financial.upsertPayables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      items,
    );

    const ar = await receivables.findActiveByTenant({ tenantId: seeded.tenant.id });
    const ap = await payables.findActiveByTenant({ tenantId: seeded.tenant.id });
    expect(ar.map((row) => row.status).sort()).toEqual(['OPEN', 'OVERDUE', 'PARTIALLY_PAID']);
    expect(ap.map((row) => row.status).sort()).toEqual(['OPEN', 'OVERDUE', 'PARTIALLY_PAID']);
  });

  it('preserva Decimal de PARTIALLY_PAID sem converter para number', async () => {
    const seeded = await seedConnected('fin-read-partial');
    await financial.upsertReceivables(
      {
        tenantId: seeded.tenant.id,
        integrationId: seeded.integration.id,
        syncedAt: new Date(),
      },
      [
        installment({
          externalId: 'partial-1',
          status: 'PARTIALLY_PAID',
          dueDate: '2026-08-15',
          total: '10.5000',
          paid: '3.2500',
          unpaid: '7.2500',
        }),
      ],
    );
    const [row] = await receivables.findActiveByTenant({ tenantId: seeded.tenant.id });
    expect(row?.total).toBeInstanceOf(Prisma.Decimal);
    expect(row?.paid).toBeInstanceOf(Prisma.Decimal);
    expect(row?.unpaid).toBeInstanceOf(Prisma.Decimal);
    expect(row?.total.equals(new Prisma.Decimal('10.5000'))).toBe(true);
    expect(row?.paid.equals(new Prisma.Decimal('3.2500'))).toBe(true);
    expect(row?.unpaid.equals(new Prisma.Decimal('7.2500'))).toBe(true);
    expect(typeof row?.unpaid).not.toBe('number');
  });

  it('filtra dueDate com intervalo inclusivo sem interpretar vencido/futuro', async () => {
    const seeded = await seedConnected('fin-read-range');
    const syncedAt = new Date();
    const dates = ['2026-08-10', '2026-08-15', '2026-08-20', '2026-08-25', '2026-08-30'] as const;
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      dates.map((dueDate) => installment({ externalId: `r-${dueDate}`, status: 'OPEN', dueDate })),
    );
    await financial.upsertPayables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      dates.map((dueDate) => installment({ externalId: `p-${dueDate}`, status: 'OPEN', dueDate })),
    );

    const from = civilDate('2026-08-15');
    const to = civilDate('2026-08-25');
    const ar = await receivables.findActiveByDueDateRange({
      tenantId: seeded.tenant.id,
      from,
      to,
    });
    const ap = await payables.findActiveByDueDateRange({
      tenantId: seeded.tenant.id,
      from,
      to,
    });
    expect(ar.map((row) => row.externalId)).toEqual([
      'r-2026-08-15',
      'r-2026-08-20',
      'r-2026-08-25',
    ]);
    expect(ap.map((row) => row.externalId)).toEqual([
      'p-2026-08-15',
      'p-2026-08-20',
      'p-2026-08-25',
    ]);
    expect(
      await receivables.findActiveByDueDateRange({
        tenantId: seeded.tenant.id,
        from: civilDate('2026-09-01'),
        to: civilDate('2026-08-01'),
      }),
    ).toEqual([]);
  });

  it('lookup de categorias é tenant-scoped e não classifica', async () => {
    const a = await seedConnected('fin-cat-a');
    const b = await seedConnected('fin-cat-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'cat-shared',
          name: 'Receita A',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
        {
          externalId: 'cat-a-only',
          name: 'Só A',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertCategories(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        {
          externalId: 'cat-shared',
          name: 'Receita B',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );

    expect(
      await categories.findByTenantAndExternalIds({
        tenantId: a.tenant.id,
        externalIds: [],
      }),
    ).toEqual([]);

    const one = await categories.findByTenantAndExternalIds({
      tenantId: a.tenant.id,
      externalIds: ['cat-shared'],
    });
    expect(one).toHaveLength(1);
    expect(one[0]?.name).toBe('Receita A');
    expect(one[0]?.type).toBe('REVENUE');

    const many = await categories.findByTenantAndExternalIds({
      tenantId: a.tenant.id,
      externalIds: ['cat-shared', 'cat-a-only', 'missing'],
    });
    expect(many.map((row) => row.externalId).sort()).toEqual(['cat-a-only', 'cat-shared']);

    const otherTenant = await categories.findByTenantAndExternalIds({
      tenantId: b.tenant.id,
      externalIds: ['cat-shared', 'cat-a-only'],
    });
    expect(otherTenant).toHaveLength(1);
    expect(otherTenant[0]?.name).toBe('Receita B');
    expect(otherTenant[0]?.tenantId).toBe(b.tenant.id);
  });
});
