import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { addCivilDays } from '../src/modules/analytics/domain/civil-calendar.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
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
  readonly dueDate: Date;
  readonly unpaid?: string;
  readonly description?: string;
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '10');
  return {
    externalId: input.externalId,
    description: input.description ?? 'descricao-secreta-nao-vazar',
    dueDate: input.dueDate,
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status,
    upstreamStatus: input.status,
    total: unpaid,
    paid: new Prisma.Decimal(0),
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [],
  };
}

function expectNoPii(body: unknown) {
  const json = JSON.stringify(body);
  expect(json).not.toMatch(/access-token|refresh-token|Bearer|ciphertext/i);
  expect(json).not.toMatch(/externalAccountId|cpf|cnpj|documento|telefone|party/i);
  expect(json).not.toContain('descricao-secreta-nao-vazar');
  expect(json).not.toContain('tenantId');
  expect(json).not.toContain('access-token-secret');
}

describe('GET /dashboard/upcoming (fase 10C)', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard/upcoming?days=15' });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@up.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@up.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/upcoming?days=15',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('days ausente, 0, negativo, float e 31 retornam 400; 7/15/30 retornam 200', async () => {
    const seeded = await seedConnected('up-days');
    await createUser({ email: 'user-days@up.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-days@up.test');

    const missing = await app.inject({
      method: 'GET',
      url: '/dashboard/upcoming',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(400);

    for (const days of ['0', '-1', '1.5', '31']) {
      const bad = await app.inject({
        method: 'GET',
        url: `/dashboard/upcoming?days=${days}`,
        headers: { cookie },
      });
      expect(bad.statusCode).toBe(400);
    }

    for (const days of ['7', '15', '30']) {
      const ok = await app.inject({
        method: 'GET',
        url: `/dashboard/upcoming?days=${days}`,
        headers: { cookie },
      });
      expect(ok.statusCode).toBe(200);
      expect(ok.headers['cache-control']).toBe('private, no-store');
      expect(ok.json().nDays).toBe(Number(days));
      expect(ok.json().summary).toEqual({ receivable: '0', payable: '0', net: '0' });
    }
  });

  it('USER lê só o próprio tenant, rejeita tenantId e não vaza PII', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const a = await seedConnected('up-a');
    const b = await seedConnected('up-b');
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'ar-a',
          status: 'OPEN',
          dueDate: addCivilDays(today, 2),
          unpaid: '8.5',
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'ap-a',
          status: 'PARTIALLY_PAID',
          dueDate: addCivilDays(today, 3),
          unpaid: '4',
        }),
      ],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'ar-b',
          status: 'OPEN',
          dueDate: addCivilDays(today, 2),
          unpaid: '333',
        }),
      ],
    );
    await createUser({ email: 'user-a@up.test', role: 'USER', tenantId: a.tenant.id });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-a@up.test');
    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/upcoming?days=15',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    const body = ok.json();
    expectSafeUpcoming(body);
    expectNoPii(body);
    expect(body.receivables.items).toHaveLength(1);
    expect(body.receivables.items[0].unpaid).toBe('8.5');
    expect(typeof body.receivables.items[0].unpaid).toBe('string');
    expect(body.receivables.items[0].dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.payables.items[0].status).toBe('PARTIALLY_PAID');
    expect(body.summary).toEqual({ receivable: '8.5', payable: '4', net: '4.5' });
    expect(typeof body.summary.receivable).toBe('string');
    expect(typeof body.summary.payable).toBe('string');
    expect(typeof body.summary.net).toBe('string');
    expect(JSON.stringify(body)).not.toContain('333');

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/upcoming?days=15&tenantId=${b.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
    expect(JSON.stringify(hijack.json())).not.toContain('333');
  });

  it('Support Mode consulta só o tenant suportado', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const a = await seedConnected('up-sup-a');
    const b = await seedConnected('up-sup-b');
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'ar-sup-a',
          status: 'OPEN',
          dueDate: addCivilDays(today, 1),
          unpaid: '8',
        }),
      ],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'ar-sup-b',
          status: 'OPEN',
          dueDate: addCivilDays(today, 1),
          unpaid: '333',
        }),
      ],
    );
    await createUser({ email: 'super-up@up.test', role: 'SUPER_ADMIN' });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'super-up@up.test');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie, 'user-agent': 'upcoming-support' },
      payload: { tenantId: a.tenant.id },
    });
    expect(enter.statusCode).toBe(200);

    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/upcoming?days=7',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().receivables.items[0].unpaid).toBe('8');
    expect(JSON.stringify(ok.json())).not.toContain('333');
  });

  it('DISCONNECTED com dados continua lendo upcoming', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const seeded = await seedConnected('up-disc');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'ar-disc',
          status: 'OPEN',
          dueDate: addCivilDays(today, 1),
          unpaid: '8',
        }),
      ],
    );
    await integrations.disconnect(seeded.tenant.id, new Date());
    await createUser({ email: 'user-disc@up.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-disc@up.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/upcoming?days=15',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().receivables.items[0].unpaid).toBe('8');
    expect(response.json().summary).toEqual({ receivable: '8', payable: '0', net: '8' });
  });

  it('summary soma unpaid da lista em 7/15/30 sem segunda fórmula', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const seeded = await seedConnected('up-e1');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'ar-7',
          status: 'OPEN',
          dueDate: addCivilDays(today, 2),
          unpaid: '8.5',
        }),
        installment({
          externalId: 'ar-15',
          status: 'OPEN',
          dueDate: addCivilDays(today, 10),
          unpaid: '20',
        }),
        installment({
          externalId: 'ar-30',
          status: 'OPEN',
          dueDate: addCivilDays(today, 20),
          unpaid: '30',
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [
        installment({
          externalId: 'ap-7',
          status: 'PARTIALLY_PAID',
          dueDate: addCivilDays(today, 3),
          unpaid: '4',
        }),
        installment({
          externalId: 'ap-15',
          status: 'OPEN',
          dueDate: addCivilDays(today, 12),
          unpaid: '1',
        }),
      ],
    );
    await createUser({ email: 'user-e1@up.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-e1@up.test');

    const expected = {
      7: { receivable: '8.5', payable: '4', net: '4.5' },
      15: { receivable: '28.5', payable: '5', net: '23.5' },
      30: { receivable: '58.5', payable: '5', net: '53.5' },
    } as const;

    for (const days of [7, 15, 30] as const) {
      const response = await app.inject({
        method: 'GET',
        url: `/dashboard/upcoming?days=${days}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const body = response.json();
      expectSafeUpcoming(body);
      expect(body.summary).toEqual(expected[days]);
      const receivableSum = (body.receivables.items as { unpaid: string }[]).reduce(
        (total, item) => total.plus(item.unpaid),
        new Prisma.Decimal(0),
      );
      const payableSum = (body.payables.items as { unpaid: string }[]).reduce(
        (total, item) => total.plus(item.unpaid),
        new Prisma.Decimal(0),
      );
      expect(body.summary.receivable).toBe(receivableSum.toString());
      expect(body.summary.payable).toBe(payableSum.toString());
      expect(body.summary.net).toBe(receivableSum.minus(payableSum).toString());
      expect(
        body.receivables.items.every((item: { unpaid: string }) => typeof item.unpaid === 'string'),
      ).toBe(true);
    }
  });
});

describe('GET /dashboard/cash-flow-forecast (fase 10C)', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard/cash-flow-forecast' });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@fc.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@fc.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-flow-forecast',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('USER lê forecast 90 dias, net string, sem PII e sem tenant alheio', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const a = await seedConnected('fc-a');
    const b = await seedConnected('fc-b');
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      [installment({ externalId: 'ar-fc-a', status: 'OPEN', dueDate: today, unpaid: '10' })],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt: new Date() },
      [installment({ externalId: 'ap-fc-a', status: 'OPEN', dueDate: today, unpaid: '4' })],
    );
    await financial.upsertReceivables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt: new Date() },
      [installment({ externalId: 'ar-fc-b', status: 'OPEN', dueDate: today, unpaid: '333' })],
    );
    await createUser({ email: 'user-a@fc.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-a@fc.test');

    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-flow-forecast',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-store');
    const body = ok.json();
    expectSafeForecast(body);
    expectNoPii(body);
    expect(body.horizonDays).toBe(90);
    expect(body.today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(body.buckets.length).toBeGreaterThan(0);
    expect(body.buckets[0].key).toMatch(/^\d{4}-\d{2}$/);
    expect(typeof body.buckets[0].net).toBe('string');
    const first = body.buckets[0];
    expect(first.inflows).toBe('10');
    expect(first.outflows).toBe('4');
    expect(first.net).toBe('6');
    expect(JSON.stringify(body)).not.toContain('333');

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/cash-flow-forecast?tenantId=${b.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
  });

  it('DISCONNECTED com dados continua lendo forecast', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const seeded = await seedConnected('fc-disc');
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt: new Date() },
      [installment({ externalId: 'ar-fc-disc', status: 'OPEN', dueDate: today, unpaid: '10' })],
    );
    await integrations.disconnect(seeded.tenant.id, new Date());
    await createUser({ email: 'user-disc@fc.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-disc@fc.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/cash-flow-forecast',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().horizonDays).toBe(90);
    expect(response.json().buckets[0].inflows).toBe('10');
  });
});

function expectSafeUpcoming(body: Record<string, unknown>) {
  expect(Object.keys(body).sort()).toEqual([
    'from',
    'nDays',
    'payables',
    'receivables',
    'summary',
    'to',
    'today',
  ]);
  const summary = body.summary as Record<string, unknown>;
  expect(Object.keys(summary).sort()).toEqual(['net', 'payable', 'receivable']);
  const receivables = body.receivables as { items: Record<string, unknown>[] };
  expect(Object.keys(receivables.items[0] ?? {}).sort()).toEqual([
    'dueDate',
    'id',
    'status',
    'unpaid',
  ]);
}

function expectSafeForecast(body: Record<string, unknown>) {
  expect(Object.keys(body).sort()).toEqual(['buckets', 'from', 'horizonDays', 'to', 'today']);
  const buckets = body.buckets as Record<string, unknown>[];
  expect(Object.keys(buckets[0] ?? {}).sort()).toEqual(['inflows', 'key', 'net', 'outflows']);
}
