import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import {
  SESSION_COOKIE_NAME,
  SESSION_MAX_AGE_MILLISECONDS,
  SESSION_TTL_SECONDS,
} from '../src/modules/auth/config/session-config.js';
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

function parseCookieExpires(setCookie: string): Date {
  const match = /Expires=([^;]+)/i.exec(setCookie);
  if (!match?.[1]) {
    throw new Error(`Set-Cookie sem Expires: ${setCookie}`);
  }
  return new Date(match[1]);
}

function assertSessionCookieShape(setCookie: string): void {
  expect(setCookie.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
  expect(setCookie.toLowerCase()).toContain('httponly');
  expect(setCookie.toLowerCase()).toContain('samesite=lax');
  expect(setCookie).toContain('Path=/');
}

async function createActiveUser(options: {
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  status?: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'DISABLED';
  lockedUntil?: Date | null;
}) {
  let tenantId: string | null = null;
  if (options.role === 'USER') {
    const tenant = await tenants.create({
      name: `tenant-${options.email}`,
      displayName: `Tenant ${options.email}`,
    });
    tenantId = tenant.id;
  }

  const user = await users.create({
    name: options.email,
    email: options.email,
    role: options.role,
    tenantId,
    status: options.status ?? 'ACTIVE',
  });

  if (options.status === 'BLOCKED' || options.lockedUntil !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: options.status ?? 'ACTIVE',
        lockedUntil: options.lockedUntil === undefined ? null : options.lockedUntil,
      },
    });
  }

  if ((options.status ?? 'ACTIVE') === 'ACTIVE' || options.status === 'DISABLED') {
    await credentials.create({
      userId: user.id,
      passwordHash: await passwordHasher.hash(VALID_PASSWORD),
    });
  } else if (options.status === 'BLOCKED') {
    await credentials.create({
      userId: user.id,
      passwordHash: await passwordHasher.hash(VALID_PASSWORD),
    });
  }

  return (await users.findById(user.id))!;
}

async function loginAs(
  app: Awaited<ReturnType<typeof buildApp>>,
  email: string,
  headers?: Record<string, string>,
) {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: VALID_PASSWORD },
    headers,
  });
  expect(response.statusCode).toBe(200);
  const cookie = readSessionCookie(response.headers['set-cookie']);
  expect(cookie).toBeTruthy();
  return cookieValue(cookie!);
}

async function findSessionKey(sessionId: string): Promise<string> {
  return `${buildSessionKeyPrefix('test')}${sessionId}`;
}

