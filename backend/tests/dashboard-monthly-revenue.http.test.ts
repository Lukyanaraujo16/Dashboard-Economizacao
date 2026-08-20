import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { civilMonthBounds } from '../src/modules/analytics/domain/civil-calendar.js';
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

describe('GET /dashboard/monthly-revenue', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard/monthly-revenue' });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@mr.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@mr.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('inclui OPEN, parcial e PAID do mês; exclui outro mês, nulo e RENEGOTIATED', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from } = civilMonthBounds(today);
    const previousMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 10));
    const a = await seedConnected('mr-a');
    const b = await seedConnected('mr-b');
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
          externalId: 'open',
          status: 'OPEN',
          total: '10000',
          competenceDate: from,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'partial',
          status: 'PARTIALLY_PAID',
          total: '10000',
          paid: '4000',
          unpaid: '6000',
          competenceDate: from,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'paid',
          status: 'PAID',
          total: '10000',
          paid: '10000',
          unpaid: '0',
          competenceDate: from,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'other-month',
          status: 'PAID',
          total: '999',
          paid: '999',
          unpaid: '0',
          competenceDate: previousMonth,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'no-comp',
          status: 'OPEN',
          total: '888',
          competenceDate: null,
          categoryExternalIds: ['serv'],
        }),
        installment({
          externalId: 'reneg',
          status: 'RENEGOTIATED',
          total: '777',
          competenceDate: from,
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
          competenceDate: from,
          categoryExternalIds: ['serv'],
        }),
      ],
    );
    await createUser({ email: 'user-a@mr.test', role: 'USER', tenantId: a.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-a@mr.test');
    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-store');
    const body = ok.json();
    expect(body.receivables.total).toBe('30000');
    expect(body.receivables.received).toBe('14000');
    expect(body.receivables.outstanding).toBe('16000');
    expect(typeof body.receivables.items[0].amount).toBe('string');
    expect(typeof body.receivables.items[0].received).toBe('string');
    const json = JSON.stringify(body);
    expect(json).not.toContain('333');
    expect(json).not.toContain('999');
    expect(json).not.toContain('888');
    expect(json).not.toContain('777');
    expect(json).not.toContain('descricao-secreta-nao-vazar');
    expect(json).not.toContain('tenantId');
    expect(json).not.toMatch(/faturamento/i);

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?tenantId=${b.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
  });

  it('month=2026-08 filtra competência; inválido retorna 400', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from } = civilMonthBounds(today);
    const monthKey = `${from.getUTCFullYear()}-${String(from.getUTCMonth() + 1).padStart(2, '0')}`;
    const previousMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - 1, 15));
    const nextMonth = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 15));
    const seeded = await seedConnected('mr-month');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({
          externalId: 'curr',
          status: 'PAID',
          total: '100',
          paid: '100',
          unpaid: '0',
          competenceDate: from,
        }),
        installment({
          externalId: 'prev',
          status: 'PAID',
          total: '50',
          paid: '50',
          unpaid: '0',
          competenceDate: previousMonth,
        }),
        installment({
          externalId: 'future',
          status: 'OPEN',
          total: '70',
          competenceDate: nextMonth,
        }),
      ],
    );
    await createUser({ email: 'user-month@mr.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-month@mr.test');

    const current = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue',
      headers: { cookie },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().monthKey).toBe(monthKey);
    expect(current.json().receivables.total).toBe('100');

    const explicit = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?month=${monthKey}`,
      headers: { cookie },
    });
    expect(explicit.statusCode).toBe(200);
    expect(explicit.json().receivables.total).toBe('100');

    const prevKey = `${previousMonth.getUTCFullYear()}-${String(previousMonth.getUTCMonth() + 1).padStart(2, '0')}`;
    const past = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?month=${prevKey}`,
      headers: { cookie },
    });
    expect(past.statusCode).toBe(200);
    expect(past.json().receivables.total).toBe('50');

    const futureKey = `${nextMonth.getUTCFullYear()}-${String(nextMonth.getUTCMonth() + 1).padStart(2, '0')}`;
    const future = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?month=${futureKey}`,
      headers: { cookie },
    });
    expect(future.statusCode).toBe(200);
    expect(future.json().receivables.total).toBe('70');

    const invalid = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue?month=2026-13',
      headers: { cookie },
    });
    expect(invalid.statusCode).toBe(400);

    const both = await app.inject({
      method: 'GET',
      url: `/dashboard/monthly-revenue?month=${monthKey}&tenantId=x`,
      headers: { cookie },
    });
    expect(both.statusCode).toBe(400);
  });

  it('SUPER_ADMIN em Support Mode lê o tenant operacional', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from } = civilMonthBounds(today);
    const seeded = await seedConnected('mr-support');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({
          externalId: 'ar-sup',
          status: 'PAID',
          total: '12.5',
          paid: '12.5',
          unpaid: '0',
          competenceDate: from,
        }),
      ],
    );
    await createUser({ email: 'super@mr.test', role: 'SUPER_ADMIN' });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'super@mr.test');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie, 'user-agent': 'monthly-revenue-support' },
      payload: { tenantId: seeded.tenant.id },
    });
    expect(enter.statusCode).toBe(200);
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/monthly-revenue',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().receivables.total).toBe('12.5');
    expect(response.json().receivables.received).toBe('12.5');
  });
});
