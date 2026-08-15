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
const NON_EXISTENT_TENANT_ID = '00000000-0000-4000-8000-000000000099';
const NON_EXISTENT_USER_ID = '00000000-0000-4000-8000-000000000098';

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
  await users.setPasswordConfiguredAt(user.id);

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

function expectPublicUserShape(body: Record<string, unknown>) {
  expect(body).toMatchObject({
    id: expect.any(String),
    name: expect.any(String),
    email: expect.any(String),
    role: expect.any(String),
    status: expect.any(String),
    createdAt: expect.any(String),
    updatedAt: expect.any(String),
  });
  expect(body).not.toHaveProperty('passwordHash');
  expect(body).not.toHaveProperty('credential');
  expect(body).not.toHaveProperty('failedLoginAttempts');
  expect(body).not.toHaveProperty('lockedUntil');
}

describe('API administrativa /admin/tenants/:tenantId/users (1.4C)', () => {
  describe('auth / role', () => {
    it('rejeita sem sessão', async () => {
      const tenant = await tenants.create({ name: 'auth-tenant', displayName: 'Auth' });
      const app = await buildTestApp();
      const response = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/users`,
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejeita USER', async () => {
      const tenant = await tenants.create({ name: 'user-deny', displayName: 'Deny' });
      await createPlatformUser({
        email: 'tenant-user-deny@api.test',
        role: 'USER',
        tenantId: tenant.id,
      });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'tenant-user-deny@api.test');

      const response = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/users`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
    });

    it('permite ADMIN e SUPER_ADMIN', async () => {
      const tenant = await tenants.create({ name: 'allow-tenant', displayName: 'Allow' });
      await createPlatformUser({ email: 'admin-tu@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'super-tu@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();

      for (const email of ['admin-tu@api.test', 'super-tu@api.test']) {
        const cookie = await loginAs(app, email);
        const response = await app.inject({
          method: 'GET',
          url: `/admin/tenants/${tenant.id}/users`,
          headers: { cookie },
        });
        expect(response.statusCode).toBe(200);
      }
    });
  });

  describe('CRUD e isolamento', () => {
    it('lista somente USER do tenant; não lista ADMIN/SUPER_ADMIN', async () => {
      const tenantA = await tenants.create({ name: 'tenant-a', displayName: 'A' });
      const tenantB = await tenants.create({ name: 'tenant-b', displayName: 'B' });
      const userA = await createPlatformUser({
        email: 'user-a@api.test',
        role: 'USER',
        tenantId: tenantA.id,
      });
      await createPlatformUser({
        email: 'user-b@api.test',
        role: 'USER',
        tenantId: tenantB.id,
      });
      await createPlatformUser({ email: 'admin-not-listed@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'super-not-listed@api.test', role: 'SUPER_ADMIN' });

      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-not-listed@api.test');

      const response = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenantA.id}/users`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const ids = response.json().data.map((item: { id: string }) => item.id);
      expect(ids).toEqual([userA.id]);
      expect(response.json().data.every((item: { role: string }) => item.role === 'USER')).toBe(
        true,
      );
    });

    it('cria USER no tenant da rota com DTO público', async () => {
      const tenant = await tenants.create({ name: 'create-tu', displayName: 'Create' });
      await createPlatformUser({ email: 'admin-create-tu@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-create-tu@api.test');

      const response = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/users`,
        headers: { cookie },
        payload: {
          name: '  Usuário Empresa  ',
          email: 'User.Empresa@API.TEST',
          password: VALID_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expectPublicUserShape(body);
      expect(body.role).toBe('USER');
      expect(body.status).toBe('ACTIVE');
      expect(body.tenantId).toBe(tenant.id);
      expect(body.email).toBe('user.empresa@api.test');
      expect(body.name).toBe('Usuário Empresa');
    });

    it('rejeita role e tenantId no body', async () => {
      const tenant = await tenants.create({ name: 'reject-fields', displayName: 'Reject' });
      await createPlatformUser({ email: 'admin-reject-tu@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-reject-tu@api.test');

      const withRole = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/users`,
        headers: { cookie },
        payload: {
          name: 'X',
          email: 'role-body@api.test',
          password: VALID_PASSWORD,
          role: 'ADMIN',
        },
      });
      expect(withRole.statusCode).toBe(422);

      const withTenant = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/users`,
        headers: { cookie },
        payload: {
          name: 'X',
          email: 'tenant-body@api.test',
          password: VALID_PASSWORD,
          tenantId: NON_EXISTENT_TENANT_ID,
        },
      });
      expect(withTenant.statusCode).toBe(422);
    });

    it('user de outro tenant → 404; detalhe/update/lifecycle no tenant correto', async () => {
      const tenantA = await tenants.create({ name: 'iso-a', displayName: 'Iso A' });
      const tenantB = await tenants.create({ name: 'iso-b', displayName: 'Iso B' });
      const userA = await createPlatformUser({
        email: 'iso-user-a@api.test',
        role: 'USER',
        tenantId: tenantA.id,
      });
      const userB = await createPlatformUser({
        email: 'iso-user-b@api.test',
        role: 'USER',
        tenantId: tenantB.id,
      });
      await createPlatformUser({ email: 'admin-iso@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-iso@api.test');

      const cross = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenantA.id}/users/${userB.id}`,
        headers: { cookie },
      });
      expect(cross.statusCode).toBe(404);

      const detail = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenantA.id}/users/${userA.id}`,
        headers: { cookie },
      });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().id).toBe(userA.id);

      const updated = await app.inject({
        method: 'PATCH',
        url: `/admin/tenants/${tenantA.id}/users/${userA.id}`,
        headers: { cookie },
        payload: { name: 'Nome Iso', email: 'iso-user-a.updated@api.test' },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().name).toBe('Nome Iso');
      expect(updated.json().email).toBe('iso-user-a.updated@api.test');

      const blocked = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenantA.id}/users/${userA.id}/block`,
        headers: { cookie },
      });
      expect(blocked.statusCode).toBe(200);
      expect(blocked.json().status).toBe('BLOCKED');

      const unblocked = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenantA.id}/users/${userA.id}/unblock`,
        headers: { cookie },
      });
      expect(unblocked.statusCode).toBe(200);
      expect(unblocked.json().status).toBe('ACTIVE');

      const disabled = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenantA.id}/users/${userA.id}/disable`,
        headers: { cookie },
      });
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json().status).toBe('DISABLED');

      const enabled = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenantA.id}/users/${userA.id}/enable`,
        headers: { cookie },
      });
      expect(enabled.statusCode).toBe(200);
      expect(enabled.json().status).toBe('ACTIVE');

      const missingUser = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenantA.id}/users/${NON_EXISTENT_USER_ID}`,
        headers: { cookie },
      });
      expect(missingUser.statusCode).toBe(404);
    });

    it('email duplicado → 409; tenant inexistente → 404', async () => {
      const tenant = await tenants.create({ name: 'dup-tu', displayName: 'Dup' });
      await createPlatformUser({
        email: 'dup-user@api.test',
        role: 'USER',
        tenantId: tenant.id,
      });
      await createPlatformUser({ email: 'admin-dup-tu@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-dup-tu@api.test');

      const duplicate = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/users`,
        headers: { cookie },
        payload: {
          name: 'Dup',
          email: 'dup-user@api.test',
          password: VALID_PASSWORD,
        },
      });
      expect(duplicate.statusCode).toBe(409);

      const missingTenant = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${NON_EXISTENT_TENANT_ID}/users`,
        headers: { cookie },
      });
      expect(missingTenant.statusCode).toBe(404);
    });
  });

  describe('tenant DISABLED + TENANT-003', () => {
    it('permite administrar usuários de tenant DISABLED; login do USER continua bloqueado', async () => {
      const tenant = await tenants.create({ name: 'disabled-tu', displayName: 'Disabled' });
      await tenants.disable(tenant.id);
      await createPlatformUser({ email: 'admin-disabled-tu@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-disabled-tu@api.test');

      const created = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/users`,
        headers: { cookie },
        payload: {
          name: 'User Disabled Tenant',
          email: 'user-disabled-tenant@api.test',
          password: VALID_PASSWORD,
        },
      });
      expect(created.statusCode).toBe(201);
      expect(created.json().tenantId).toBe(tenant.id);
      expect(created.json().status).toBe('ACTIVE');

      const list = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/users`,
        headers: { cookie },
      });
      expect(list.statusCode).toBe(200);
      expect(
        list
          .json()
          .data.some((item: { email: string }) => item.email === 'user-disabled-tenant@api.test'),
      ).toBe(true);

      const login = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: {
          email: 'user-disabled-tenant@api.test',
          password: VALID_PASSWORD,
        },
      });
      expect(login.statusCode).toBe(401);
      expect(login.json().error.code).toBe('UNAUTHENTICATED');
    });
  });
});