describe('requireAuthentication / request.auth (1.1E)', () => {
  it('sessão válida gera request.auth tipado com campos corretos (USER)', async () => {
    const user = await createActiveUser({ email: 'user-auth@mw.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);

    const cookie = await loginAs(app, 'user-auth@mw.test', {
      'user-agent': 'mw-agent-user',
    });

    const before = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie },
    });
    const createdAt = before.json().createdAt as string;
    const originalIp = before.json().ip as string | null;
    const originalUa = before.json().userAgent as string | null;
    const sessionId = before.json().sessionId as string;

    await new Promise((resolve) => setTimeout(resolve, 20));

    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie, 'user-agent': 'mw-agent-user-later' },
    });

    expect(protectedResponse.statusCode).toBe(200);
    const body = protectedResponse.json();
    expect(body.authenticated).toBe(true);
    expect(body.userId).toBe(user.id);
    expect(body.tenantId).toBe(user.tenantId);
    expect(body.role).toBe('USER');
    expect(body.sessionId).toBe(sessionId);
    expect(body.createdAt).toBe(createdAt);
    expect(body.lastAccess).not.toBe(before.json().lastAccess);
    expect(body.ip).toBe(originalIp);
    expect(body.userAgent).toBe(originalUa);
  });

  it('ADMIN e SUPER_ADMIN expõem tenantId null', async () => {
    await createActiveUser({ email: 'admin-mw@mw.test', role: 'ADMIN' });
    await createActiveUser({ email: 'super-mw@mw.test', role: 'SUPER_ADMIN' });
    const app = await buildApp();
    apps.add(app);

    for (const email of ['admin-mw@mw.test', 'super-mw@mw.test']) {
      const cookie = await loginAs(app, email);
      const response = await app.inject({
        method: 'GET',
        url: '/__test__/protected',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().tenantId).toBeNull();
      expect(['ADMIN', 'SUPER_ADMIN']).toContain(response.json().role);
    }
  });

  it('sem cookie, cookie inválido, sessão anônima e contexto incompleto → 401', async () => {
    const app = await buildApp();
    apps.add(app);

    const noCookie = await app.inject({ method: 'GET', url: '/__test__/protected' });
    expect(noCookie.statusCode).toBe(401);
    expect(noCookie.json().error.code).toBe('UNAUTHENTICATED');

    const badCookie = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie: 'dashboard.sid=not-a-valid-session' },
    });
    expect(badCookie.statusCode).toBe(401);
    expect(badCookie.json().error.code).toBe('UNAUTHENTICATED');

    const anonymous = await app.inject({
      method: 'POST',
      url: '/__test__/session',
      payload: { marker: 'anon' },
    });
    const anonCookie = cookieValue(readSessionCookie(anonymous.headers['set-cookie'])!);
    const anonProtected = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie: anonCookie },
    });
    expect(anonProtected.statusCode).toBe(401);

    // Sessão com campos parciais: grava marker autenticado incompleto via login spoof no Redis é complexo;
    // usa sessão anônima já cobre incompleto. Força incompleto via destroy Redis key após login.
    await createActiveUser({ email: 'ghost@mw.test', role: 'USER' });
    const cookie = await loginAs(app, 'ghost@mw.test');
    const ctx = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie },
    });
    const sessionId = ctx.json().sessionId as string;
    const key = await findSessionKey(sessionId);
    expect(await app.redis.get(key)).toBeTruthy();
    await app.redis.del(key);

    const missingRedis = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie },
    });
    expect(missingRedis.statusCode).toBe(401);
    expect(missingRedis.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('role/tenant inconsistente na sessão → 401', async () => {
    const user = await createActiveUser({ email: 'inconsistent@mw.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);
    const cookie = await loginAs(app, 'inconsistent@mw.test');

    const ctx = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie },
    });
    const sessionId = ctx.json().sessionId as string;
    const key = await findSessionKey(sessionId);
    const raw = await app.redis.get(key);
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as Record<string, unknown>;
    parsed.role = 'ADMIN';
    parsed.tenantId = user.tenantId;
    await app.redis.set(key, JSON.stringify(parsed), 'EX', SESSION_TTL_SECONDS);

    const response = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(401);
  });

  it('DISABLED, PENDING e BLOCKED administrativo não acessam rota protegida', async () => {
    const active = await createActiveUser({ email: 'will-disable@mw.test', role: 'USER' });
    const pendingUser = await createActiveUser({ email: 'will-pending@mw.test', role: 'USER' });
    const blockedUser = await createActiveUser({ email: 'will-block@mw.test', role: 'USER' });

    const app = await buildApp();
    apps.add(app);

    const disabledCookie = await loginAs(app, 'will-disable@mw.test');
    await prisma.user.update({
      where: { id: active.id },
      data: { status: 'DISABLED' },
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/__test__/protected',
          headers: { cookie: disabledCookie },
        })
      ).statusCode,
    ).toBe(401);

    const pendingCookie = await loginAs(app, 'will-pending@mw.test');
    await prisma.user.update({
      where: { id: pendingUser.id },
      data: { status: 'PENDING' },
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/__test__/protected',
          headers: { cookie: pendingCookie },
        })
      ).statusCode,
    ).toBe(401);

    const blockedCookie = await loginAs(app, 'will-block@mw.test');
    await prisma.user.update({
      where: { id: blockedUser.id },
      data: { status: 'BLOCKED', lockedUntil: null },
    });
    expect(
      (
        await app.inject({
          method: 'GET',
          url: '/__test__/protected',
          headers: { cookie: blockedCookie },
        })
      ).statusCode,
    ).toBe(401);
  });

  it('BLOCKED temporário ativo nega; expirado recupera e autentica', async () => {
    const user = await createActiveUser({ email: 'temp-lock-mw@mw.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);
    const cookie = await loginAs(app, 'temp-lock-mw@mw.test');

    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'BLOCKED',
        lockedUntil: new Date(Date.now() + 10 * 60 * 1000),
        failedLoginAttempts: 5,
      },
    });

    const during = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie },
    });
    expect(during.statusCode).toBe(401);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        status: 'BLOCKED',
        lockedUntil: new Date(Date.now() - 60_000),
        failedLoginAttempts: 5,
      },
    });

    const after = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie },
    });
    expect(after.statusCode).toBe(200);

    const recovered = await users.findById(user.id);
    expect(recovered?.status).toBe('ACTIVE');
    expect(recovered?.failedLoginAttempts).toBe(0);
    expect(recovered?.lockedUntil).toBeNull();
  });

  it('sliding inactivity renova cookie Set-Cookie, TTL Redis e lastAccess', async () => {
    await createActiveUser({ email: 'slide@mw.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);

    const loginResponse = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'slide@mw.test', password: VALID_PASSWORD },
    });
    expect(loginResponse.statusCode).toBe(200);
    const loginCookieHeader = readSessionCookie(loginResponse.headers['set-cookie']);
    expect(loginCookieHeader).toBeTruthy();
    assertSessionCookieShape(loginCookieHeader!);
    const loginExpires = parseCookieExpires(loginCookieHeader!);
    const loginSkewMs = Math.abs(
      loginExpires.getTime() - (Date.now() + SESSION_MAX_AGE_MILLISECONDS),
    );
    expect(loginSkewMs).toBeLessThan(10_000);

    const cookie = cookieValue(loginCookieHeader!);
    const firstCtx = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie },
    });
    const sessionId = firstCtx.json().sessionId as string;
    const createdAt = firstCtx.json().createdAt as string;
    const previousLastAccess = firstCtx.json().lastAccess as string;
    const key = await findSessionKey(sessionId);
    expect(await app.redis.get(key)).toBeTruthy();

    await app.redis.expire(key, 100);
    const ttlBefore = await app.redis.ttl(key);
    expect(ttlBefore).toBeGreaterThan(0);
    expect(ttlBefore).toBeLessThanOrEqual(100);

    await new Promise((resolve) => setTimeout(resolve, 1100));

    const protectedResponse = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie },
    });
    expect(protectedResponse.statusCode).toBe(200);
    expect(protectedResponse.json().createdAt).toBe(createdAt);
    expect(protectedResponse.json().lastAccess).not.toBe(previousLastAccess);

    const renewedCookieHeader = readSessionCookie(protectedResponse.headers['set-cookie']);
    expect(renewedCookieHeader).toBeTruthy();
    assertSessionCookieShape(renewedCookieHeader!);
    const renewedExpires = parseCookieExpires(renewedCookieHeader!);
    expect(renewedExpires.getTime()).toBeGreaterThan(loginExpires.getTime());
    const renewedSkewMs = Math.abs(
      renewedExpires.getTime() - (Date.now() + SESSION_MAX_AGE_MILLISECONDS),
    );
    expect(renewedSkewMs).toBeLessThan(10_000);

    const ttlAfter = await app.redis.ttl(key);
    expect(ttlAfter).toBeGreaterThan(ttlBefore);
    expect(ttlAfter).toBeGreaterThan(SESSION_TTL_SECONDS - 30);
    expect(ttlAfter).toBeLessThanOrEqual(SESSION_TTL_SECONDS);

    await app.redis.expire(key, 120);
    const ttlPublicBefore = await app.redis.ttl(key);
    const health = await app.inject({
      method: 'GET',
      url: '/health',
      headers: { cookie },
    });
    expect(health.statusCode).toBe(200);
    expect(health.headers['set-cookie']).toBeUndefined();
    const ttlPublicAfter = await app.redis.ttl(key);
    expect(ttlPublicAfter).toBeLessThanOrEqual(ttlPublicBefore);
    expect(ttlPublicAfter).toBeLessThan(1000);

    // Sessão inválida não renova cookie nem TTL
    await app.redis.expire(key, 150);
    const ttlInvalidBefore = await app.redis.ttl(key);
    const invalid = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie: 'dashboard.sid=invalid.session' },
    });
    expect(invalid.statusCode).toBe(401);
    expect(readSessionCookie(invalid.headers['set-cookie'])).toBeUndefined();
    expect(await app.redis.ttl(key)).toBeLessThanOrEqual(ttlInvalidBefore);
  });

  it('duas sessões do mesmo usuário renovam independentemente; health permanece público', async () => {
    await createActiveUser({ email: 'multi-mw@mw.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);

    const cookie1 = await loginAs(app, 'multi-mw@mw.test');
    const cookie2 = await loginAs(app, 'multi-mw@mw.test');
    expect(cookie1).not.toBe(cookie2);

    const ctx1 = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie: cookie1 },
    });
    const ctx2 = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie: cookie2 },
    });
    const key1 = await findSessionKey(ctx1.json().sessionId);
    const key2 = await findSessionKey(ctx2.json().sessionId);
    expect(key1).not.toBe(key2);

    await app.redis.expire(key1, 90);
    await app.redis.expire(key2, 90);

    await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie: cookie1 },
    });

    const ttl1 = await app.redis.ttl(key1);
    const ttl2 = await app.redis.ttl(key2);
    expect(ttl1).toBeGreaterThan(1000);
    expect(ttl2).toBeLessThanOrEqual(90);

    for (const url of ['/health', '/health/db', '/health/redis']) {
      const health = await app.inject({ method: 'GET', url });
      expect(health.statusCode).toBe(200);
      expect(health.headers['set-cookie']).toBeUndefined();
    }
  });
});
