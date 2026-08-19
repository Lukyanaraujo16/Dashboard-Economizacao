import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Queue } from 'bullmq';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import {
  createBullmqRedisOptions,
  bullmqPrefix,
} from '../src/infrastructure/jobs/bullmq-connection.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import {
  CONTA_AZUL_MANUAL_SYNC_JOB_NAME,
  CONTA_AZUL_SYNC_JOB_TIMEOUT_MS,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulSyncRunRepository } from '../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { drainContaAzulTestQueue } from './helpers/conta-azul-test-queue.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const users = createUserRepository(prisma);
const credentials = createUserCredentialRepository(prisma);
const passwordHasher = createArgon2idPasswordHasher();
const integrations = createContaAzulIntegrationRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await Promise.all(
    [...apps].map(async (app) => {
      const sessionKeys = await app.redis.keys(`${buildSessionKeyPrefix('test')}*`);
      if (sessionKeys.length > 0) {
        await app.redis.del(...sessionKeys);
      }
      await app.close();
    }),
  );
  apps.clear();
  await drainContaAzulTestQueue();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

function readCookie(header: string | string[] | undefined): string {
  const values = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = values.find((value) => value.startsWith('dashboard.sid='));
  if (!cookie) {
    throw new Error('Cookie de sessão ausente.');
  }
  return cookie.split(';')[0]!;
}

async function createActiveUser(email: string, role: 'USER' | 'ADMIN' | 'SUPER_ADMIN') {
  let tenantId: string | null = null;
  if (role === 'USER') {
    tenantId = (await tenants.create({ name: `tenant-${email}`, displayName: email })).id;
  }
  const user = await users.create({
    name: `Operador ${role}`,
    email,
    role,
    tenantId,
    status: 'ACTIVE',
  });
  await credentials.create({
    userId: user.id,
    passwordHash: await passwordHasher.hash(VALID_PASSWORD),
  });
  return user;
}

async function buildTestApp() {
  const app = await buildApp();
  apps.add(app);
  return app;
}

async function login(app: Awaited<ReturnType<typeof buildApp>>, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: VALID_PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return readCookie(response.headers['set-cookie']);
}

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

