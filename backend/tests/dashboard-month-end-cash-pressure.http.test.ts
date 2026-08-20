import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { addCivilDays, civilMonthBounds } from '../src/modules/analytics/domain/civil-calendar.js';
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
import { serializeCivilDate } from '../src/modules/dashboard/http/to-dashboard-overview-response.js';

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
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '10');
  return {
    externalId: input.externalId,
    description: 'descricao-secreta-nao-vazar',
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
    categoryExternalIds: [] as string[],
  };
}

function expectNoPii(body: unknown) {
  const json = JSON.stringify(body);
  expect(json).not.toMatch(/access-token|refresh-token|Bearer|ciphertext/i);
  expect(json).not.toContain('descricao-secreta-nao-vazar');
  expect(json).not.toContain('tenantId');
}

describe('GET /dashboard/month-end-cash-pressure', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard/month-end-cash-pressure' });
    expect(response.statusCode).toBe(401);
  });

  it('agrega dueDate de hoje até fim do mês civil, exclui vencidos e outro tenant', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { to, monthKey } = civilMonthBounds(today);
    const a = await seedConnected('me-a');
    const b = await seedConnected('me-b');
    const syncedAt = new Date();
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'ar-in',
          status: 'OPEN',
          dueDate: addCivilDays(today, 5),
          unpaid: '10.50',
        }),
        installment({
          externalId: 'ar-past',
          status: 'OPEN',
          dueDate: addCivilDays(today, -3),
          unpaid: '900',
        }),
        installment({
          externalId: 'ar-next-month',
          status: 'OPEN',
          dueDate: addCivilDays(to, 5),
          unpaid: '700',
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'ap-in',
          status: 'OPEN',
          dueDate: addCivilDays(today, 2),
          unpaid: '40.75',
        }),
        installment({
          externalId: 'ap-paid',
          status: 'PAID',
          dueDate: addCivilDays(today, 1),
          unpaid: '999',
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        installment({
          externalId: 'ap-b',
          status: 'OPEN',
          dueDate: addCivilDays(today, 2),
          unpaid: '333',
        }),
      ],
    );
    await createUser({ email: 'user-me@me.test', role: 'USER', tenantId: a.tenant.id });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-me@me.test');
    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/month-end-cash-pressure',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-store');
    const body = ok.json();
    expect(body.monthKey).toBe(monthKey);
    expect(body.from).toBe(serializeCivilDate(today));
    expect(body.to).toBe(serializeCivilDate(to));
    expect(body.summary.receivable).toBe('10.5');
    expect(body.summary.payable).toBe('40.75');
    expect(body.summary.net).toBe('-30.25');
    expectNoPii(body);
    expect(JSON.stringify(body)).not.toContain('333');
    expect(JSON.stringify(body)).not.toContain('900');
    expect(JSON.stringify(body)).not.toContain('700');

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/month-end-cash-pressure?tenantId=${b.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
  });
});
