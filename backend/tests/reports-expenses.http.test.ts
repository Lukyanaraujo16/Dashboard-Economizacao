import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { addCivilDays, civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  createArgon2idPasswordHasher,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const integrations = createContaAzulIntegrationRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);
const users = createUserRepository(prisma);
const credentials = createUserCredentialRepository(prisma);
const passwordHasher = createArgon2idPasswordHasher();

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await Promise.all(
    [...apps].map(async (app) => {
      try {
        const prefix = buildSessionKeyPrefix('test');
        const keys = await app.redis.keys(`${prefix}*`);
        if (keys.length > 0) {
          await app.redis.del(...keys);
        }
      } catch {
        // ignore
      }
      try {
        await app.close();
      } catch {
        // ignore
      }
    }),
  );
  apps.clear();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

function readSessionCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const values = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];
  const withValue = values.filter((value) => /^dashboard\.sid=[^;]+/.test(value));
  return withValue.at(-1);
}

function cookieValue(setCookie: string): string {
  return setCookie.split(';')[0] ?? setCookie;
}

async function buildTestApp() {
  const app = await buildApp();
  apps.add(app);
  return app;
}

async function createUser(options: {
  email: string;
  role: 'ADMIN' | 'SUPER_ADMIN' | 'USER';
  tenantId?: string | null;
}) {
  const user = await users.create({
    name: options.email,
    email: options.email,
    role: options.role,
    tenantId: options.role === 'USER' ? (options.tenantId ?? null) : null,
    status: 'ACTIVE',
  });
  await credentials.create({
    userId: user.id,
    passwordHash: await passwordHasher.hash(VALID_PASSWORD),
  });
  return user;
}

async function loginAs(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: VALID_PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  const cookie = readSessionCookie(response.headers['set-cookie']);
  expect(cookie).toBeTruthy();
  return cookieValue(cookie!);
}

async function seedConnected(name: string) {
  const environment = loadEnvironment();
  const tenant = await tenants.create({ name, displayName: name });
  const integration = await integrations.persistConnectedTokens({
    tenantId: tenant.id,
    encryptedAccessToken: encryptSecret(
      'access-token-secret',
      environment.integrationEncryptionKey!,
    ),
    encryptedRefreshToken: encryptSecret(
      'refresh-token-secret',
      environment.integrationEncryptionKey!,
    ),
    accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    tokenType: 'Bearer',
    at: new Date(),
  });
  return { tenant, integration };
}

