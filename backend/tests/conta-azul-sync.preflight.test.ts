import { spawn, type ChildProcess } from 'node:child_process';
import { resolve } from 'node:path';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { createBullmqRedisOptions } from '../src/infrastructure/jobs/bullmq-connection.js';
import { createContaAzulManualSyncPublisher } from '../src/infrastructure/jobs/conta-azul-manual-sync.queue.js';
import { createContaAzulManualSyncWorker } from '../src/infrastructure/jobs/conta-azul-manual-sync.worker.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { createContaAzulFinancialRepository } from '../src/modules/integrations/conta-azul/repositories/financial.repository.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulSyncRunRepository } from '../src/modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { createContaAzulRateLimiter } from '../src/modules/integrations/conta-azul/services/conta-azul-rate-limiter.js';
import { createContaAzulManualSyncEngine } from '../src/modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import { createMockContaAzulApiClient } from './helpers/conta-azul-mock-api.js';
import {
  createContaAzulTestQueue,
  drainContaAzulTestQueue,
} from './helpers/conta-azul-test-queue.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';
const FORBIDDEN_PAYLOAD =
  /accessToken|refreshToken|clientSecret|encryptionKey|Bearer |Authorization/i;

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const users = createUserRepository(prisma);
const credentials = createUserCredentialRepository(prisma);
const passwordHasher = createArgon2idPasswordHasher();
const integrations = createContaAzulIntegrationRepository(prisma);
const syncRuns = createContaAzulSyncRunRepository(prisma);
const financial = createContaAzulFinancialRepository(prisma);

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

