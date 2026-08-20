import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentStatus } from '../src/generated/prisma/client.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
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
  readonly unpaid?: string;
  readonly categoryExternalIds?: readonly string[];
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '10');
  return {
    externalId: input.externalId,
    description: 'descricao-secreta-nao-vazar',
    dueDate: civilTodayInSaoPaulo(new Date()),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status,
    upstreamStatus: input.status,
    total: unpaid,
    paid: new Prisma.Decimal(0),
    unpaid,
    externalPartyId: null,
    categoryExternalIds: [...(input.categoryExternalIds ?? [])],
  };
}

function expectNoPii(body: unknown) {
  const json = JSON.stringify(body);
  expect(json).not.toMatch(/access-token|refresh-token|Bearer|ciphertext/i);
  expect(json).not.toMatch(/externalAccountId|cpf|cnpj|documento|telefone|party/i);
  expect(json).not.toContain('descricao-secreta-nao-vazar');
  expect(json).not.toContain('tenantId');
  expect(json).not.toContain('categoryId');
  expect(json).not.toContain('secret-tenant');
}

describe('GET /dashboard/expense-composition (E2)', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard/expense-composition' });
    expect(response.statusCode).toBe(401);
  });

  it('ADMIN sem Support Mode recebe 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@e2.test', role: 'ADMIN' });
    const cookie = await loginAs(app, 'admin@e2.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/expense-composition',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('USER lê só o próprio tenant, recusa tenantId e não vaza PII', async () => {
    const a = await seedConnected('e2-a');
    const b = await seedConnected('e2-b');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: a.tenant.id, integrationId: a.integration.id, syncedAt },
      [
        {
          externalId: 'aluguel',
          name: 'Aluguel',
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
          externalId: 'aluguel',
          name: 'Segredo B',
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
          externalId: 'ap-a',
          status: 'OPEN',
          unpaid: '80',
          categoryExternalIds: ['aluguel'],
        }),
        installment({ externalId: 'ap-a-empty', status: 'OPEN', unpaid: '20' }),
        installment({
          externalId: 'ap-a-paid',
          status: 'PAID',
          unpaid: '999',
          categoryExternalIds: ['aluguel'],
        }),
      ],
    );
    await financial.upsertPayables(
      { tenantId: b.tenant.id, integrationId: b.integration.id, syncedAt },
      [
        installment({
          externalId: 'ap-b',
          status: 'OPEN',
          unpaid: '333',
          categoryExternalIds: ['aluguel'],
        }),
      ],
    );
    await createUser({ email: 'user-a@e2.test', role: 'USER', tenantId: a.tenant.id });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-a@e2.test');
    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/expense-composition',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-store');
    const body = ok.json();
    expect(Object.keys(body).sort()).toEqual(['payables', 'today']);
    expect(Object.keys(body.payables).sort()).toEqual([
      'classified',
      'coverageRate',
      'imprecise',
      'items',
      'total',
      'uncategorized',
    ]);
    expect(body.payables.total).toBe('100');
    expect(body.payables.classified).toBe('80');
    expect(body.payables.uncategorized).toBe('20');
    expect(body.payables.imprecise).toBe('0');
    expect(body.payables.coverageRate).toBe('80');
    expect(typeof body.payables.items[0].amount).toBe('string');
    expect(typeof body.payables.items[0].percentage).toBe('string');
    expect(body.payables.items[0]).toEqual({
      kind: 'category',
      name: 'Aluguel',
      amount: '80',
      percentage: '80',
    });
    expectNoPii(body);
    expect(JSON.stringify(body)).not.toContain('333');
    expect(JSON.stringify(body)).not.toContain('Segredo B');

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/expense-composition?tenantId=${b.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
    expect(JSON.stringify(hijack.json())).not.toContain('333');
  });

  it('DISCONNECTED com dados persiste a composição', async () => {
    const seeded = await seedConnected('e2-disc');
    const syncedAt = new Date();
    await financial.upsertCategories(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        {
          externalId: 'imp',
          name: 'Impostos',
          type: 'EXPENSE',
          parentExternalId: null,
          upstreamVersion: 1,
        },
      ],
    );
    await financial.upsertPayables(
      { tenantId: seeded.tenant.id, integrationId: seeded.integration.id, syncedAt },
      [
        installment({
          externalId: 'ap-disc',
          status: 'PARTIALLY_PAID',
          unpaid: '4.25',
          categoryExternalIds: ['imp'],
        }),
      ],
    );
    await integrations.disconnect(seeded.tenant.id, new Date());
    await createUser({ email: 'user-disc@e2.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-disc@e2.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/expense-composition',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().payables.total).toBe('4.25');
    expect(response.json().payables.items[0].name).toBe('Impostos');
  });
});
