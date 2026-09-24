import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { createAdvisorSettingsRepository } from '../src/modules/advisor/repositories/advisor-settings.repository.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const users = createUserRepository(prisma);
const credentials = createUserCredentialRepository(prisma);
const settings = createAdvisorSettingsRepository(prisma);
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

describe('independência do produto quando a IA está degradada', () => {
  it('Consultor DISABLED não derruba GET /dashboard/overview nem GET /reports/revenue', async () => {
    const tenant = await tenants.create({
      name: 'ia-disabled',
      displayName: 'IA desligada',
    });
    const user = await users.create({
      name: 'user-ia-disabled',
      email: 'ia-disabled@api.test',
      role: 'USER',
      tenantId: tenant.id,
      status: 'ACTIVE',
    });
    await credentials.create({
      userId: user.id,
      passwordHash: await passwordHasher.hash(VALID_PASSWORD),
    });
    await settings.upsertSettings(tenant.id, { provider: 'OPENAI', status: 'DISABLED' });

    const app = await buildTestApp();
    const cookie = await loginAs(app, user.email);

    const consultant = await app.inject({
      method: 'GET',
      url: '/consultant/status',
      headers: { cookie },
    });
    expect(consultant.statusCode).toBe(200);
    expect(consultant.json()).toEqual({ status: 'DISABLED' });

    const overview = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie },
    });
    expect(overview.statusCode).toBe(200);

    const revenue = await app.inject({
      method: 'GET',
      url: '/reports/revenue?from=2026-08&to=2026-08',
      headers: { cookie },
    });
    expect(revenue.statusCode).toBe(200);
  });
});
