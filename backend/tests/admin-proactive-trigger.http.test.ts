import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { createProactiveTriggerRepository } from '../src/modules/advisor/repositories/proactive-trigger.repository.js';
import { createProactiveTriggerService } from '../src/modules/advisor/services/proactive-trigger.service.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
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
const triggers = createProactiveTriggerService(createProactiveTriggerRepository(prisma));

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

async function createPlatformUser(options: {
  email: string;
  role: 'ADMIN' | 'SUPER_ADMIN' | 'USER';
  tenantId?: string | null;
}) {
  let tenantId: string | null = null;

  if (options.role === 'USER') {
    if (options.tenantId != null) {
      tenantId = options.tenantId;
    } else {
      const tenant = await tenants.create({
        name: `tenant-${options.email}`,
        displayName: `Tenant ${options.email}`,
      });
      tenantId = tenant.id;
    }
  }

  const user = await users.create({
    name: options.email,
    email: options.email,
    role: options.role,
    tenantId: options.tenantId ?? tenantId,
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

async function buildTestApp() {
  const app = await buildApp();
  apps.add(app);
  return app;
}

async function openSession(email: string, role: 'ADMIN' | 'SUPER_ADMIN' | 'USER', tenantId?: string) {
  await createPlatformUser({
    email,
    role,
    ...(tenantId !== undefined ? { tenantId } : {}),
  });
  const app = await buildTestApp();
  const cookie = await loginAs(app, email);
  return { app, cookie };
}

describe('API administrativa /admin/proactive-triggers (F14.3)', () => {
  it('ADMIN cria, lista, edita, ativa, desativa e exclui', async () => {
    const tenant = await tenants.create({
      name: 'gatilho-admin',
      displayName: 'Tenant Gatilho Admin',
    });
    const { app, cookie } = await openSession('admin-gatilho@api.test', 'ADMIN');

    const created = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
      payload: {
        triggerType: 'REVENUE_GOAL_PERCENTAGE',
        parameters: { percentage: 80 },
      },
    });
    expect(created.statusCode).toBe(201);
    const createdBody = created.json() as { id: string; triggerType: string; percentage: number; active: boolean };
    expect(createdBody).toMatchObject({
      triggerType: 'REVENUE_GOAL_PERCENTAGE',
      percentage: 80,
      active: true,
    });

    const listed = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data).toEqual([
      expect.objectContaining({ id: createdBody.id, percentage: 80, active: true }),
    ]);

    const patched = await app.inject({
      method: 'PATCH',
      url: `/admin/tenants/${tenant.id}/proactive-triggers/${createdBody.id}`,
      headers: { cookie },
      payload: { parameters: { percentage: 90 } },
    });
    expect(patched.statusCode).toBe(200);
    expect(patched.json()).toMatchObject({ id: createdBody.id, percentage: 90, active: true });

    const disabled = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers/${createdBody.id}/active`,
      headers: { cookie },
      payload: { active: false },
    });
    expect(disabled.statusCode).toBe(200);
    expect(disabled.json()).toMatchObject({ id: createdBody.id, active: false });

    const enabled = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers/${createdBody.id}/active`,
      headers: { cookie },
      payload: { active: true },
    });
    expect(enabled.statusCode).toBe(200);
    expect(enabled.json()).toMatchObject({ id: createdBody.id, active: true });

    const removed = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenant.id}/proactive-triggers/${createdBody.id}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(204);
    expect(removed.body).toBe('');

    const afterDelete = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
    });
    expect(afterDelete.statusCode).toBe(200);
    expect(afterDelete.json().data).toEqual([]);
  });

  it('SUPER_ADMIN cria gatilho', async () => {
    const tenant = await tenants.create({
      name: 'gatilho-super',
      displayName: 'Tenant Gatilho Super',
    });
    const { app, cookie } = await openSession('super-gatilho@api.test', 'SUPER_ADMIN');

    const created = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
      payload: {
        triggerType: 'EXPENSE_CEILING_EXCEEDED',
        parameters: {},
      },
    });
    expect(created.statusCode).toBe(201);
    expect(created.json()).toMatchObject({
      triggerType: 'EXPENSE_CEILING_EXCEEDED',
      percentage: null,
      daysAhead: null,
      minimumAmount: null,
      titleKind: null,
      active: true,
    });
  });

  it('USER recebe 403', async () => {
    const tenant = await tenants.create({
      name: 'gatilho-user',
      displayName: 'Tenant Gatilho User',
    });
    const { app, cookie } = await openSession('user-gatilho@api.test', 'USER', tenant.id);

    const response = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
      payload: {
        triggerType: 'REVENUE_GOAL_PERCENTAGE',
        parameters: { percentage: 80 },
      },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(await prisma.proactiveTriggerConfiguration.count({ where: { tenantId: tenant.id } })).toBe(0);
  });

  it('modo suporte não altera a lista', async () => {
    const tenant = await tenants.create({
      name: 'gatilho-suporte',
      displayName: 'Tenant Gatilho Suporte',
    });
    const { app, cookie } = await openSession('admin-gatilho-suporte@api.test', 'ADMIN');

    const created = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
      payload: {
        triggerType: 'REVENUE_GOAL_PERCENTAGE',
        parameters: { percentage: 80 },
      },
    });
    expect(created.statusCode).toBe(201);

    const before = await prisma.proactiveTriggerConfiguration.findMany({
      where: { tenantId: tenant.id },
      orderBy: { id: 'asc' },
    });

    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie, 'user-agent': 'admin-proactive-trigger-support' },
      payload: { tenantId: tenant.id },
    });
    expect(enter.statusCode).toBe(200);

    const mutation = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
      payload: {
        triggerType: 'EXPENSE_CEILING_EXCEEDED',
        parameters: {},
      },
    });
    expect(mutation.statusCode).toBe(403);
    expect(mutation.json().error.code).toBe('FORBIDDEN');

    const after = await prisma.proactiveTriggerConfiguration.findMany({
      where: { tenantId: tenant.id },
      orderBy: { id: 'asc' },
    });
    expect(after.map((row) => ({ id: row.id, parameterKey: row.parameterKey, active: row.active }))).toEqual(
      before.map((row) => ({ id: row.id, parameterKey: row.parameterKey, active: row.active })),
    );
  });

  it('listar o tenant B não devolve configuração do tenant A', async () => {
    const tenantA = await tenants.create({
      name: 'gatilho-tenant-a',
      displayName: 'Tenant Gatilho A',
    });
    const tenantB = await tenants.create({
      name: 'gatilho-tenant-b',
      displayName: 'Tenant Gatilho B',
    });
    const { app, cookie } = await openSession('admin-gatilho-iso@api.test', 'ADMIN');

    const created = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantA.id}/proactive-triggers`,
      headers: { cookie },
      payload: {
        triggerType: 'EXPENSE_CEILING_PERCENTAGE',
        parameters: { percentage: 90 },
      },
    });
    expect(created.statusCode).toBe(201);

    const listB = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantB.id}/proactive-triggers`,
      headers: { cookie },
    });
    expect(listB.statusCode).toBe(200);
    expect(listB.json().data).toEqual([]);

    const listA = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantA.id}/proactive-triggers`,
      headers: { cookie },
    });
    expect(listA.json().data).toEqual([
      expect.objectContaining({ id: created.json().id, triggerType: 'EXPENSE_CEILING_PERCENTAGE' }),
    ]);
  });

  it('rejeita tipo desconhecido e percentual inválido com 400', async () => {
    const tenant = await tenants.create({
      name: 'gatilho-invalido',
      displayName: 'Tenant Gatilho Invalido',
    });
    const { app, cookie } = await openSession('admin-gatilho-invalido@api.test', 'ADMIN');
    const before = await prisma.proactiveTriggerConfiguration.count();

    const unknown = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
      payload: { triggerType: 'FREE_FORM', parameters: {} },
    });
    expect(unknown.statusCode).toBe(400);
    expect(unknown.json().error.code).toBe('VALIDATION_ERROR');

    const percentage = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
      payload: {
        triggerType: 'REVENUE_GOAL_PERCENTAGE',
        parameters: { percentage: 0 },
      },
    });
    expect(percentage.statusCode).toBe(400);
    expect(percentage.json().error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.proactiveTriggerConfiguration.count()).toBe(before);
  });

  it('GET catalog e tenant novo não criam configuração', async () => {
    const tenant = await tenants.create({
      name: 'gatilho-vazio',
      displayName: 'Tenant Gatilho Vazio',
    });
    const { app, cookie } = await openSession('admin-gatilho-vazio@api.test', 'ADMIN');
    const before = await prisma.proactiveTriggerConfiguration.count();

    const catalog = await app.inject({
      method: 'GET',
      url: '/admin/proactive-triggers/catalog',
      headers: { cookie },
    });
    expect(catalog.statusCode).toBe(200);
    const body = catalog.json() as {
      types: Array<{ type: string }>;
      suggestedDefaults: {
        revenueGoalPercentages: number[];
        expenseCeilingPercentages: number[];
        expenseCeilingExceeded: boolean;
        titleDueSoon: { daysAhead: number; minimumAmount: string; titleKind: string };
      };
    };
    expect(body.types.map((item) => item.type)).toEqual([
      'REVENUE_GOAL_PERCENTAGE',
      'EXPENSE_CEILING_PERCENTAGE',
      'EXPENSE_CEILING_EXCEEDED',
      'TITLE_DUE_SOON',
    ]);
    expect(body.suggestedDefaults.revenueGoalPercentages).toEqual([80, 90, 100]);
    expect(body.suggestedDefaults.expenseCeilingPercentages).toEqual([80, 90, 100]);
    expect(body.suggestedDefaults.expenseCeilingExceeded).toBe(true);
    expect(body.suggestedDefaults.titleDueSoon).toEqual({
      daysAhead: 3,
      minimumAmount: '5000',
      titleKind: 'PAYABLE',
    });

    const listed = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
    });
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data).toEqual([]);
    expect(await prisma.proactiveTriggerConfiguration.count()).toBe(before);
    expect(await prisma.proactiveTriggerConfiguration.count({ where: { tenantId: tenant.id } })).toBe(0);
  });

  it('DELETE com histórico responde 409 e mantém a configuração', async () => {
    const tenant = await tenants.create({
      name: 'gatilho-historico',
      displayName: 'Tenant Gatilho Historico',
    });
    const { app, cookie } = await openSession('admin-gatilho-historico@api.test', 'ADMIN');

    const created = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
      payload: {
        triggerType: 'REVENUE_GOAL_PERCENTAGE',
        parameters: { percentage: 80 },
      },
    });
    expect(created.statusCode).toBe(201);
    const configurationId = created.json().id as string;

    await triggers.recordOccurrence({
      tenantId: tenant.id,
      configurationId,
      periodKey: '2026-10',
      subjectKey: '',
      periodStart: new Date('2026-10-01T00:00:00.000Z'),
      periodEnd: new Date('2026-10-31T00:00:00.000Z'),
      sourceMetric: 'revenue_goal.value.month',
      payload: { monthKey: '2026-10', threshold: 80 },
      detectedAt: new Date('2026-10-15T12:00:00.000Z'),
      severity: 'INFORMATIVE',
    });

    const removed = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenant.id}/proactive-triggers/${configurationId}`,
      headers: { cookie },
    });
    expect(removed.statusCode).toBe(409);
    expect(removed.json().error.code).toBe('CONFLICT');

    const remaining = await prisma.proactiveTriggerConfiguration.findFirst({
      where: { id: configurationId, tenantId: tenant.id },
    });
    expect(remaining).not.toBeNull();

    const listed = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/proactive-triggers`,
      headers: { cookie },
    });
    expect(listed.json().data).toEqual([expect.objectContaining({ id: configurationId, active: true })]);
  });
});
