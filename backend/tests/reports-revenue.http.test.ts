import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { civilMonthBoundsFromKey } from '../src/modules/analytics/domain/civil-calendar.js';
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

function revenueUrl(query: string): string {
  return `/reports/revenue?${query}`;
}

describe('GET /reports/revenue', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01'),
    });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@rr.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@rr.test');
    const response = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01'),
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('rejeita intervalo inválido, invertido, teto e tenantId', async () => {
    const a = await seedConnected('rr-range');
    await createUser({ email: 'user@rr-range.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@rr-range.test');

    const missing = await app.inject({
      method: 'GET',
      url: '/reports/revenue',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(400);

    const invalid = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-1&to=2026-08'),
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);

    const inverted = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-08&to=2026-01'),
      headers: { cookie },
    });
    expect(inverted.statusCode).toBe(400);

    const tooLarge = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2025-01&to=2027-01'),
      headers: { cookie },
    });
    expect(tooLarge.statusCode).toBe(400);

    const tenantQuery = await app.inject({
      method: 'GET',
      url: revenueUrl(`from=2026-01&to=2026-01&tenantId=${a.tenant.id}`),
      headers: { cookie },
    });
    expect(tenantQuery.statusCode).toBe(400);
  });

  it('agrega vários meses, isola tenant e bate com monthly-revenue no mesmo mês', async () => {
    const jan = civilMonthBoundsFromKey('2026-01');
    const feb = civilMonthBoundsFromKey('2026-02');
    const a = await seedConnected('rr-a');
    const b = await seedConnected('rr-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'serv',
          name: 'Serviços',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
        {
          externalId: 'prod',
          name: 'Produtos',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'jan-open',
          status: 'OPEN',
          total: '10000',
          competenceDate: jan.from,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'jan-paid',
          status: 'PAID',
          total: '4000',
          paid: '4000',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['prod'],
        }),
        installment({
          externalId: 'feb-paid',
          status: 'PAID',
          total: '5000',
          paid: '5000',
          unpaid: '0',
          competenceDate: feb.from,
          categoryExternalIds: ['serv'],
        }),
      ],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        installment({
          externalId: 'other-tenant',
          status: 'PAID',
          total: '333',
          paid: '333',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['serv'],
        }),
      ],
    );
    await createUser({ email: 'user-a@rr.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'user-b@rr.test', role: 'USER', tenantId: b.tenant.id });
    const app = await buildTestApp();
    const cookieA = await loginAs(app, 'user-a@rr.test');
    const cookieB = await loginAs(app, 'user-b@rr.test');

    const empty = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2024-01&to=2024-01'),
      headers: { cookie: cookieA },
    });
    expect(empty.statusCode).toBe(200);
    expect(empty.json().receivables.total).toBe('0');
    expect(empty.json().receivables.coverageRate).toBeNull();
    expect(empty.json().months).toEqual([
      expect.objectContaining({ monthKey: '2024-01' }),
    ]);

    const range = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-02'),
      headers: { cookie: cookieA },
    });
    expect(range.statusCode).toBe(200);
    expect(range.headers['cache-control']).toBe('private, no-store');
    const body = range.json() as {
      from: string;
      to: string;
      receivables: {
        total: string;
        received: string | null;
        items: ReadonlyArray<{ name: string; amount: string }>;
      };
      months: ReadonlyArray<{ monthKey: string; receivables: { total: string; daily: unknown[] } }>;
    };
    expect(body.from).toBe('2026-01');
    expect(body.to).toBe('2026-02');
    expect(body.receivables.total).toBe('19000');
    expect(body.receivables.received).toBe('9000');
    expect(body.months.map((month) => month.monthKey)).toEqual(['2026-01', '2026-02']);
    expect(body.months[0]?.receivables.total).toBe('14000');
    expect(body.months[1]?.receivables.total).toBe('5000');
    expect(Array.isArray(body.months[0]?.receivables.daily)).toBe(true);
    expect(body.receivables.items.find((item) => item.name === 'Serviços')?.amount).toBe('15000');
    expect(JSON.stringify(body)).not.toContain('333');
    expect('daily' in body.receivables).toBe(false);

    const monthly = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?month=2026-01',
      headers: { cookie: cookieA },
    });
    expect(monthly.statusCode).toBe(200);
    const single = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01'),
      headers: { cookie: cookieA },
    });
    expect(single.statusCode).toBe(200);
    expect(single.json().receivables.total).toBe(monthly.json().receivables.total);
    expect(single.json().receivables.received).toBe(monthly.json().receivables.received);
    expect(single.json().receivables.outstanding).toBe(monthly.json().receivables.outstanding);
    expect(single.json().receivables.items).toEqual(monthly.json().receivables.items);
    expect(single.json().months[0].receivables.daily).toEqual(monthly.json().receivables.daily);

    const other = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-02'),
      headers: { cookie: cookieB },
    });
    expect(other.statusCode).toBe(200);
    expect(other.json().receivables.total).toBe('333');
    expect(JSON.stringify(other.json())).not.toContain('10000');
  });

  it('aplica situation, category e a combinação AND', async () => {
    const jan = civilMonthBoundsFromKey('2026-01');
    const a = await seedConnected('rr-filters');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'serv',
          name: 'Serviços',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
        {
          externalId: 'prod',
          name: 'Produtos',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'paid-serv',
          status: 'PAID',
          total: '100',
          paid: '100',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'open-serv',
          status: 'OPEN',
          total: '40',
          competenceDate: jan.from,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'paid-prod',
          status: 'PAID',
          total: '25',
          paid: '25',
          unpaid: '0',
          competenceDate: jan.from,
          categoryExternalIds: ['prod'],
        }),
      ],
    );
    const servId = await categoryId(a.tenant.id, 'serv');
    await createUser({ email: 'user@rr-filters.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user@rr-filters.test');

    const settled = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01&situation=settled'),
      headers: { cookie },
    });
    expect(settled.statusCode).toBe(200);
    expect(settled.json().receivables.total).toBe('125');

    const open = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01&situation=open'),
      headers: { cookie },
    });
    expect(open.statusCode).toBe(200);
    expect(open.json().receivables.total).toBe('40');

    const named = await app.inject({
      method: 'GET',
      url: revenueUrl(`from=2026-01&to=2026-01&category=${servId}`),
      headers: { cookie },
    });
    expect(named.statusCode).toBe(200);
    expect(named.json().receivables.total).toBe('140');

    const combo = await app.inject({
      method: 'GET',
      url: revenueUrl(`from=2026-01&to=2026-01&situation=settled&category=${servId}`),
      headers: { cookie },
    });
    expect(combo.statusCode).toBe(200);
    expect(combo.json().receivables.total).toBe('100');

    const invalidSituation = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01&situation=PAID'),
      headers: { cookie },
    });
    expect(invalidSituation.statusCode).toBe(400);

    const missingCategory = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01&category=8cf7b841-7d8c-4166-b24b-5f350e0d5403'),
      headers: { cookie },
    });
    expect(missingCategory.statusCode).toBe(404);
  });

  it('respeita costCenter (CC1) e Support Mode', async () => {
    const jan = civilMonthBoundsFromKey('2026-01');
    const a = await seedConnected('rr-cc');
    const b = await seedConnected('rr-cc-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'serv',
          name: 'Serviços',
          type: 'REVENUE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'r1',
          status: 'OPEN',
          total: '10000',
          competenceDate: jan.from,
          categoryExternalIds: ['serv'],
        }),
      ],
    );
    await financial.upsertReceivables(
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
    const receivable = await prisma.receivable.findFirstOrThrow({
      where: { tenantId: a.tenant.id, externalId: 'r1' },
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
        receivableId: receivable.id,
        payableId: null,
        amount: new Prisma.Decimal('3000'),
        syncedAt,
      },
    });

    await createUser({ email: 'user@rr-cc.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'admin@rr-cc.test', role: 'ADMIN' });
    const app = await buildTestApp();
    const userCookie = await loginAs(app, 'user@rr-cc.test');
    const filtered = await app.inject({
      method: 'GET',
      url: revenueUrl(`from=2026-01&to=2026-01&costCenter=${centerA.id}`),
      headers: { cookie: userCookie },
    });
    expect(filtered.statusCode).toBe(200);
    const monthly = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?month=2026-01&costCenter=${centerA.id}`,
      headers: { cookie: userCookie },
    });
    expect(monthly.statusCode).toBe(200);
    expect(filtered.json().receivables.total).toBe('3000');
    expect(filtered.json().receivables.total).toBe(monthly.json().receivables.total);
    expect(filtered.json().receivables.received).toBe(monthly.json().receivables.received);
    expect(filtered.json().costCenterCashSplit).toBe(monthly.json().costCenterCashSplit);

    const otherCenter = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01&costCenter=8cf7b841-7d8c-4166-b24b-5f350e0d5403'),
      headers: { cookie: userCookie },
    });
    expect(otherCenter.statusCode).toBe(404);

    const adminCookie = await loginAs(app, 'admin@rr-cc.test');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie: adminCookie, 'user-agent': 'rr-support' },
      payload: { tenantId: a.tenant.id },
    });
    expect(enter.statusCode).toBe(200);
    const supported = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01'),
      headers: { cookie: adminCookie },
    });
    expect(supported.statusCode).toBe(200);
    expect(supported.json().receivables.total).toBe('10000');
    expect(JSON.stringify(supported.json())).not.toContain('777');

    await app.inject({
      method: 'POST',
      url: '/auth/support/exit',
      headers: { cookie: adminCookie },
    });
    const afterExit = await app.inject({
      method: 'GET',
      url: revenueUrl('from=2026-01&to=2026-01'),
      headers: { cookie: adminCookie },
    });
    expect(afterExit.statusCode).toBe(403);
  });
});
