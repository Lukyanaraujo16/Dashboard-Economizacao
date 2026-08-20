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
  readonly competenceDate: Date | null;
  readonly categoryExternalIds?: readonly string[];
}) {
  const total = new Prisma.Decimal(input.total);
  return {
    externalId: input.externalId,
    description: 'descricao-secreta-nao-vazar',
    dueDate: input.competenceDate ?? civilTodayInSaoPaulo(new Date()),
    competenceDate: input.competenceDate,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status,
    upstreamStatus: input.status,
    total,
    paid: new Prisma.Decimal(0),
    unpaid: total,
    externalPartyId: null,
    categoryExternalIds: [...(input.categoryExternalIds ?? [])],
  };
}

function expectNoPii(body: unknown) {
  const json = JSON.stringify(body);
  expect(json).not.toMatch(/access-token|refresh-token|Bearer|ciphertext/i);
  expect(json).not.toContain('descricao-secreta-nao-vazar');
  expect(json).not.toContain('tenantId');
}

describe('GET /dashboard/executive-insights (mensal)', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard/executive-insights' });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@e3.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@e3.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/executive-insights',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('USER lê insights mensais do tenant, recusa tenantId e omite PII', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { from, monthKey } = civilMonthBounds(today);
    const a = await seedConnected('e3-a');
    const b = await seedConnected('e3-b');
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
          externalId: 'sal',
          name: 'Salário Colaboradores',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertReceivables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'ar-1',
          status: 'OPEN',
          total: '100',
          competenceDate: from,
          categoryExternalIds: ['serv'],
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        installment({
          externalId: 'ap-1',
          status: 'OPEN',
          total: '150',
          competenceDate: from,
          categoryExternalIds: ['sal'],
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        installment({
          externalId: 'ap-b',
          status: 'OPEN',
          total: '999',
          competenceDate: from,
        }),
      ],
    );
    await createUser({ email: 'user-a@e3.test', role: 'USER', tenantId: a.tenant.id });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-a@e3.test');
    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/executive-insights',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-store');
    const body = ok.json();
    expect(body.monthKey).toBe(monthKey);
    expect(Array.isArray(body.insights)).toBe(true);
    expect(body.insights.length).toBeGreaterThan(0);
    expect(body.insights.some((item: { id: string }) => item.id === 'revenue-expense-total')).toBe(
      true,
    );
    expect(body.insights.some((item: { body: string }) => item.body.includes('Serviços'))).toBe(
      true,
    );
    expectNoPii(body);
    expect(JSON.stringify(body)).not.toContain('999');

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/executive-insights?tenantId=${b.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
  });

  it('mês vazio retorna insights vazios', async () => {
    const seeded = await seedConnected('e3-empty');
    await createUser({ email: 'user-empty@e3.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-empty@e3.test');
    const body = (
      await app.inject({
        method: 'GET',
        url: '/dashboard/executive-insights',
        headers: { cookie },
      })
    ).json();
    expect(body.insights).toEqual([]);
  });
});
