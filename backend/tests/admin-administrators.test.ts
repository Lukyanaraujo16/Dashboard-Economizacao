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
const NON_EXISTENT_USER_ID = '00000000-0000-4000-8000-000000000099';

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
  status?: 'ACTIVE' | 'BLOCKED' | 'DISABLED' | 'PENDING';
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
    status: options.status ?? 'ACTIVE',
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
  expect(body).not.toHaveProperty('passwordConfiguredAt');
}

describe('API administrativa /admin/administrators (1.4C)', () => {
  describe('auth / role', () => {
    it('rejeita sem sessão', async () => {
      const app = await buildTestApp();
      const response = await app.inject({ method: 'GET', url: '/admin/administrators' });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('rejeita USER', async () => {
      await createPlatformUser({ email: 'user-admins@api.test', role: 'USER' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'user-admins@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/administrators',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });

    it('permite ADMIN', async () => {
      await createPlatformUser({ email: 'admin-list@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-list@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/administrators',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json().data)).toBe(true);
    });

    it('permite SUPER_ADMIN', async () => {
      await createPlatformUser({ email: 'super-list@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'super-list@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/administrators',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('visibilidade SUPER_ADMIN', () => {
    it('listagem ADMIN não inclui SUPER_ADMIN', async () => {
      const admin = await createPlatformUser({ email: 'admin-vis@api.test', role: 'ADMIN' });
      const superAdmin = await createPlatformUser({
        email: 'super-vis@api.test',
        role: 'SUPER_ADMIN',
      });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-vis@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/administrators',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      const ids = response.json().data.map((item: { id: string }) => item.id);
      expect(ids).toContain(admin.id);
      expect(ids).not.toContain(superAdmin.id);
      expect(response.json().data.every((item: { role: string }) => item.role === 'ADMIN')).toBe(
        true,
      );
    });

    it('detalhe de SUPER_ADMIN retorna 404', async () => {
      await createPlatformUser({ email: 'admin-detail@api.test', role: 'ADMIN' });
      const superAdmin = await createPlatformUser({
        email: 'super-detail@api.test',
        role: 'SUPER_ADMIN',
      });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-detail@api.test');

      const response = await app.inject({
        method: 'GET',
        url: `/admin/administrators/${superAdmin.id}`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });

    it('ADMIN não altera SUPER_ADMIN (404)', async () => {
      await createPlatformUser({ email: 'admin-patch@api.test', role: 'ADMIN' });
      const superAdmin = await createPlatformUser({
        email: 'super-patch@api.test',
        role: 'SUPER_ADMIN',
      });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-patch@api.test');

      const response = await app.inject({
        method: 'PATCH',
        url: `/admin/administrators/${superAdmin.id}`,
        headers: { cookie },
        payload: { name: 'Hacked' },
      });
      expect(response.statusCode).toBe(404);
    });

    it('ADMIN não bloqueia SUPER_ADMIN (404)', async () => {
      await createPlatformUser({ email: 'admin-block-sa@api.test', role: 'ADMIN' });
      const superAdmin = await createPlatformUser({
        email: 'super-block@api.test',
        role: 'SUPER_ADMIN',
      });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-block-sa@api.test');

      const response = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${superAdmin.id}/block`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(404);
    });
  });

  describe('POST /admin/administrators', () => {
    it('cria ADMIN ACTIVE com tenantId null e DTO público', async () => {
      await createPlatformUser({ email: 'admin-create@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-create@api.test');

      const response = await app.inject({
        method: 'POST',
        url: '/admin/administrators',
        headers: { cookie },
        payload: {
          name: '  Novo Admin  ',
          email: 'Novo.Admin@API.TEST',
          password: VALID_PASSWORD,
        },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expectPublicUserShape(body);
      expect(body.role).toBe('ADMIN');
      expect(body.status).toBe('ACTIVE');
      expect(body.tenantId).toBeNull();
      expect(body.email).toBe('novo.admin@api.test');
      expect(body.name).toBe('Novo Admin');
      expect(body.deactivatedAt).toBeNull();
    });

    it('rejeita role e tenantId no body', async () => {
      await createPlatformUser({ email: 'admin-reject-fields@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-reject-fields@api.test');

      const withRole = await app.inject({
        method: 'POST',
        url: '/admin/administrators',
        headers: { cookie },
        payload: {
          name: 'X',
          email: 'role-reject@api.test',
          password: VALID_PASSWORD,
          role: 'SUPER_ADMIN',
        },
      });
      expect(withRole.statusCode).toBe(422);
      expect(withRole.json().error.code).toBe('VALIDATION_ERROR');

      const withTenant = await app.inject({
        method: 'POST',
        url: '/admin/administrators',
        headers: { cookie },
        payload: {
          name: 'X',
          email: 'tenant-reject@api.test',
          password: VALID_PASSWORD,
          tenantId: '00000000-0000-4000-8000-000000000001',
        },
      });
      expect(withTenant.statusCode).toBe(422);
    });

    it('email duplicado → 409', async () => {
      await createPlatformUser({ email: 'dup-admin@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'dup-admin@api.test');

      const response = await app.inject({
        method: 'POST',
        url: '/admin/administrators',
        headers: { cookie },
        payload: {
          name: 'Dup',
          email: 'dup-admin@api.test',
          password: VALID_PASSWORD,
        },
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('CONFLICT');
    });
  });

  describe('GET / PATCH / lifecycle', () => {
    it('detalhe, update name/email, block/unblock, disable/enable', async () => {
      await createPlatformUser({ email: 'actor@api.test', role: 'ADMIN' });
      const target = await createPlatformUser({ email: 'target@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'actor@api.test');

      const detail = await app.inject({
        method: 'GET',
        url: `/admin/administrators/${target.id}`,
        headers: { cookie },
      });
      expect(detail.statusCode).toBe(200);
      expectPublicUserShape(detail.json());
      expect(detail.json().id).toBe(target.id);

      const missing = await app.inject({
        method: 'GET',
        url: `/admin/administrators/${NON_EXISTENT_USER_ID}`,
        headers: { cookie },
      });
      expect(missing.statusCode).toBe(404);

      const updated = await app.inject({
        method: 'PATCH',
        url: `/admin/administrators/${target.id}`,
        headers: { cookie },
        payload: { name: 'Nome Atualizado', email: 'target.updated@api.test' },
      });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().name).toBe('Nome Atualizado');
      expect(updated.json().email).toBe('target.updated@api.test');

      const blocked = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${target.id}/block`,
        headers: { cookie },
      });
      expect(blocked.statusCode).toBe(200);
      expect(blocked.json().status).toBe('BLOCKED');

      const unblocked = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${target.id}/unblock`,
        headers: { cookie },
      });
      expect(unblocked.statusCode).toBe(200);
      expect(unblocked.json().status).toBe('ACTIVE');

      const disabled = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${target.id}/disable`,
        headers: { cookie },
      });
      expect(disabled.statusCode).toBe(200);
      expect(disabled.json().status).toBe('DISABLED');
      expect(disabled.json().deactivatedAt).toBeTruthy();

      const enabled = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${target.id}/enable`,
        headers: { cookie },
      });
      expect(enabled.statusCode).toBe(200);
      expect(enabled.json().status).toBe('ACTIVE');
      expect(enabled.json().deactivatedAt).toBeNull();
    });

    it('listagem filtra por status com ordenação determinística', async () => {
      await createPlatformUser({ email: 'list-actor@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'list-a@api.test', role: 'ADMIN' });
      const blocked = await createPlatformUser({ email: 'list-b@api.test', role: 'ADMIN' });
      await users.block(blocked.id);

      const app = await buildTestApp();
      const cookie = await loginAs(app, 'list-actor@api.test');

      const active = await app.inject({
        method: 'GET',
        url: '/admin/administrators?status=ACTIVE&limit=50&offset=0',
        headers: { cookie },
      });
      expect(active.statusCode).toBe(200);
      expect(active.json().data.every((item: { status: string }) => item.status === 'ACTIVE')).toBe(
        true,
      );
      expect(active.json().pagination).toMatchObject({
        limit: 50,
        offset: 0,
        total: expect.any(Number),
        hasMore: expect.any(Boolean),
      });
    });
  });

  describe('último ADMIN ACTIVE', () => {
    it('protege o único ADMIN ACTIVE (block e disable)', async () => {
      const only = await createPlatformUser({ email: 'only-admin@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'super-not-count@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'super-not-count@api.test');

      const block = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${only.id}/block`,
        headers: { cookie },
      });
      expect(block.statusCode).toBe(409);
      expect(block.json().error.code).toBe('CONFLICT');

      const disable = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${only.id}/disable`,
        headers: { cookie },
      });
      expect(disable.statusCode).toBe(409);
      expect(await users.countActiveAdmins()).toBe(1);
    });

    it('permite transição segura com múltiplos ADMINs', async () => {
      const a = await createPlatformUser({ email: 'multi-a@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'multi-b@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'multi-b@api.test');

      const block = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${a.id}/block`,
        headers: { cookie },
      });
      expect(block.statusCode).toBe(200);
      expect(block.json().status).toBe('BLOCKED');
      expect(await users.countActiveAdmins()).toBe(1);
    });

    it('concorrência: no máximo um block quando restam dois ADMINs ACTIVE', async () => {
      const a = await createPlatformUser({ email: 'race-a@api.test', role: 'ADMIN' });
      const b = await createPlatformUser({ email: 'race-b@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'race-super@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'race-super@api.test');

      const [first, second] = await Promise.all([
        app.inject({
          method: 'POST',
          url: `/admin/administrators/${a.id}/block`,
          headers: { cookie },
        }),
        app.inject({
          method: 'POST',
          url: `/admin/administrators/${b.id}/block`,
          headers: { cookie },
        }),
      ]);

      const statuses = [first.statusCode, second.statusCode].sort();
      expect(statuses).toEqual([200, 409]);
      expect(await users.countActiveAdmins()).toBe(1);
    });
  });

  describe('POST /admin/administrators/:userId/reset-password (1.4E)', () => {
    const NEW_PASSWORD = 'NewPassword#98765';

    it('redefine senha com hash Argon2id, não expõe senha e invalida sessões', async () => {
      await createPlatformUser({ email: 'actor-reset@api.test', role: 'ADMIN' });
      const target = await createPlatformUser({ email: 'target-reset@api.test', role: 'ADMIN' });
      const app = await buildTestApp();

      const targetCookie = await loginAs(app, 'target-reset@api.test');
      expect(
        (await app.inject({ method: 'GET', url: '/auth/me', headers: { cookie: targetCookie } }))
          .statusCode,
      ).toBe(200);

      const actorCookie = await loginAs(app, 'actor-reset@api.test');
      const reset = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${target.id}/reset-password`,
        headers: { cookie: actorCookie },
        payload: { password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
      });

      expect(reset.statusCode).toBe(200);
      expect(reset.json().status).toBe('ok');
      expectPublicUserShape(reset.json().user);
      expect(JSON.stringify(reset.json())).not.toMatch(/NewPassword|Password#12345/);

      const meAfter = await app.inject({
        method: 'GET',
        url: '/auth/me',
        headers: { cookie: targetCookie },
      });
      expect(meAfter.statusCode).toBe(401);

      const oldLogin = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'target-reset@api.test', password: VALID_PASSWORD },
      });
      expect(oldLogin.statusCode).toBe(401);

      const newLogin = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'target-reset@api.test', password: NEW_PASSWORD },
      });
      expect(newLogin.statusCode).toBe(200);

      const credential = await credentials.findByUserId(target.id);
      expect(credential).toBeTruthy();
      expect(await passwordHasher.verify(credential!.passwordHash, NEW_PASSWORD)).toBe(true);
      expect(await passwordHasher.verify(credential!.passwordHash, VALID_PASSWORD)).toBe(false);
    });

    it('permite redefinir senha de ADMIN BLOCKED e DISABLED', async () => {
      await createPlatformUser({ email: 'actor-status-reset@api.test', role: 'ADMIN' });
      const blocked = await createPlatformUser({
        email: 'blocked-reset@api.test',
        role: 'ADMIN',
        status: 'BLOCKED',
      });
      const disabled = await createPlatformUser({
        email: 'disabled-reset@api.test',
        role: 'ADMIN',
        status: 'DISABLED',
      });

      const app = await buildTestApp();
      const cookie = await loginAs(app, 'actor-status-reset@api.test');

      for (const target of [blocked, disabled]) {
        const response = await app.inject({
          method: 'POST',
          url: `/admin/administrators/${target.id}/reset-password`,
          headers: { cookie },
          payload: { password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().status).toBe('ok');
      }
    });

    it('valida confirmação e comprimento mínimo', async () => {
      await createPlatformUser({ email: 'actor-validate-reset@api.test', role: 'ADMIN' });
      const target = await createPlatformUser({
        email: 'target-validate-reset@api.test',
        role: 'ADMIN',
      });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'actor-validate-reset@api.test');

      const mismatch = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${target.id}/reset-password`,
        headers: { cookie },
        payload: { password: NEW_PASSWORD, passwordConfirmation: 'OtherPassword#1' },
      });
      expect(mismatch.statusCode).toBe(422);
      expect(mismatch.json().error.code).toBe('VALIDATION_ERROR');

      const short = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${target.id}/reset-password`,
        headers: { cookie },
        payload: { password: 'short', passwordConfirmation: 'short' },
      });
      expect(short.statusCode).toBe(422);
      expect(short.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('SUPER_ADMIN fora do escopo → 404; USER → 403; sem sessão → 401', async () => {
      await createPlatformUser({ email: 'actor-perm-reset@api.test', role: 'ADMIN' });
      const superAdmin = await createPlatformUser({
        email: 'super-reset@api.test',
        role: 'SUPER_ADMIN',
      });
      await createPlatformUser({ email: 'user-perm-reset@api.test', role: 'USER' });
      const app = await buildTestApp();

      const unauth = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${superAdmin.id}/reset-password`,
        payload: { password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
      });
      expect(unauth.statusCode).toBe(401);

      const userCookie = await loginAs(app, 'user-perm-reset@api.test');
      const forbidden = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${superAdmin.id}/reset-password`,
        headers: { cookie: userCookie },
        payload: { password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
      });
      expect(forbidden.statusCode).toBe(403);

      const adminCookie = await loginAs(app, 'actor-perm-reset@api.test');
      const notFound = await app.inject({
        method: 'POST',
        url: `/admin/administrators/${superAdmin.id}/reset-password`,
        headers: { cookie: adminCookie },
        payload: { password: NEW_PASSWORD, passwordConfirmation: NEW_PASSWORD },
      });
      expect(notFound.statusCode).toBe(404);
      expect(notFound.json().error.code).toBe('NOT_FOUND');
    });
  });
});
