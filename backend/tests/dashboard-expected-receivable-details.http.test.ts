import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { civilMonthBounds, civilMonthKey } from '../src/modules/analytics/domain/civil-calendar.js';
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
  readonly dueDate: Date;
  readonly unpaid?: string;
  readonly paid?: string;
  readonly total?: string;
  readonly status?: FinancialInstallmentStatus;
  readonly categoryExternalIds?: readonly string[];
  readonly externalPartyId?: string | null;
  readonly description?: string;
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '0');
  const paid = new Prisma.Decimal(input.paid ?? '0');
  const total = new Prisma.Decimal(input.total ?? unpaid.plus(paid).toString());
  return {
    externalId: input.externalId,
    description: input.description ?? 'Consulta',
    dueDate: input.dueDate,
    competenceDate: input.dueDate,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status ?? 'OPEN',
    upstreamStatus: input.status ?? 'OPEN',
    total,
    paid,
    unpaid,
    externalPartyId: input.externalPartyId ?? null,
    categoryExternalIds: [...(input.categoryExternalIds ?? [])],
  };
}

describe('GET /dashboard/receivables/expected-details', () => {
  it('rejeita sem sessão e tenantId na query', async () => {
    const app = await buildTestApp();
    const unauth = await app.inject({
      method: 'GET',
      url: '/dashboard/receivables/expected-details',
    });
    expect(unauth.statusCode).toBe(401);

    const seeded = await seedConnected('erd-auth');
    await createUser({ email: 'user-erd@mcf.test', role: 'USER', tenantId: seeded.tenant.id });
    const cookie = await loginAs(app, 'user-erd@mcf.test');
    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/receivables/expected-details?tenantId=${seeded.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
  });

  it('serializa itens, party e reconcilia com monthly-cash-flow', async () => {
    const today = civilTodayInSaoPaulo(new Date());
    const { to } = civilMonthBounds(today);
    const monthKey = civilMonthKey(today);
    const seeded = await seedConnected('erd-main');
    const other = await seedConnected('erd-other');
    const scope = {
      tenantId: seeded.tenant.id,
      integrationId: seeded.integration.id,
      syncedAt: new Date(),
    };
    const scopeOther = {
      tenantId: other.tenant.id,
      integrationId: other.integration.id,
      syncedAt: new Date(),
    };

    await financial.upsertParties(scope, [
      {
        externalId: 'cliente-1',
        name: 'Maria Silva',
        document: null,
        active: true,
        profiles: ['CUSTOMER'],
      },
    ]);
    await financial.upsertCategories(scope, [
      {
        externalId: 'cat-consulta',
        name: 'Consultas',
        type: 'REVENUE',
        parentExternalId: null,
      },
    ]);
    await financial.upsertReceivables(scope, [
      installment({
        externalId: 'open-1',
        dueDate: to,
        unpaid: '978',
        externalPartyId: 'cliente-1',
        categoryExternalIds: ['cat-consulta'],
        description: 'Consulta agosto',
      }),
    ]);
    await financial.upsertReceivables(scopeOther, [
      installment({ externalId: 'secret', dueDate: to, unpaid: '99999' }),
    ]);

    await createUser({ email: 'user-erd-main@mcf.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-erd-main@mcf.test');

    const cash = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/monthly-cash-flow?month=${monthKey}`,
        headers: { cookie },
      })
    ).json();
    const details = (
      await app.inject({
        method: 'GET',
        url: `/dashboard/receivables/expected-details?month=${monthKey}`,
        headers: { cookie },
      })
    ).json();

    expect(details.available).toBe(true);
    expect(details.total).toBe(cash.expected.receivables);
    expect(details.items).toHaveLength(1);
    expect(details.items[0].customerName).toBe('Maria Silva');
    expect(details.items[0].description).toBe('Consulta agosto');
    expect(details.items[0].categoryNames).toEqual(['Consultas']);
    expect(details.items[0].amount).toBe('978');

    const response = await app.inject({
      method: 'GET',
      url: `/dashboard/receivables/expected-details?month=${monthKey}`,
      headers: { cookie },
    });
    expect(response.headers['cache-control']).toBe('private, no-store');

    const sum = details.items.reduce(
      (acc: number, item: { amount: string }) => acc + Number(item.amount),
      0,
    );
    expect(String(sum)).toBe(details.total);
    expect(details.items.some((item: { externalId: string }) => item.externalId === 'secret')).toBe(
      false,
    );
  });
});
