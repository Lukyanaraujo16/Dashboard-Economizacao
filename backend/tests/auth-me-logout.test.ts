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
  SESSION_TTL_SECONDS,
} from '../src/modules/auth/config/session-config.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';

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
  process.env.DATABASE_URL =
    process.env.DATABASE_URL ??
    'postgresql://dashboard_dev:dashboard_dev@127.0.0.1:5432/dashboard_economizacao_dev';
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
  await prisma.userCredential.deleteMany();
  await prisma.user.deleteMany();
  await prisma.tenant.deleteMany();
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

function isClearCookie(setCookie: string): boolean {
  const lower = setCookie.toLowerCase();
  if (!lower.includes(`${SESSION_COOKIE_NAME.toLowerCase()}=`)) {
    return false;
  }
  if (lower.includes('max-age=0')) {
    return true;
  }
  const expires = /expires=([^;]+)/i.exec(setCookie);
  if (!expires?.[1]) {
    return false;
  }
  return new Date(expires[1]).getTime() <= Date.now();
}

async function createActiveUser(options: {
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  name?: string;
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
    name: options.name ?? options.email,
    email: options.email,
    role: options.role,
    tenantId,
    status: 'ACTIVE',
  });

  await credentials.create({
    userId: user.id,
    passwordHash: await passwordHasher.hash(VALID_PASSWORD),
  });

  return (await users.findById(user.id))!;
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

describe('GET /auth/me (1.1F-E.3)', () => {
  it('sem sessão → 401 UNAUTHENTICATED', async () => {
    const app = await buildApp();
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/auth/me' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('sessão válida USER → 200 com campos públicos e tenantId', async () => {
    const user = await createActiveUser({
      email: 'me.user@session.test',
      role: 'USER',
      name: 'Usuário Me',
    });
    const app = await buildApp();
    apps.add(app);
    const cookie = await loginAs(app, 'me.user@session.test');

    const response = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      user: {
        id: user.id,
        name: 'Usuário Me',
        email: 'me.user@session.test',
        role: 'USER',
        tenantId: user.tenantId,
      },
    });

    const bodyText = response.body;
    expect(bodyText).not.toContain('passwordHash');
    expect(bodyText).not.toContain('$argon2');
    expect(bodyText).not.toContain('failedLoginAttempts');
    expect(bodyText).not.toContain('lockedUntil');
    expect(bodyText).not.toContain('sessionId');
    expect(bodyText).not.toContain(TEST_AUTH_SECRET);
  });

  it('ADMIN e SUPER_ADMIN retornam tenantId null', async () => {
    await createActiveUser({ email: 'me.admin@session.test', role: 'ADMIN' });
    await createActiveUser({ email: 'me.super@session.test', role: 'SUPER_ADMIN' });
    const app = await buildApp();
    apps.add(app);

    for (const email of ['me.admin@session.test', 'me.super@session.test'] as const) {
      const cookie = await loginAs(app, email);
      const response = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(response.json().user.tenantId).toBeNull();
      expect(['ADMIN', 'SUPER_ADMIN']).toContain(response.json().user.role);
    }
  });

  it('sliding inactivity renova cookie e TTL Redis via /me', async () => {
    await createActiveUser({ email: 'me.slide@session.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);
    const cookie = await loginAs(app, 'me.slide@session.test');

    const before = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie },
    });
    const sessionId = before.json().sessionId as string;
    const key = `${buildSessionKeyPrefix('test')}${sessionId}`;
    const ttlBefore = await app.redis.ttl(key);
    expect(ttlBefore).toBeGreaterThan(0);
    expect(ttlBefore).toBeLessThanOrEqual(SESSION_TTL_SECONDS);

    await new Promise((resolve) => setTimeout(resolve, 25));

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(200);
    const renewed = readSessionCookie(me.headers['set-cookie']);
    expect(renewed).toBeTruthy();
    assertSessionCookieShape(renewed!);

    const ttlAfter = await app.redis.ttl(key);
    expect(ttlAfter).toBeGreaterThan(0);
    expect(ttlAfter).toBeLessThanOrEqual(SESSION_TTL_SECONDS);
    expect(ttlAfter).toBeGreaterThanOrEqual(ttlBefore - 2);
  });
});

function assertSessionCookieShape(setCookie: string): void {
  expect(setCookie.startsWith(`${SESSION_COOKIE_NAME}=`)).toBe(true);
  expect(setCookie.toLowerCase()).toContain('httponly');
  expect(setCookie.toLowerCase()).toContain('samesite=lax');
  expect(setCookie).toContain('Path=/');
}

describe('POST /auth/logout (1.1F-E.3)', () => {
  it('sessão válida → 200, remove Redis, limpa cookie e invalida acesso', async () => {
    await createActiveUser({ email: 'logout.ok@session.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);
    const cookie = await loginAs(app, 'logout.ok@session.test');

    const context = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie },
    });
    const sessionId = context.json().sessionId as string;
    const key = `${buildSessionKeyPrefix('test')}${sessionId}`;
    expect(await app.redis.exists(key)).toBe(1);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie },
    });
    expect(logout.statusCode).toBe(200);
    expect(logout.json()).toEqual({ status: 'ok' });
    expect(logout.body).not.toContain(TEST_AUTH_SECRET);
    expect(logout.body).not.toContain('password');

    const cleared =
      readSessionCookie(logout.headers['set-cookie']) ??
      (Array.isArray(logout.headers['set-cookie'])
        ? logout.headers['set-cookie'].find((value) => value.includes(SESSION_COOKIE_NAME))
        : logout.headers['set-cookie']);
    expect(cleared).toBeTruthy();
    expect(isClearCookie(cleared!)).toBe(true);
    expect(await app.redis.exists(key)).toBe(0);

    const me = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie },
    });
    expect(me.statusCode).toBe(401);
  });

  it('outra sessão do mesmo usuário permanece válida', async () => {
    await createActiveUser({ email: 'logout.multi@session.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);

    const cookieA = await loginAs(app, 'logout.multi@session.test');
    const cookieB = await loginAs(app, 'logout.multi@session.test');
    expect(cookieA).not.toBe(cookieB);

    const logout = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: cookieA },
    });
    expect(logout.statusCode).toBe(200);

    const meA = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieA },
    });
    expect(meA.statusCode).toBe(401);

    const meB = await app.inject({
      method: 'GET',
      url: '/auth/me',
      headers: { cookie: cookieB },
    });
    expect(meB.statusCode).toBe(200);
    expect(meB.json().user.email).toBe('logout.multi@session.test');
  });

  it('logout sem sessão / sessão expirada permanece 200 (idempotente)', async () => {
    const app = await buildApp();
    apps.add(app);

    const anonymous = await app.inject({ method: 'POST', url: '/auth/logout' });
    expect(anonymous.statusCode).toBe(200);
    expect(anonymous.json()).toEqual({ status: 'ok' });

    const invalid = await app.inject({
      method: 'POST',
      url: '/auth/logout',
      headers: { cookie: `${SESSION_COOKIE_NAME}=invalid.session.value` },
    });
    expect(invalid.statusCode).toBe(200);
    expect(invalid.json()).toEqual({ status: 'ok' });
  });
});
