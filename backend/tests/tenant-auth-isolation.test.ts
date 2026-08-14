import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
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

async function createUserForTenant(options: {
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  tenantStatus?: 'ACTIVE' | 'DISABLED';
}) {
  let tenantId: string | null = null;

  if (options.role === 'USER') {
    const tenant = await tenants.create({
      name: `tenant-${options.email}`,
      displayName: `Tenant ${options.email}`,
    });
    tenantId = tenant.id;

    if (options.tenantStatus === 'DISABLED') {
      await tenants.disable(tenant.id);
    }
  }

  const user = await users.create({
    name: options.email,
    email: options.email,
    role: options.role,
    tenantId,
    status: 'ACTIVE',
  });

  await credentials.create({
    userId: user.id,
    passwordHash: await passwordHasher.hash(VALID_PASSWORD),
  });

  return user;
}

describe('TENANT-003 e isolamento auth — tenant status', () => {
  it('USER com tenant ACTIVE autentica e acessa rota protegida', async () => {
    const user = await createUserForTenant({
      email: 'active-user@tenant.test',
      role: 'USER',
      tenantStatus: 'ACTIVE',
    });
    const app = await buildApp();
    apps.add(app);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'active-user@tenant.test', password: VALID_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const cookie = cookieValue(readSessionCookie(login.headers['set-cookie'])!);

    const protectedRoute = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie },
    });
    expect(protectedRoute.statusCode).toBe(200);
    expect(protectedRoute.json().tenantId).toBe(user.tenantId);
  });

  it('USER com tenant DISABLED falha no login e na rota protegida', async () => {
    await createUserForTenant({
      email: 'disabled-tenant@tenant.test',
      role: 'USER',
      tenantStatus: 'DISABLED',
    });
    const app = await buildApp();
    apps.add(app);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'disabled-tenant@tenant.test', password: VALID_PASSWORD },
    });
    expect(login.statusCode).toBe(401);

    // Simula sessão legada criada antes da desativação do tenant.
    const activeTenantUser = await createUserForTenant({
      email: 'legacy-session@tenant.test',
      role: 'USER',
      tenantStatus: 'ACTIVE',
    });
    const loginLegacy = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'legacy-session@tenant.test', password: VALID_PASSWORD },
    });
    const cookie = cookieValue(readSessionCookie(loginLegacy.headers['set-cookie'])!);
    await tenants.disable(activeTenantUser.tenantId!);

    const protectedRoute = await app.inject({
      method: 'GET',
      url: '/__test__/protected',
      headers: { cookie },
    });
    expect(protectedRoute.statusCode).toBe(401);
  });

  it('ADMIN e SUPER_ADMIN continuam sem tenant', async () => {
    await createUserForTenant({ email: 'admin@tenant.test', role: 'ADMIN' });
    await createUserForTenant({ email: 'super@tenant.test', role: 'SUPER_ADMIN' });
    const app = await buildApp();
    apps.add(app);

    for (const email of ['admin@tenant.test', 'super@tenant.test']) {
      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: VALID_PASSWORD },
      });
      expect(login.statusCode).toBe(200);
      const cookie = cookieValue(readSessionCookie(login.headers['set-cookie'])!);

      const me = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { cookie },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().user.tenantId).toBeNull();
    }
  });

  it('tenantId enviado pelo cliente não altera contexto autenticado', async () => {
    const tenantA = await tenants.create({ name: 'tenant-a', displayName: 'Tenant A' });
    const tenantB = await tenants.create({ name: 'tenant-b', displayName: 'Tenant B' });

    const userA = await users.create({
      name: 'User A',
      email: 'user-a@tenant.test',
      role: 'USER',
      tenantId: tenantA.id,
      status: 'ACTIVE',
    });
    await credentials.create({
      userId: userA.id,
      passwordHash: await passwordHasher.hash(VALID_PASSWORD),
    });

    const app = await buildApp();
    apps.add(app);

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user-a@tenant.test', password: VALID_PASSWORD },
    });
    const cookie = cookieValue(readSessionCookie(login.headers['set-cookie'])!);

    const protectedRoute = await app.inject({
      method: 'GET',
      url: `/__test__/protected?tenantId=${tenantB.id}`,
      headers: {
        cookie,
        'x-tenant-id': tenantB.id,
      },
    });

    expect(protectedRoute.statusCode).toBe(200);
    expect(protectedRoute.json().tenantId).toBe(tenantA.id);
    expect(protectedRoute.json().tenantId).not.toBe(tenantB.id);
  });
});