describe('API interna da sync manual Conta Azul', () => {
  it('USER recebe 403', async () => {
    await createActiveUser('sync.user@test.local', 'USER');
    const { tenant } = await seedConnected('sync-http-user');
    const app = await buildTestApp();
    const cookie = await login(app, 'sync.user@test.local');
    const response = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('ADMIN recebe 202, job sem token e current PENDING', async () => {
    await createActiveUser('sync.admin@test.local', 'ADMIN');
    const { tenant } = await seedConnected('sync-http-admin');
    const app = await buildTestApp();
    const cookie = await login(app, 'sync.admin@test.local');
    const response = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json()).toMatchObject({ status: 'PENDING' });
    expect(JSON.stringify(response.json())).not.toMatch(/access|refresh|token/i);

    const current = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync/current`,
      headers: { cookie },
    });
    expect(current.statusCode).toBe(200);
    expect(current.json().run.status).toBe('PENDING');
    expect(current.json().run.id).toBe(response.json().syncRunId);

    const queue = new Queue(CONTA_AZUL_MANUAL_SYNC_JOB_NAME, {
      connection: createBullmqRedisOptions(TEST_REDIS_URL),
      prefix: bullmqPrefix('test'),
    });
    const job = await queue.getJob(response.json().syncRunId as string);
    expect(job?.data).toEqual({
      syncRunId: response.json().syncRunId,
      tenantId: tenant.id,
      integrationId: expect.any(String),
      trigger: 'MANUAL',
    });
    expect(JSON.stringify(job?.data)).not.toMatch(/access|refresh|Bearer/i);
    await job?.remove();
    await queue.close();
  });

  it('segunda sync simultânea retorna 409 SYNC_IN_PROGRESS', async () => {
    await createActiveUser('sync.lock@test.local', 'ADMIN');
    const { tenant } = await seedConnected('sync-http-lock');
    const app = await buildTestApp();
    const cookie = await login(app, 'sync.lock@test.local');
    const first = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(first.statusCode).toBe(202);
    const second = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('SYNC_IN_PROGRESS');
  });

  it('DISCONNECTED e DISABLED bloqueiam o disparo', async () => {
    await createActiveUser('sync.block@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'sync-disconnected', displayName: 'Off' });
    const app = await buildTestApp();
    const cookie = await login(app, 'sync.block@test.local');
    const disconnected = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(disconnected.statusCode).toBe(422);

    const active = await seedConnected('sync-disabled-tenant');
    await tenants.disable(active.tenant.id);
    const disabled = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${active.tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(disabled.statusCode).toBe(422);
  });

  it('disconnect durante sync ativa retorna 409 e preserva credential', async () => {
    await createActiveUser('sync.disc@test.local', 'ADMIN');
    const { tenant, integration } = await seedConnected('sync-http-disc');
    await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: new Date(),
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'sync.disc@test.local');
    const response = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/disconnect`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('SYNC_IN_PROGRESS');
    expect(await prisma.integrationCredential.count()).toBe(1);
  });

  it('disconnect após SUCCESS é permitido', async () => {
    await createActiveUser('sync.disc.ok@test.local', 'ADMIN');
    const { tenant, integration } = await seedConnected('sync-http-disc-ok');
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: new Date(),
    });
    await syncRuns.markSuccess({
      id: run.id,
      integrationId: integration.id,
      counts: {
        categories: 1,
        financialAccounts: 1,
        parties: 1,
        receivables: 1,
        payables: 1,
      },
      at: new Date(),
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'sync.disc.ok@test.local');
    const response = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/disconnect`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('DISCONNECTED');
    expect(await prisma.integrationCredential.count()).toBe(0);
  });

  it('run órfão sem job e timeout vencido libera o lock no POST', async () => {
    await createActiveUser('sync.orphan@test.local', 'ADMIN');
    const { tenant, integration } = await seedConnected('sync-http-orphan');
    const stale = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: new Date(Date.now() - CONTA_AZUL_SYNC_JOB_TIMEOUT_MS - 1_000),
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'sync.orphan@test.local');
    const response = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(202);
    expect(response.json().syncRunId).not.toBe(stale.id);
    const old = await prisma.syncRun.findUniqueOrThrow({ where: { id: stale.id } });
    expect(old.status).toBe('FAILED');
    expect(old.errorCode).toBe('sync_stale_run');
    expect(old.finishedAt).toBeTruthy();
  });

  it('job waiting sem worker não é órfão mesmo após o timeout', async () => {
    await createActiveUser('sync.wait@test.local', 'ADMIN');
    const { tenant } = await seedConnected('sync-http-wait');
    const app = await buildTestApp();
    const cookie = await login(app, 'sync.wait@test.local');
    const first = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(first.statusCode).toBe(202);
    await prisma.syncRun.update({
      where: { id: first.json().syncRunId as string },
      data: { startedAt: new Date(Date.now() - CONTA_AZUL_SYNC_JOB_TIMEOUT_MS - 1_000) },
    });
    const second = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error.code).toBe('SYNC_IN_PROGRESS');
    const pending = await prisma.syncRun.findUniqueOrThrow({
      where: { id: first.json().syncRunId as string },
    });
    expect(pending.status).toBe('PENDING');
  });

  it('RUNNING com heartbeat recente e job presente permanece bloqueado', async () => {
    await createActiveUser('sync.live@test.local', 'ADMIN');
    const { tenant, integration } = await seedConnected('sync-http-live');
    const app = await buildTestApp();
    const cookie = await login(app, 'sync.live@test.local');
    const first = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(first.statusCode).toBe(202);
    await syncRuns.markRunning(first.json().syncRunId as string, new Date());
    const second = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(second.statusCode).toBe(409);
    expect(
      (await prisma.syncRun.findUniqueOrThrow({ where: { id: first.json().syncRunId as string } }))
        .status,
    ).toBe('RUNNING');
    expect(integration.id).toBeTruthy();
  });
});