function installment(input: {
  readonly externalId: string;
  readonly status: FinancialInstallmentStatus;
  readonly total: string;
  readonly paid?: string;
  readonly unpaid?: string;
  readonly competenceDate: Date | null;
  readonly dueDate?: Date;
  readonly categoryExternalIds?: readonly string[];
}) {
  const total = new Prisma.Decimal(input.total);
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const unpaid = new Prisma.Decimal(input.unpaid ?? total.minus(paid).toString());
  const today = civilTodayInSaoPaulo(new Date());
  return {
    externalId: input.externalId,
    description: 'descricao-secreta-nao-vazar',
    dueDate: input.dueDate ?? today,
    competenceDate: input.competenceDate,
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

async function categoryId(tenantId: string, externalId: string): Promise<string> {
  const row = await prisma.financialCategory.findFirst({ where: { tenantId, externalId } });
  expect(row).not.toBeNull();
  return row!.id;
}

function expensesUrl(query: string): string {
  return `/reports/expenses?${query}`;
}

describe('GET /reports/expenses', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01'),
    });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@re.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@re.test');
    const response = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01'),
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejeita intervalo inválido, invertido, teto e tenantId; aceita 24 meses', async () => {
    const a = await seedConnected('re-range');
    await createUser({ email: 'user@re-range.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@re-range.test');

    const missing = await app.inject({
      method: 'GET',
      url: '/reports/expenses',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(400);

    const invalid = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-1&to=2026-08'),
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);

    const inverted = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-08&to=2026-01'),
      headers: { cookie },
    });
    expect(inverted.statusCode).toBe(400);

    const tooLarge = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2025-01&to=2027-01'),
      headers: { cookie },
    });
    expect(tooLarge.statusCode).toBe(400);

    const maxRange = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2025-01&to=2026-12'),
      headers: { cookie },
    });
    expect(maxRange.statusCode).toBe(200);
    expect(maxRange.json().months).toHaveLength(24);

    const tenantQuery = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=2026-01&to=2026-01&tenantId=${a.tenant.id}`),
      headers: { cookie },
    });
    expect(tenantQuery.statusCode).toBe(400);
  });

  it('agrega vários meses, isola tenant e bate com monthly-expenses no mesmo mês', async () => {
    const jan = civilMonthBoundsFromKey('2026-01');
    const feb = civilMonthBoundsFromKey('2026-02');
    const a = await seedConnected('re-a');
    const b = await seedConnected('re-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'alug',
          name: 'Aluguel',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
        {
          externalId: 'serv',
          name: 'Serviços',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'jan-open',
          status: 'OPEN',
          total: '10000',
          competenceDate: jan.from,
          categoryExternalIds: ['alug'],
        }),
        installment({
          externalId: 'jan-paid',
          status: 'PAID',
          total: '4000',
          paid: '4000',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'feb-paid',
          status: 'PAID',
          total: '5000',
          paid: '5000',
          unpaid: '0',
          competenceDate: feb.from,
          categoryExternalIds: ['alug'],
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        installment({
          externalId: 'other-tenant',
          status: 'PAID',
          total: '333',
          paid: '333',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['alug'],
        }),
      ],
    );
    await createUser({ email: 'user-a@re.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'user-b@re.test', role: 'USER', tenantId: b.tenant.id });
    const app = await buildTestApp();
    const cookieA = await loginAs(app, 'user-a@re.test');
    const cookieB = await loginAs(app, 'user-b@re.test');

    const empty = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2024-01&to=2024-01'),
      headers: { cookie: cookieA },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().payables.total).toBe('0');
    expect(empty.json().payables.coverageRate).toBeNull();
    expect(empty.json().months).toEqual([
      expect.objectContaining({ monthKey: '2024-01' }),
    ]);

    const range = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-02'),
      headers: { cookie: cookieA },
    });
    expect(range.statusCode).toBe(200);
    expect(range.headers['cache-control']).toBe('private, no-store');
    const body = range.json() as {
      from: string;
      to: string;
      payables: {
        total: string;
        paid: string | null;
        items: ReadonlyArray<{ name: string; amount: string; paid: string | null }>;
      };
      months: ReadonlyArray<{ monthKey: string; payables: { total: string; daily: unknown[] } }>;
    };
    expect(body.from).toBe('2026-01');
    expect(body.to).toBe('2026-02');
    expect(body.payables.total).toBe('19000');
    expect(body.payables.paid).toBe('9000');
    expect(body.months.map((month) => month.monthKey)).toEqual(['2026-01', '2026-02']);
    expect(body.months[0]?.payables.total).toBe('14000');
    expect(body.months[1]?.payables.total).toBe('5000');
    expect(Array.isArray(body.months[0]?.payables.daily)).toBe(true);
    expect(body.payables.items.find((item) => item.name === 'Aluguel')?.amount).toBe('15000');
    expect(JSON.stringify(body)).not.toContain('333');
    expect('daily' in body.payables).toBe(false);

    const monthly = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-expenses?month=2026-01',
      headers: { cookie: cookieA },
    });
    expect(monthly.statusCode).toBe(200);
    const single = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01'),
      headers: { cookie: cookieA },
    });
    expect(single.statusCode).toBe(200);
    expect(single.json().payables.total).toBe(monthly.json().payables.total);
    expect(single.json().payables.paid).toBe(monthly.json().payables.paid);
    expect(single.json().payables.outstanding).toBe(monthly.json().payables.outstanding);
    expect(single.json().payables.items).toEqual(monthly.json().payables.items);
    expect(single.json().months[0].payables.daily).toEqual(monthly.json().payables.daily);

    const other = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-02'),
      headers: { cookie: cookieB },
    });
    expect(other.statusCode).toBe(200);
    expect(other.json().payables.total).toBe('333');
    expect(JSON.stringify(other.json())).not.toContain('10000');
  });

  it('aplica situation, overdue D1, category incompatível e a combinação AND', async () => {
    const jan = civilMonthBoundsFromKey('2026-01');
    const today = civilTodayInSaoPaulo(new Date());
    const yesterday = addCivilDays(today, -1);
    const tomorrow = addCivilDays(today, 1);
    const a = await seedConnected('re-filters');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'alug',
          name: 'Aluguel',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
        {
          externalId: 'serv',
          name: 'Serviços',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
        {
          externalId: 'vendas',
          name: 'Vendas',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'paid-alug',
          status: 'PAID',
          total: '100',
          paid: '100',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['alug'],
        }),
        installment({
          externalId: 'open-alug',
          status: 'OPEN',
          total: '40',
          competenceDate: jan.from,
          dueDate: tomorrow,
          categoryExternalIds: ['alug'],
        }),
        installment({
          externalId: 'overdue-alug',
          status: 'OPEN',
          total: '25',
          competenceDate: jan.from,
          dueDate: yesterday,
          categoryExternalIds: ['alug'],
        }),
        installment({
          externalId: 'persisted-overdue-future',
          status: 'OVERDUE',
          total: '15',
          competenceDate: jan.from,
          dueDate: tomorrow,
          categoryExternalIds: ['alug'],
        }),
        installment({
          externalId: 'paid-serv',
          status: 'PAID',
          total: '25',
          paid: '25',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['serv'],
        }),
      ],
    );
    const alugId = await categoryId(a.tenant.id, 'alug');
    const vendasId = await categoryId(a.tenant.id, 'vendas');
    await createUser({ email: 'user@re-filters.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@re-filters.test');

    const settled = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01&situation=settled'),
      headers: { cookie },
    });
    expect(settled.statusCode).toBe(200);
    expect(settled.json().payables.total).toBe('125');

    const open = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01&situation=open'),
      headers: { cookie },
    });
    expect(open.statusCode).toBe(200);
    expect(open.json().payables.total).toBe('80');

    const overdue = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01&situation=overdue'),
      headers: { cookie },
    });
    expect(overdue.statusCode).toBe(200);
    expect(overdue.json().payables.total).toBe('25');

    const named = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=2026-01&to=2026-01&category=${alugId}`),
      headers: { cookie },
    });
    expect(named.statusCode).toBe(200);
    expect(named.json().payables.total).toBe('180');

    const combo = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=2026-01&to=2026-01&situation=settled&category=${alugId}`),
      headers: { cookie },
    });
    expect(combo.statusCode).toBe(200);
    expect(combo.json().payables.total).toBe('100');

    const revenueOnAp = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=2026-01&to=2026-01&category=${vendasId}`),
      headers: { cookie },
    });
    expect(revenueOnAp.statusCode).toBe(200);
    expect(revenueOnAp.json().payables.total).toBe('0');

    const invalidSituation = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01&situation=PAID'),
      headers: { cookie },
    });
    expect(invalidSituation.statusCode).toBe(400);

    const missingCategory = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01&category=8cf7b841-7d8c-4166-b24b-5f350e0d5403'),
      headers: { cookie },
    });
    expect(missingCategory.statusCode).toBe(404);
  });

  it('respeita costCenter (CC1) e Support Mode', async () => {
    const jan = civilMonthBoundsFromKey('2026-01');
    const a = await seedConnected('re-cc');
    const b = await seedConnected('re-cc-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'alug',
          name: 'Aluguel',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'p1',
          status: 'OPEN',
          total: '10000',
          competenceDate: jan.from,
          categoryExternalIds: ['alug'],
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        installment({
          externalId: 'b1',
          status: 'PAID',
          total: '777',
          paid: '777',
          unpaid: '0',
          competenceDate: jan.from,
        }),
      ],
    );
    const payable = await prisma.payable.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'p1' },
    });
    const centerA = await prisma.costCenter.create({
      data: {
        tenantId: a.tenant.id,
        integrationId: a.integration.id,
        externalId: 'cc-a',
        code: 'A',
        name: 'Centro A',
        active: true,
        syncedAt,
      },
    });
    await prisma.installmentCostCenterAllocation.create({
      data: {
        tenantId: a.tenant.id,
        costCenterId: centerA.id,
        receivableId: null,
        payableId: payable.id,
        amount: new Prisma.Decimal('3000'),
        syncedAt,
      },
    });

    await createUser({ email: 'user@re-cc.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'admin@re-cc.test', role: 'ADMIN' });
    const app = await buildTestApp();
    const userCookie = await loginAs(app, 'user@re-cc.test');
    const filtered = await app.inject({
      method: 'GET',
      url: expensesUrl(`from=2026-01&to=2026-01&costCenter=${centerA.id}`),
      headers: { cookie: userCookie },
    });
    expect(filtered.statusCode).toBe(200);
    const monthly = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-expenses?month=2026-01&costCenter=${centerA.id}`,
      headers: { cookie: userCookie },
    });
    expect(monthly.statusCode).toBe(200);
    expect(filtered.json().payables.total).toBe('3000');
    expect(filtered.json().payables.total).toBe(monthly.json().payables.total);
    expect(filtered.json().payables.paid).toBe(monthly.json().payables.paid);
    expect(filtered.json().costCenterCashSplit).toBe(monthly.json().costCenterCashSplit);

    const otherCenter = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01&costCenter=8cf7b841-7d8c-4166-b24b-5f350e0d5403'),
      headers: { cookie: userCookie },
    });
    expect(otherCenter.statusCode).toBe(404);

    const adminCookie = await loginAs(app, 'admin@re-cc.test');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie: adminCookie, 'user-agent': 're-support' },
      payload: { tenantId: a.tenant.id },
    });
    expect(enter.statusCode).toBe(200);
    const supported = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01'),
      headers: { cookie: adminCookie },
    });
    expect(supported.statusCode).toBe(200);
    expect(supported.json().payables.total).toBe('10000');
    expect(JSON.stringify(supported.json())).not.toContain('777');

    await app.inject({
      method: 'POST',
      url: '/auth/support/exit',
      headers: { cookie: adminCookie },
    });
    const afterExit = await app.inject({
      method: 'GET',
      url: expensesUrl('from=2026-01&to=2026-01'),
      headers: { cookie: adminCookie },
    });
    expect(afterExit.statusCode).toBe(403);
  });
});