async function createAdmin(email: string) {
  const user = await users.create({
    name: 'Admin sync',
    email,
    role: 'ADMIN',
    tenantId: null,
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

async function waitForRun(
  id: string,
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED',
  timeoutMs = 15_000,
) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const run = await prisma.syncRun.findUnique({ where: { id } });
    if (run?.status === status) {
      return run;
    }
    await new Promise((resolve) => {
      setTimeout(resolve, 50);
    });
  }
  const current = await prisma.syncRun.findUnique({ where: { id } });
  throw new Error(`Timeout esperando ${status}; atual=${current?.status ?? 'ausente'}`);
}

function startInProcessWorker() {
  return createContaAzulManualSyncWorker({
    connection: createBullmqRedisOptions(TEST_REDIS_URL),
    nodeEnv: 'test',
    engine: createContaAzulManualSyncEngine({
      tenants,
      integrations,
      syncRuns,
      financial,
      apiClient: createMockContaAzulApiClient(),
      getValidAccessToken: async () => 'mock-access',
      rateLimiter: createContaAzulRateLimiter(0, async () => undefined),
    }),
    syncRuns,
  });
}

function killMockWorker(child: ChildProcess): void {
  if (!child.pid) {
    return;
  }
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch {
    child.kill('SIGKILL');
  }
}

async function spawnMockWorker(hangMs: number): Promise<ChildProcess> {
  const helper = resolve(process.cwd(), 'tests/helpers/run-mock-conta-azul-worker.ts');
  const child = spawn(resolve(process.cwd(), 'node_modules/.bin/tsx'), [helper], {
    env: {
      ...process.env,
      NODE_ENV: 'test',
      MOCK_SYNC_HANG_MS: String(hangMs),
      MOCK_LOCK_DURATION_MS: '2000',
      MOCK_STALLED_INTERVAL_MS: '1000',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: true,
  });
  await new Promise<void>((resolveReady, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Timeout aguardando MOCK_WORKER_READY'));
    }, 10_000);
    child.stdout?.on('data', (chunk: Buffer) => {
      if (String(chunk).includes('MOCK_WORKER_READY')) {
        clearTimeout(timer);
        resolveReady();
      }
    });
    child.once('error', (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once('exit', (code) => {
      clearTimeout(timer);
      reject(new Error(`Mock worker encerrou antes de ficar pronto (${code}).`));
    });
  });
  child.removeAllListeners('exit');
  return child;
}

describe('Preflight E2E mock da sync manual Conta Azul', () => {
  it('POST 202 permanece PENDING sem worker e o worker mock completa SUCCESS', async () => {
    await createAdmin('preflight.e2e@test.local');
    const { tenant, integration } = await seedConnected('preflight-e2e');
    const app = await buildTestApp();
    const cookie = await login(app, 'preflight.e2e@test.local');
    const posted = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync`,
      headers: { cookie },
    });
    expect(posted.statusCode).toBe(202);
    expect(posted.json()).toEqual({
      syncRunId: expect.any(String),
      status: 'PENDING',
    });
    const syncRunId = posted.json().syncRunId as string;

    const current = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/sync/current`,
      headers: { cookie },
    });
    expect(current.json().run.status).toBe('PENDING');
    expect(JSON.stringify(current.json())).not.toMatch(FORBIDDEN_PAYLOAD);

    const queue = createContaAzulTestQueue();
    const job = await queue.getJob(syncRunId);
    expect(job?.name).toBe('conta-azul-manual-sync');
    expect(job?.data).toEqual({
      syncRunId,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    expect(JSON.stringify(job?.data)).not.toMatch(FORBIDDEN_PAYLOAD);
    expect(await queue.getDelayedCount()).toBe(0);
    const counts = await queue.getJobCounts('wait', 'active', 'delayed', 'paused');
    expect(counts.wait + counts.delayed).toBe(1);
    expect(counts.active).toBe(0);
    await queue.close();

    const beforeWorker = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(beforeWorker.lastSuccessfulSyncAt).toBeNull();

    const worker = startInProcessWorker();
    try {
      await worker.waitUntilReady();
      await waitForRun(syncRunId, 'SUCCESS');
    } finally {
      await worker.close();
    }

    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: syncRunId } });
    expect(success.status).toBe('SUCCESS');
    expect(success.errorCode).toBeNull();
    expect(success.counts).toMatchObject({
      categories: 1,
      financialAccounts: 1,
      parties: 1,
    });
    expect(JSON.stringify(success)).not.toMatch(FORBIDDEN_PAYLOAD);
    const after = await prisma.integration.findUniqueOrThrow({ where: { id: integration.id } });
    expect(after.lastSuccessfulSyncAt).toBeTruthy();
    expect(after.status).toBe('CONNECTED');
    expect(await prisma.financialCategory.count()).toBe(1);
    expect(await prisma.party.count()).toBe(1);
  }, 20_000);

  it('BullMQ permanece mínimo: uma fila, um job, sem scheduler', async () => {
    const queue = createContaAzulTestQueue();
    try {
      expect(queue.name).toBe('conta-azul-manual-sync');
      expect(await queue.getDelayedCount()).toBe(0);
      const publisher = createContaAzulManualSyncPublisher({
        connection: createBullmqRedisOptions(TEST_REDIS_URL),
        nodeEnv: 'test',
      });
      await publisher.enqueue({
        syncRunId: '00000000-0000-4000-8000-000000000001',
        tenantId: '00000000-0000-4000-8000-000000000002',
        integrationId: '00000000-0000-4000-8000-000000000003',
      });
      const job = await queue.getJob('00000000-0000-4000-8000-000000000001');
      expect(Object.keys(job?.data ?? {})).toEqual(['syncRunId', 'tenantId', 'integrationId']);
      await publisher.close();
    } finally {
      await queue.close();
    }
  });

  it('SIGKILL no worker mock recupera via stall e termina SUCCESS sem duplicar', async () => {
    const { tenant, integration } = await seedConnected('preflight-stall');
    const run = await syncRuns.createPending({
      tenantId: tenant.id,
      integrationId: integration.id,
      startedAt: new Date(),
    });
    const publisher = createContaAzulManualSyncPublisher({
      connection: createBullmqRedisOptions(TEST_REDIS_URL),
      nodeEnv: 'test',
    });
    await publisher.enqueue({
      syncRunId: run.id,
      tenantId: tenant.id,
      integrationId: integration.id,
    });
    await publisher.close();

    const hanging = await spawnMockWorker(120_000);
    try {
      await waitForRun(run.id, 'RUNNING', 10_000);
      killMockWorker(hanging);
      await new Promise((resolve) => {
        setTimeout(resolve, 5_000);
      });
      const stillRunning = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
      expect(stillRunning.status).toBe('RUNNING');
      expect(stillRunning.errorCode).toBeNull();

      const recovered = await spawnMockWorker(0);
      try {
        await waitForRun(run.id, 'SUCCESS', 20_000);
      } finally {
        killMockWorker(recovered);
        await new Promise((resolve) => {
          setTimeout(resolve, 300);
        });
      }
    } finally {
      killMockWorker(hanging);
    }

    const success = await prisma.syncRun.findUniqueOrThrow({ where: { id: run.id } });
    expect(success.status).toBe('SUCCESS');
    expect(await prisma.financialCategory.count()).toBe(1);
    const integrationAfter = await prisma.integration.findUniqueOrThrow({
      where: { id: integration.id },
    });
    expect(integrationAfter.lastSuccessfulSyncAt).toBeTruthy();
  }, 40_000);
});
