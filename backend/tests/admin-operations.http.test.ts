import { randomUUID } from 'node:crypto';

import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import { AUDIT_ACTIONS } from '../src/modules/audit/domain/audit-actions.js';
import { recordAdministrativeAudit } from '../src/modules/audit/repositories/audit-log.repository.js';
import {
  createArgon2idPasswordHasher,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';
const RESET_PASSWORD = 'Segredo#Auditoria99';
const PROMPT_SECRET = 'PROMPT_COMPLETO_SIGILOSO';
const TOKEN_SECRET = 'sk-live-secret-key';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
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
        const keys = await app.redis.keys(`${buildSessionKeyPrefix('test')}*`);
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

function readCookie(header: string | string[] | undefined): string {
  const values = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = values.find((value) => value.startsWith('dashboard.sid='));
  if (!cookie) {
    throw new Error('Cookie de sessão ausente.');
  }
  return cookie.split(';')[0]!;
}

async function buildTestApp() {
  const app = await buildApp();
  apps.add(app);
  return app;
}

async function createActiveUser(
  email: string,
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN',
  tenantId?: string,
) {
  let resolvedTenantId: string | null = tenantId ?? null;
  if (role === 'USER' && !resolvedTenantId) {
    resolvedTenantId = (
      await tenants.create({
        name: `tenant-${email}`,
        displayName: `Tenant ${email}`,
      })
    ).id;
  }
  const user = await users.create({
    name: `Operador ${role}`,
    email,
    role,
    tenantId: resolvedTenantId,
    status: 'ACTIVE',
  });
  await credentials.create({
    userId: user.id,
    passwordHash: await passwordHasher.hash(VALID_PASSWORD),
  });
  return user;
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

const ENDPOINTS = [
  '/admin/operations/sync-runs',
  '/admin/operations/failures',
  '/admin/operations/health',
  '/admin/operations/overview',
  '/admin/operations/ai-runs',
  '/admin/operations/audit-logs',
] as const;

describe('operação administrativa (fase 17)', () => {
  it('ADMIN e SUPER_ADMIN acessam; USER recebe 403', async () => {
    const admin = await createActiveUser('ops.admin@test.local', 'ADMIN');
    const superAdmin = await createActiveUser('ops.super@test.local', 'SUPER_ADMIN');
    const user = await createActiveUser('ops.user@test.local', 'USER');
    const app = await buildTestApp();

    const adminCookie = await login(app, admin.email);
    const superCookie = await login(app, superAdmin.email);
    const userCookie = await login(app, user.email);

    for (const url of ENDPOINTS) {
      const asAdmin = await app.inject({ method: 'GET', url, headers: { cookie: adminCookie } });
      const asSuper = await app.inject({ method: 'GET', url, headers: { cookie: superCookie } });
      const asUser = await app.inject({
        method: 'GET',
        url: `${url}?tenantId=${user.tenantId}`,
        headers: { cookie: userCookie },
      });
      expect(asAdmin.statusCode).toBe(200);
      expect(asSuper.statusCode).toBe(200);
      expect(asUser.statusCode).toBe(403);
    }
  });

  it('modo suporte recebe 403 e não duplica SupportSession', async () => {
    const operator = await createActiveUser('ops.support@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'ops-support-target',
      displayName: 'Empresa em Suporte',
    });
    const app = await buildTestApp();
    const cookie = await login(app, operator.email);

    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    expect(enter.statusCode).toBe(200);

    const denied = await app.inject({
      method: 'GET',
      url: '/admin/operations/audit-logs',
      headers: { cookie },
    });
    expect(denied.statusCode).toBe(403);
    const overviewDenied = await app.inject({
      method: 'GET',
      url: '/admin/operations/overview',
      headers: { cookie },
    });
    expect(overviewDenied.statusCode).toBe(403);

    expect(await prisma.supportSession.count()).toBe(1);
    expect(await prisma.auditLog.count()).toBe(0);
  });

  it('isola tenant, pagina e sanitiza SyncRun, saúde e AiRun', async () => {
    const admin = await createActiveUser('ops.read@test.local', 'ADMIN');
    const tenantA = await tenants.create({ name: 'ops-a', displayName: 'Empresa A' });
    const tenantB = await tenants.create({ name: 'ops-b', displayName: 'Empresa B' });
    await tenants.create({ name: 'ops-c', displayName: 'Empresa C' });

    const integrationA = await prisma.integration.create({
      data: {
        tenantId: tenantA.id,
        provider: 'CONTA_AZUL',
        status: 'ERROR',
        lastSuccessfulSyncAt: new Date('2026-08-01T10:00:00.000Z'),
        lastErrorAt: new Date('2026-08-01T11:00:00.000Z'),
        lastErrorCode: 'refresh_failed',
      },
    });
    const integrationB = await prisma.integration.create({
      data: {
        tenantId: tenantB.id,
        provider: 'CONTA_AZUL',
        status: 'CONNECTED',
        lastSuccessfulSyncAt: new Date('2026-08-02T10:00:00.000Z'),
      },
    });

    const older = await prisma.syncRun.create({
      data: {
        tenantId: tenantA.id,
        integrationId: integrationA.id,
        triggerType: 'SCHEDULED',
        status: 'SUCCESS',
        startedAt: new Date('2026-08-01T12:00:00.000Z'),
        finishedAt: new Date('2026-08-01T12:00:05.000Z'),
        heartbeatAt: new Date('2026-08-01T12:00:04.000Z'),
        counts: {
          categories: 4,
          accessToken: TOKEN_SECRET,
          prompt: PROMPT_SECRET,
        },
      },
    });
    const newer = await prisma.syncRun.create({
      data: {
        tenantId: tenantA.id,
        integrationId: integrationA.id,
        triggerType: 'MANUAL',
        status: 'FAILED',
        startedAt: new Date('2026-08-01T13:00:00.000Z'),
        finishedAt: new Date('2026-08-01T13:00:02.000Z'),
        errorCode: 'sync_timeout',
        counts: { categories: 1 },
      },
    });
    await prisma.syncRun.create({
      data: {
        tenantId: tenantA.id,
        integrationId: integrationA.id,
        triggerType: 'MANUAL',
        status: 'RUNNING',
        startedAt: new Date('2026-08-01T14:00:00.000Z'),
        heartbeatAt: new Date('2026-08-01T14:00:30.000Z'),
        errorCode: 'sk-should-not-leak',
      },
    });
    const foreign = await prisma.syncRun.create({
      data: {
        tenantId: tenantB.id,
        integrationId: integrationB.id,
        triggerType: 'MANUAL',
        status: 'SUCCESS',
        startedAt: new Date('2026-08-02T12:00:00.000Z'),
        finishedAt: new Date('2026-08-02T12:00:01.000Z'),
        counts: { parties: 2 },
      },
    });

    const conversation = await prisma.aiConversation.create({
      data: {
        tenantId: tenantA.id,
        userId: admin.id,
        startedAt: new Date('2026-08-03T12:00:00.000Z'),
        lastMessageAt: new Date('2026-08-03T12:00:00.000Z'),
        analyticalContext: { prompt: PROMPT_SECRET },
      },
    });
    const message = await prisma.aiMessage.create({
      data: {
        conversationId: conversation.id,
        tenantId: tenantA.id,
        senderType: 'USER',
        content: `${PROMPT_SECRET} ${TOKEN_SECRET}`,
      },
    });
    await prisma.aiRun.create({
      data: {
        tenantId: tenantA.id,
        userId: admin.id,
        conversationId: conversation.id,
        messageId: message.id,
        runType: 'QUESTION_REPLY',
        provider: 'OPENAI',
        model: 'gpt-test',
        status: 'SUCCEEDED',
        inputTokens: 11,
        outputTokens: 7,
        durationMs: 320,
        createdAt: new Date('2026-08-03T12:00:01.000Z'),
        finishedAt: new Date('2026-08-03T12:00:01.320Z'),
      },
    });
    await prisma.aiRun.create({
      data: {
        tenantId: tenantB.id,
        runType: 'QUESTION_REPLY',
        provider: 'ANTHROPIC',
        model: 'claude-test',
        status: 'FAILED',
        errorCode: 'PROVIDER_ERROR',
      },
    });

    const app = await buildTestApp();
    const cookie = await login(app, admin.email);
    const headers = { cookie };

    const page1 = await app.inject({
      method: 'GET',
      url: `/admin/operations/sync-runs?tenantId=${tenantA.id}&limit=1&offset=0`,
      headers,
    });
    expect(page1.statusCode).toBe(200);
    expect(page1.json().pagination).toMatchObject({ limit: 1, offset: 0, total: 3, hasMore: true });
    expect(page1.json().data).toHaveLength(1);
    expect(page1.json().data[0].tenantId).toBe(tenantA.id);
    expect(JSON.stringify(page1.json())).not.toContain(foreign.id);

    const page2 = await app.inject({
      method: 'GET',
      url: `/admin/operations/sync-runs?tenantId=${tenantA.id}&limit=1&offset=1`,
      headers,
    });
    expect(page2.json().data[0].id).not.toBe(page1.json().data[0].id);
    expect(page2.json().pagination).toMatchObject({ offset: 1, hasMore: true });

    const capped = await app.inject({
      method: 'GET',
      url: `/admin/operations/sync-runs?limit=500&offset=0`,
      headers,
    });
    expect(capped.json().pagination.limit).toBe(100);

    const success = await app.inject({
      method: 'GET',
      url: `/admin/operations/sync-runs?tenantId=${tenantA.id}&status=SUCCESS`,
      headers,
    });
    expect(success.json().data).toEqual([
      expect.objectContaining({
        id: older.id,
        status: 'SUCCESS',
        triggerType: 'SCHEDULED',
        startedAt: '2026-08-01T12:00:00.000Z',
        finishedAt: '2026-08-01T12:00:05.000Z',
        durationMs: 5000,
        heartbeatAt: '2026-08-01T12:00:04.000Z',
        errorCode: null,
        counts: { categories: 4 },
      }),
    ]);
    const successBody = JSON.stringify(success.json());
    expect(successBody).not.toContain(TOKEN_SECRET);
    expect(successBody).not.toContain(PROMPT_SECRET);

    const failures = await app.inject({
      method: 'GET',
      url: `/admin/operations/failures?tenantId=${tenantA.id}`,
      headers,
    });
    expect(failures.json().data.map((row: { id: string }) => row.id)).toEqual([newer.id]);
    expect(failures.json().data[0]).toMatchObject({
      status: 'FAILED',
      errorCode: 'sync_timeout',
      tenantId: tenantA.id,
    });

    const health = await app.inject({
      method: 'GET',
      url: `/admin/operations/health?tenantId=${tenantA.id}`,
      headers,
    });
    expect(health.json().data).toHaveLength(1);
    expect(health.json().data[0]).toMatchObject({
      tenantId: tenantA.id,
      tenantDisplayName: 'Empresa A',
      integration: {
        id: integrationA.id,
        status: 'ERROR',
        lastSuccessfulSyncAt: '2026-08-01T10:00:00.000Z',
        lastErrorAt: '2026-08-01T11:00:00.000Z',
        lastErrorCode: 'refresh_failed',
        currentRun: {
          status: 'RUNNING',
          triggerType: 'MANUAL',
          startedAt: '2026-08-01T14:00:00.000Z',
          heartbeatAt: '2026-08-01T14:00:30.000Z',
        },
      },
    });
    expect(JSON.stringify(health.json())).not.toContain('sk-should-not-leak');

    const healthAll = await app.inject({
      method: 'GET',
      url: '/admin/operations/health?limit=50&offset=0',
      headers,
    });
    const withoutIntegration = healthAll
      .json()
      .data.find((row: { tenantDisplayName: string }) => row.tenantDisplayName === 'Empresa C');
    expect(withoutIntegration.integration).toBeNull();

    const ai = await app.inject({
      method: 'GET',
      url: `/admin/operations/ai-runs?tenantId=${tenantA.id}`,
      headers,
    });
    expect(ai.json().data).toEqual([
      expect.objectContaining({
        tenantId: tenantA.id,
        userId: admin.id,
        userName: admin.name,
        runType: 'QUESTION_REPLY',
        provider: 'OPENAI',
        model: 'gpt-test',
        status: 'SUCCEEDED',
        inputTokens: 11,
        outputTokens: 7,
        durationMs: 320,
      }),
    ]);
    const aiBody = JSON.stringify(ai.json());
    expect(aiBody).not.toContain(PROMPT_SECRET);
    expect(aiBody).not.toContain(TOKEN_SECRET);
    expect(aiBody).not.toContain('analyticalContext');
    expect(ai.json().data[0].messageId).toBeUndefined();
    expect(ai.json().data[0].content).toBeUndefined();

    const missing = await app.inject({
      method: 'GET',
      url: `/admin/operations/sync-runs?tenantId=${randomUUID()}`,
      headers,
    });
    expect(missing.statusCode).toBe(404);
  });

  it('mutação administrativa gera AuditLog sem senha, hash ou token', async () => {
    const admin = await createActiveUser('ops.audit@test.local', 'ADMIN');
    const app = await buildTestApp();
    const cookie = await login(app, admin.email);

    const created = await app.inject({
      method: 'POST',
      url: '/admin/tenants',
      headers: { cookie },
      payload: { name: 'ops-audit-co', displayName: 'Empresa Auditada' },
    });
    expect(created.statusCode).toBe(201);
    const tenantId = created.json().id as string;

    const user = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantId}/users`,
      headers: { cookie },
      payload: {
        name: 'Usuário Auditado',
        email: 'ops.member@test.local',
        password: VALID_PASSWORD,
      },
    });
    expect(user.statusCode).toBe(201);
    const userId = user.json().id as string;

    const reset = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantId}/users/${userId}/reset-password`,
      headers: { cookie },
      payload: { password: RESET_PASSWORD, passwordConfirmation: RESET_PASSWORD },
    });
    expect(reset.statusCode).toBe(200);

    await recordAdministrativeAudit(prisma, {
      operatorUserId: admin.id,
      tenantId,
      action: AUDIT_ACTIONS.TENANT_USER_PASSWORD_RESET,
      targetType: 'user',
      targetId: userId,
      result: 'FAILURE',
      metadata: {
        password: RESET_PASSWORD,
        passwordHash: '$argon2id$hash-secreto',
        token: 'sess-token-secreto',
        prompt: PROMPT_SECRET,
        fields: ['name'],
      },
    });

    const listed = await app.inject({
      method: 'GET',
      url: `/admin/operations/audit-logs?tenantId=${tenantId}&limit=20&offset=0`,
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    const rows = listed.json().data as Array<{
      action: string;
      operatorUserId: string;
      tenantId: string;
      targetType: string;
      targetId: string;
      result: string;
      metadata: unknown;
    }>;

    const tenantCreated = rows.find((row) => row.action === 'tenant.created');
    expect(tenantCreated).toMatchObject({
      operatorUserId: admin.id,
      tenantId,
      targetType: 'tenant',
      targetId: tenantId,
      result: 'SUCCESS',
    });

    const passwordReset = rows.find(
      (row) => row.action === 'tenant_user.password_reset' && row.result === 'SUCCESS',
    );
    expect(passwordReset).toMatchObject({
      operatorUserId: admin.id,
      tenantId,
      targetType: 'user',
      targetId: userId,
      result: 'SUCCESS',
    });

    const stored = await prisma.auditLog.findMany({ where: { tenantId } });
    const serialized = JSON.stringify(stored);
    expect(serialized).not.toContain(RESET_PASSWORD);
    expect(serialized).not.toContain(VALID_PASSWORD);
    expect(serialized).not.toContain('passwordHash');
    expect(serialized).not.toContain('argon2');
    expect(serialized).not.toContain('sess-token-secreto');
    expect(serialized).not.toContain(PROMPT_SECRET);
    expect(stored.some((row) => row.result === 'FAILURE' && row.metadata !== null)).toBe(true);
  });

  it('resume a plataforma, pagina empresas e isola o filtro sem inventar zero', async () => {
    const admin = await createActiveUser('ops.overview.admin@test.local', 'ADMIN');
    const superAdmin = await createActiveUser('ops.overview.super@test.local', 'SUPER_ADMIN');
    const tenantA = await tenants.create({ name: 'ops-overview-a', displayName: 'Visao Alfa' });
    const tenantB = await tenants.create({ name: 'ops-overview-b', displayName: 'Visao Beta' });
    await tenants.create({ name: 'ops-overview-c', displayName: 'Visao Gama' });
    const now = new Date();
    const integrationA = await prisma.integration.create({
      data: {
        tenantId: tenantA.id,
        provider: 'CONTA_AZUL',
        status: 'ERROR',
        lastErrorAt: now,
        lastErrorCode: 'sync_upstream_unavailable',
      },
    });
    await prisma.integration.create({
      data: {
        tenantId: tenantB.id,
        provider: 'CONTA_AZUL',
        status: 'CONNECTED',
        lastSuccessfulSyncAt: now,
      },
    });
    await prisma.syncRun.create({
      data: {
        tenantId: tenantA.id,
        integrationId: integrationA.id,
        triggerType: 'MANUAL',
        status: 'FAILED',
        startedAt: now,
        finishedAt: new Date(now.getTime() + 1000),
        errorCode: 'sync_disconnected',
        counts: { payables: 3, ledgerFetched: 1 },
      },
    });

    const app = await buildTestApp();
    const adminCookie = await login(app, admin.email);
    const superCookie = await login(app, superAdmin.email);

    const overview = await app.inject({
      method: 'GET',
      url: '/admin/operations/overview?limit=1&offset=0',
      headers: { cookie: adminCookie },
    });
    expect(overview.statusCode).toBe(200);
    const body = overview.json();
    expect(body.windows).toEqual({ syncFreshnessHours: 24, recentDays: 7 });
    expect(body.kpis.companies.total).toBeGreaterThanOrEqual(3);
    expect(body.kpis.integrations.connected).toBeGreaterThanOrEqual(1);
    expect(body.kpis.integrations.withError).toBeGreaterThanOrEqual(1);
    expect(body.kpis.synchronization.syncedCompaniesLast24Hours).toBeGreaterThanOrEqual(1);
    expect(body.kpis.synchronization.failuresLast7Days).toBeGreaterThanOrEqual(1);
    expect(body.companies.pagination).toMatchObject({ limit: 1, offset: 0, hasMore: true });
    expect(body.companies.data).toHaveLength(1);
    expect(body.companies.data[0].financials).toEqual(
      expect.objectContaining({
        billing: expect.anything(),
        result: expect.anything(),
        receivables: expect.anything(),
        payables: expect.anything(),
      }),
    );
    const serialized = JSON.stringify(body);
    expect(serialized).not.toContain('realizedByCategory');
    expect(serialized).not.toContain('PROMPT');
    expect(serialized).not.toContain('apiKey');

    const page2 = await app.inject({
      method: 'GET',
      url: '/admin/operations/overview?limit=1&offset=1',
      headers: { cookie: adminCookie },
    });
    expect(page2.json().companies.data[0].tenantId).not.toBe(body.companies.data[0].tenantId);

    const filtered = await app.inject({
      method: 'GET',
      url: `/admin/operations/overview?tenantId=${tenantA.id}`,
      headers: { cookie: superCookie },
    });
    expect(filtered.statusCode).toBe(200);
    expect(filtered.json().companies.data).toEqual([
      expect.objectContaining({
        tenantId: tenantA.id,
        tenantDisplayName: 'Visao Alfa',
        integrationState: 'ERROR',
        integration: expect.objectContaining({ status: 'ERROR' }),
      }),
    ]);
    expect(filtered.json().kpis.companies.total).toBe(body.kpis.companies.total);
    expect(JSON.stringify(filtered.json().companies)).not.toContain('Visao Beta');
    expect(JSON.stringify(filtered.json().companies)).not.toContain('Visao Gama');

    const missing = await app.inject({
      method: 'GET',
      url: `/admin/operations/overview?tenantId=${tenantB.id}`,
      headers: { cookie: adminCookie },
    });
    expect(missing.json().companies.data[0].integrationState).toBe('CONNECTED');

    const withoutIntegration = await app.inject({
      method: 'GET',
      url: `/admin/operations/overview?tenantId=${
        (
          await prisma.tenant.findFirstOrThrow({ where: { displayName: 'Visao Gama' } })
        ).id
      }`,
      headers: { cookie: adminCookie },
    });
    expect(withoutIntegration.json().companies.data[0]).toMatchObject({
      integration: null,
      integrationState: 'NONE',
    });
    const financials = withoutIntegration.json().companies.data[0].financials as {
      billing: string | null;
    };
    expect(financials.billing === null || typeof financials.billing === 'string').toBe(true);
    if (financials.billing === null) {
      expect(financials.billing).not.toBe('0');
    }
  });
});
