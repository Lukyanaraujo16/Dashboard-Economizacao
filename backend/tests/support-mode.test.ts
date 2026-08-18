import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { createTenantBrandingRepository } from '../src/modules/branding/index.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const users = createUserRepository(prisma);
const credentials = createUserCredentialRepository(prisma);
const tenantBranding = createTenantBrandingRepository(prisma);
const passwordHasher = createArgon2idPasswordHasher();

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await Promise.all(
    [...apps].map(async (app) => {
      const keys = await app.redis.keys(`${buildSessionKeyPrefix('test')}*`);
      if (keys.length > 0) {
        await app.redis.del(...keys);
      }
      await app.close();
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

describe('modo suporte (fase 1.6)', () => {
  it('SUPER_ADMIN entra, preserva identidade, recebe /me e branding do tenant, e sai', async () => {
    const operator = await createActiveUser('support.super@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'support-target',
      displayName: 'Empresa em Suporte',
    });
    await tenantBranding.upsert(tenant.id, { lightColors: { primary: '#123456' } });
    const app = await buildTestApp();
    const cookie = await login(app, operator.email);

    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie, 'user-agent': 'support-test-agent' },
      payload: { tenantId: tenant.id },
    });
    expect(enter.statusCode).toBe(200);
    expect(enter.json()).toMatchObject({
      user: {
        id: operator.id,
        role: 'SUPER_ADMIN',
        tenantId: null,
      },
      support: {
        active: true,
        tenantId: tenant.id,
        tenantDisplayName: 'Empresa em Suporte',
      },
    });

    const supportSessionId = enter.json().support.supportSessionId as string;
    const row = await prisma.supportSession.findUniqueOrThrow({
      where: { id: supportSessionId },
    });
    expect(row.operatorUserId).toBe(operator.id);
    expect(row.tenantId).toBe(tenant.id);
    expect(row.endedAt).toBeNull();
    expect(row.userAgent).toBe('support-test-agent');

    const context = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie },
    });
    expect(context.json()).toMatchObject({
      userId: operator.id,
      role: 'SUPER_ADMIN',
      tenantId: null,
    });
    const redisKey = `${buildSessionKeyPrefix('test')}${context.json().sessionId}`;
    const redis = JSON.parse((await app.redis.get(redisKey))!) as Record<string, unknown>;
    expect(redis).toMatchObject({
      userId: operator.id,
      role: 'SUPER_ADMIN',
      tenantId: null,
      supportMode: true,
      supportTenantId: tenant.id,
      supportSessionId,
    });

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().support).toMatchObject({
      active: true,
      tenantId: tenant.id,
      tenantDisplayName: tenant.displayName,
      supportSessionId,
    });

    const currentBranding = await app.inject({
      method: 'GET',
      url: '/branding/current',
      headers: { cookie },
    });
    expect(currentBranding.statusCode).toBe(200);
    expect(currentBranding.json()).toMatchObject({
      scope: 'tenant',
      tenantId: tenant.id,
      name: tenant.displayName,
      light: { primary: '#123456' },
    });

    const duplicate = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    expect(duplicate.statusCode).toBe(409);
    expect(duplicate.json().error.code).toBe('CONFLICT');

    const exit = await app.inject({
      method: 'POST',
      url: '/auth/support/exit',
      headers: { cookie },
    });
    expect(exit.statusCode).toBe(200);
    expect(exit.json()).toMatchObject({
      user: { id: operator.id, role: 'SUPER_ADMIN', tenantId: null },
      support: { active: false },
    });
    expect(
      (await prisma.supportSession.findUniqueOrThrow({ where: { id: supportSessionId } })).endedAt,
    ).not.toBeNull();

    const idempotentExit = await app.inject({
      method: 'POST',
      url: '/auth/support/exit',
      headers: { cookie },
    });
    expect(idempotentExit.statusCode).toBe(200);
    expect(idempotentExit.json().support).toEqual({ active: false });
  });

  it.each([
    ['ADMIN', 'support.admin@test.local'],
    ['USER', 'support.user@test.local'],
  ] as const)('%s recebe 403 ao tentar entrar', async (role, email) => {
    await createActiveUser(email, role);
    const tenant = await tenants.create({
      name: `target-${role.toLowerCase()}`,
      displayName: `Target ${role}`,
    });
    const app = await buildTestApp();
    const cookie = await login(app, email);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
    expect(await prisma.supportSession.count()).toBe(0);
  });

  it('rejeita tenant DISABLED com 422', async () => {
    await createActiveUser('support.disabled@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'support-disabled',
      displayName: 'Disabled',
    });
    await tenants.disable(tenant.id);
    const app = await buildTestApp();
    const cookie = await login(app, 'support.disabled@test.local');

    const response = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    expect(response.statusCode).toBe(422);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(await prisma.supportSession.count()).toBe(0);
  });

  it('logout fecha a support_session ativa', async () => {
    await createActiveUser('support.logout@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'support-logout',
      displayName: 'Logout Target',
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'support.logout@test.local');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    const supportSessionId = enter.json().support.supportSessionId as string;

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);
    expect(
      (await prisma.supportSession.findUniqueOrThrow({ where: { id: supportSessionId } })).endedAt,
    ).not.toBeNull();
  });

  it('requireAuthentication limpa suporte e fecha auditoria quando o tenant deixa de estar ACTIVE', async () => {
    await createActiveUser('support.revalidate@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'support-revalidate',
      displayName: 'Revalidate Target',
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'support.revalidate@test.local');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    const supportSessionId = enter.json().support.supportSessionId as string;
    await tenants.disable(tenant.id);

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json()).toMatchObject({
      user: { role: 'SUPER_ADMIN', tenantId: null },
      support: { active: false },
    });
    expect(
      (await prisma.supportSession.findUniqueOrThrow({ where: { id: supportSessionId } })).endedAt,
    ).not.toBeNull();
  });

  it('login encerra support_session aberta da sessão anterior', async () => {
    await createActiveUser('support.login-close@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'support-login-close',
      displayName: 'Login Close Target',
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'support.login-close@test.local');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    const supportSessionId = enter.json().support.supportSessionId as string;

    await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'support.login-close@test.local', password: VALID_PASSWORD },
    });

    expect(
      (await prisma.supportSession.findUniqueOrThrow({ where: { id: supportSessionId } })).endedAt,
    ).not.toBeNull();
  });

  it('bloqueia /admin/tenants durante modo suporte', async () => {
    await createActiveUser('support.admin-block@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'support-admin-block',
      displayName: 'Admin Block Target',
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'support.admin-block@test.local');
    await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });

    const adminList = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { cookie },
    });
    expect(adminList.statusCode).toBe(403);
    expect(adminList.json().error.code).toBe('FORBIDDEN');
  });

  it('tenant desativado retorna 409 em rota administrativa e 200 em /auth/me', async () => {
    await createActiveUser('support.conflict@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'support-conflict',
      displayName: 'Conflict Target',
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'support.conflict@test.local');
    await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    await tenants.disable(tenant.id);

    const adminList = await app.inject({
      method: 'GET',
      url: '/admin/tenants',
      headers: { cookie },
    });
    expect(adminList.statusCode).toBe(409);
    expect(adminList.json().error.code).toBe('CONFLICT');

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().support).toEqual({ active: false });
  });

  it('exit encerra suporte no cookie — próxima request não possui suporte', async () => {
    await createActiveUser('support.exit-cookie@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'support-exit-cookie',
      displayName: 'Exit Cookie Target',
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'support.exit-cookie@test.local');
    await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    await app.inject({
      method: 'POST',
      url: '/auth/support/exit',
      headers: { cookie },
    });

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().support).toEqual({ active: false });
  });

  it('registro encerrado no banco invalida suporte stale no Redis', async () => {
    await createActiveUser('support.stale-db@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({
      name: 'support-stale-db',
      displayName: 'Stale DB Target',
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'support.stale-db@test.local');
    const enter = await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    const supportSessionId = enter.json().support.supportSessionId as string;

    await prisma.supportSession.update({
      where: { id: supportSessionId },
      data: { endedAt: new Date() },
    });

    const me = await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie } });
    expect(me.statusCode).toBe(200);
    expect(me.json().support).toEqual({ active: false });
  });
});
