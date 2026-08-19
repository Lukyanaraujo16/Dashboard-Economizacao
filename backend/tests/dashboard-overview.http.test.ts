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
  readonly dueDate: string;
  readonly unpaid?: string;
}) {
  const unpaid = new Prisma.Decimal(input.unpaid ?? '10');
  const paid = new Prisma.Decimal(0);
  const total = unpaid;
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

async function seedOverdue(tenantId: string, integrationId: string, unpaid: string) {
  await financial.upsertReceivables({ tenantId, integrationId, syncedAt: new Date() }, [
    installment({ externalId: 'same', status: 'OPEN', dueDate: '2020-01-01', unpaid }),
  ]);
}

function expectSafeOverview(body: Record<string, unknown>) {
  expect(Object.keys(body).sort()).toEqual([
    'delinquency',
    'integration',
    'payables',
    'receivables',
    'today',
  ]);
  const integration = body.integration as Record<string, unknown>;
  expect(Object.keys(integration).sort()).toEqual([
    'lastErrorCode',
    'lastSuccessfulSyncAt',
    'status',
  ]);
  const json = JSON.stringify(body);
  expect(json).not.toMatch(/access-token|refresh-token|Bearer|ciphertext|Authorization/i);
  expect(json).not.toMatch(/externalAccountId|externalCompanyName|connectedAt|disconnectedAt/);
  expect(json).not.toMatch(/cpf|cnpj|documento|telefone|party/i);
  expect(json).not.toContain('access-token-secret');
  expect(json).not.toContain('refresh-token-secret');
}

function expectMoneyStrings(snapshot: { open: unknown; overdue: unknown; upcoming: unknown }) {
  expect(typeof snapshot.open).toBe('string');
  expect(typeof snapshot.overdue).toBe('string');
  expect(typeof snapshot.upcoming).toBe('string');
}

describe('GET /dashboard/overview (fase 10A)', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/dashboard/overview' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('USER lê apenas o próprio tenant e rejeita tenantId na query', async () => {
    const a = await seedConnected('ov-a');
    const b = await seedConnected('ov-b');
    await seedOverdue(a.tenant.id, a.integration.id, '8');
    await seedOverdue(b.tenant.id, b.integration.id, '333');
    await createUser({ email: 'user-a@ov.test', role: 'USER', tenantId: a.tenant.id });
    await createUser({ email: 'user-b@ov.test', role: 'USER', tenantId: b.tenant.id });

    const app = await buildTestApp();
    const cookieA = await loginAs(app, 'user-a@ov.test');

    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie: cookieA },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.headers['cache-control']).toBe('private, no-store');
    expect(ok.headers['cache-control']).not.toMatch(/public/i);
    const body = ok.json();
    expectSafeOverview(body);
    expect(body.today).toBe(civilTodayInSaoPaulo(new Date()).toISOString().slice(0, 10));
    expect(body.receivables.overdue).toBe('8');
    expect(body.receivables.overdue).not.toBe('333');
    expectMoneyStrings(body.receivables);
    expectMoneyStrings(body.payables);
    expect(typeof body.delinquency.overdueUnpaid).toBe('string');
    expect(typeof body.delinquency.openUnpaid).toBe('string');
    expect(body.delinquency.rate === null || typeof body.delinquency.rate === 'string').toBe(true);
    expect(typeof body.delinquency.rate).not.toBe('number');

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/overview?tenantId=${b.tenant.id}`,
      headers: { cookie: cookieA },
    });
    expect(hijack.statusCode).toBe(400);
    expect(JSON.stringify(hijack.json())).not.toContain('333');

    const extras = await app.inject({
      method: 'GET',
      url: '/dashboard/overview?externalId=same&foo=bar',
      headers: { cookie: cookieA },
    });
    expect(extras.statusCode).toBe(200);
    expect(extras.json().receivables.overdue).toBe('8');
  });

  it('USER com tenant DISABLED perde contexto autenticado', async () => {
    const tenant = await tenants.create({ name: 'ov-disabled', displayName: 'Disabled' });
    await createUser({ email: 'user-disabled@ov.test', role: 'USER', tenantId: tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-disabled@ov.test');
    await tenants.disable(tenant.id);

    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('ADMIN e SUPER_ADMIN sem Support Mode recebem 403', async () => {
    const app = await buildTestApp();
    await createUser({ email: 'admin@ov.test', role: 'ADMIN' });
    await createUser({ email: 'super@ov.test', role: 'SUPER_ADMIN' });
    const adminCookie = await loginAs(app, 'admin@ov.test');
    const superCookie = await loginAs(app, 'super@ov.test');

    const admin = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie: adminCookie },
    });
    expect(admin.statusCode).toBe(403);
    expect(admin.json().error.code).toBe('FORBIDDEN');

    const superAdmin = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie: superCookie },
    });
    expect(superAdmin.statusCode).toBe(403);
    expect(superAdmin.json().error.code).toBe('FORBIDDEN');
  });

  it('Support Mode consulta só o tenant suportado', async () => {
    const a = await seedConnected('ov-sup-a');
    const b = await seedConnected('ov-sup-b');
    await seedOverdue(a.tenant.id, a.integration.id, '8');
    await seedOverdue(b.tenant.id, b.integration.id, '333');
    await createUser({ email: 'super-sup@ov.test', role: 'SUPER_ADMIN' });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'super-sup@ov.test');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie, 'user-agent': 'overview-support' },
      payload: { tenantId: a.tenant.id },
    });
    expect(enter.statusCode).toBe(200);

    const ok = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie },
    });
    expect(ok.statusCode).toBe(200);
    expect(ok.json().receivables.overdue).toBe('8');
    expect(ok.json().receivables.overdue).not.toBe('333');

    const hijack = await app.inject({
      method: 'GET',
      url: `/dashboard/overview?tenantId=${b.tenant.id}`,
      headers: { cookie },
    });
    expect(hijack.statusCode).toBe(400);
    expect(JSON.stringify(hijack.json())).not.toContain('333');
  });

  it('zero títulos retorna zeros e rate null', async () => {
    const seeded = await seedConnected('ov-zero');
    await prisma.integration.update({
      where: { id: seeded.integration.id },
      data: { lastSuccessfulSyncAt: new Date('2026-08-01T12:00:00.000Z') },
    });
    await createUser({ email: 'user-zero@ov.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-zero@ov.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.receivables).toEqual({ open: '0', overdue: '0', upcoming: '0' });
    expect(body.payables).toEqual({ open: '0', overdue: '0', upcoming: '0' });
    expect(body.delinquency.rate).toBeNull();
    expect(body.integration.lastSuccessfulSyncAt).toBe('2026-08-01T12:00:00.000Z');
  });

  it('CONNECTED nunca sincronizada retorna lastSuccessfulSyncAt null', async () => {
    const seeded = await seedConnected('ov-never');
    await createUser({ email: 'user-never@ov.test', role: 'USER', tenantId: seeded.tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-never@ov.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.integration.status).toBe('CONNECTED');
    expect(body.integration.lastSuccessfulSyncAt).toBeNull();
    expect(body.receivables.open).toBe('0');
  });

  it('sem Integration trata como DISCONNECTED', async () => {
    const tenant = await tenants.create({ name: 'ov-none', displayName: 'Sem integração' });
    await createUser({ email: 'user-none@ov.test', role: 'USER', tenantId: tenant.id });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-none@ov.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().integration).toEqual({
      status: 'DISCONNECTED',
      lastSuccessfulSyncAt: null,
      lastErrorCode: null,
    });
  });

  it('DISCONNECTED com dados persiste KPIs e freshness', async () => {
    const seeded = await seedConnected('ov-disc');
    await seedOverdue(seeded.tenant.id, seeded.integration.id, '8');
    const syncedAt = new Date('2026-08-10T09:00:00.000Z');
    await prisma.integration.update({
      where: { id: seeded.integration.id },
      data: { lastSuccessfulSyncAt: syncedAt },
    });
    await integrations.disconnect(seeded.tenant.id, new Date());
    await createUser({ email: 'user-disc@ov.test', role: 'USER', tenantId: seeded.tenant.id });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-disc@ov.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.receivables.overdue).toBe('8');
    expect(body.integration.status).toBe('DISCONNECTED');
    expect(body.integration.lastSuccessfulSyncAt).toBe(syncedAt.toISOString());
  });

  it('ERROR com dados persiste KPIs e lastErrorCode sanitizado', async () => {
    const seeded = await seedConnected('ov-err');
    await seedOverdue(seeded.tenant.id, seeded.integration.id, '8');
    await integrations.markError(seeded.tenant.id, 'refresh_failed', new Date());
    await createUser({ email: 'user-err@ov.test', role: 'USER', tenantId: seeded.tenant.id });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-err@ov.test');
    const response = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.receivables.overdue).toBe('8');
    expect(body.integration.status).toBe('ERROR');
    expect(body.integration.lastErrorCode).toBe('refresh_failed');
    expectSafeOverview(body);
  });
});
