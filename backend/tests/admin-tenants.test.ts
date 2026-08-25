import { randomUUID } from 'node:crypto';

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

describe('API administrativa /admin/tenants (1.2C)', () => {
  describe('auth / role', () => {
    it('rejeita sem sessão', async () => {
      const app = await buildTestApp();
      const response = await app.inject({ method: 'GET', url: '/admin/tenants' });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('rejeita USER', async () => {
      await createPlatformUser({ email: 'user-admin@api.test', role: 'USER' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'user-admin@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/tenants',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });

    it('permite ADMIN', async () => {
      await createPlatformUser({ email: 'admin-api@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-api@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/tenants',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expect(Array.isArray(response.json().data)).toBe(true);
    });

    it('permite SUPER_ADMIN', async () => {
      await createPlatformUser({ email: 'super-api@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'super-api@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/tenants',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('POST /admin/tenants', () => {
    it('cria tenant válido com status ACTIVE', async () => {
      await createPlatformUser({ email: 'admin-create@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-create@api.test');

      const response = await app.inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { cookie },
        payload: { name: 'Acme Corp', displayName: '  Acme Ltda  ' },
      });

      expect(response.statusCode).toBe(201);
      const body = response.json();
      expect(body.name).toBe('acme-corp');
      expect(body.displayName).toBe('Acme Ltda');
      expect(body.status).toBe('ACTIVE');
      expect(body.deactivatedAt).toBeNull();
      expect(body.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
    });

    it('rejeita name duplicado com CONFLICT', async () => {
      await createPlatformUser({ email: 'admin-dup@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-dup@api.test');

      await app.inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { cookie },
        payload: { name: 'dup-co', displayName: 'Dup' },
      });

      const duplicate = await app.inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { cookie },
        payload: { name: 'Dup Co', displayName: 'Outra' },
      });

      expect(duplicate.statusCode).toBe(409);
      expect(duplicate.json().error.code).toBe('CONFLICT');
    });

    it('rejeita payload inválido com 422', async () => {
      await createPlatformUser({ email: 'admin-invalid@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-invalid@api.test');

      const response = await app.inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { cookie },
        payload: { name: '', displayName: 'X' },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });

    it('rejeita campos extras no payload', async () => {
      await createPlatformUser({ email: 'admin-extra@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-extra@api.test');

      const response = await app.inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { cookie },
        payload: {
          name: 'extra-co',
          displayName: 'Extra',
          id: randomUUID(),
          status: 'DISABLED',
        },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.details?.some((d: { field: string }) => d.field === 'id')).toBe(
        true,
      );
    });
  });

  describe('GET /admin/tenants', () => {
    it('lista com ordenação determinística e paginação', async () => {
      await tenants.create({ name: 'zulu', displayName: 'Zulu' });
      await tenants.create({ name: 'alpha', displayName: 'Alpha' });
      await createPlatformUser({ email: 'admin-list@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-list@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/tenants?limit=1&offset=0',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.data).toHaveLength(1);
      expect(body.data[0].displayName).toBe('Alpha');
      expect(body.pagination).toEqual({
        limit: 1,
        offset: 0,
        total: 2,
        hasMore: true,
      });
    });

    it('filtra ACTIVE e DISABLED', async () => {
      const active = await tenants.create({ name: 'active-list', displayName: 'Active List' });
      const disabled = await tenants.create({
        name: 'disabled-list',
        displayName: 'Disabled List',
      });
      await tenants.disable(disabled.id);

      await createPlatformUser({ email: 'admin-filter@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-filter@api.test');

      const activeOnly = await app.inject({
        method: 'GET',
        url: '/admin/tenants?status=ACTIVE',
        headers: { cookie },
      });
      expect(activeOnly.json().data.every((t: { status: string }) => t.status === 'ACTIVE')).toBe(
        true,
      );
      expect(activeOnly.json().data.some((t: { id: string }) => t.id === active.id)).toBe(true);
      expect(activeOnly.json().data.some((t: { id: string }) => t.id === disabled.id)).toBe(false);

      const disabledOnly = await app.inject({
        method: 'GET',
        url: '/admin/tenants?status=DISABLED',
        headers: { cookie },
      });
      expect(
        disabledOnly.json().data.every((t: { status: string }) => t.status === 'DISABLED'),
      ).toBe(true);
      expect(disabledOnly.json().data.some((t: { id: string }) => t.id === disabled.id)).toBe(true);
    });

    it('inclui resumo operacional da Conta Azul sem secrets', async () => {
      await tenants.create({ name: 'ops-none', displayName: 'Ops None' });
      const connected = await tenants.create({ name: 'ops-ok', displayName: 'Ops Ok' });
      const never = await tenants.create({ name: 'ops-never', displayName: 'Ops Never' });
      const errored = await tenants.create({ name: 'ops-err', displayName: 'Ops Err' });
      const disconnected = await tenants.create({ name: 'ops-off', displayName: 'Ops Off' });
      const syncedAt = new Date('2026-08-25T12:15:00.000Z');

      await prisma.integration.create({
        data: {
          tenantId: connected.id,
          provider: 'CONTA_AZUL',
          status: 'CONNECTED',
          lastSuccessfulSyncAt: syncedAt,
        },
      });
      await prisma.integration.create({
        data: {
          tenantId: never.id,
          provider: 'CONTA_AZUL',
          status: 'CONNECTED',
          lastSuccessfulSyncAt: null,
        },
      });
      await prisma.integration.create({
        data: {
          tenantId: errored.id,
          provider: 'CONTA_AZUL',
          status: 'ERROR',
          lastErrorCode: 'refresh_failed',
          lastErrorAt: new Date('2026-08-25T11:00:00.000Z'),
        },
      });
      await prisma.integration.create({
        data: {
          tenantId: disconnected.id,
          provider: 'CONTA_AZUL',
          status: 'DISCONNECTED',
        },
      });

      await createPlatformUser({ email: 'admin-ops-list@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'super-ops-list@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();

      for (const email of ['admin-ops-list@api.test', 'super-ops-list@api.test']) {
        const cookie = await loginAs(app, email);
        const response = await app.inject({
          method: 'GET',
          url: '/admin/tenants?limit=20',
          headers: { cookie },
        });

        expect(response.statusCode).toBe(200);
        const byName = Object.fromEntries(
          (response.json().data as Array<{ name: string; integration: unknown }>).map((row) => [
            row.name,
            row,
          ]),
        );

        expect(byName['ops-none']?.integration).toBeNull();
        expect(byName['ops-ok']?.integration).toEqual({
          status: 'CONNECTED',
          lastSuccessfulSyncAt: syncedAt.toISOString(),
        });
        expect(byName['ops-never']?.integration).toEqual({
          status: 'CONNECTED',
          lastSuccessfulSyncAt: null,
        });
        expect(byName['ops-err']?.integration).toEqual({
          status: 'ERROR',
          lastSuccessfulSyncAt: null,
        });
        expect(byName['ops-off']?.integration).toEqual({
          status: 'DISCONNECTED',
          lastSuccessfulSyncAt: null,
        });

        const serialized = JSON.stringify(response.json());
        expect(serialized).not.toMatch(/encryptedAccessToken|encryptedRefreshToken|clientSecret|Bearer /);
        expect(Object.keys(byName['ops-ok'] as object).sort()).toEqual([
          'createdAt',
          'deactivatedAt',
          'displayName',
          'id',
          'integration',
          'name',
          'status',
          'updatedAt',
        ]);
        expect(Object.keys((byName['ops-ok'] as { integration: object }).integration).sort()).toEqual(
          ['lastSuccessfulSyncAt', 'status'],
        );
      }
    });
  });

  describe('GET /admin/tenants/:tenantId', () => {
    it('retorna 200 para tenant existente', async () => {
      const tenant = await tenants.create({ name: 'detail-co', displayName: 'Detail' });
      await createPlatformUser({ email: 'admin-detail@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-detail@api.test');

      const response = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().id).toBe(tenant.id);
    });

    it('retorna 404 para tenant inexistente', async () => {
      await createPlatformUser({ email: 'admin-missing@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-missing@api.test');

      const response = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${NON_EXISTENT_TENANT_ID}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });
  });

  describe('PATCH /admin/tenants/:tenantId', () => {
    it('atualiza name e displayName', async () => {
      const tenant = await tenants.create({ name: 'patch-old', displayName: 'Old' });
      await createPlatformUser({ email: 'admin-patch@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-patch@api.test');

      const response = await app.inject({
        method: 'PATCH',
        url: `/admin/tenants/${tenant.id}`,
        headers: { cookie },
        payload: { name: ' New Patch ', displayName: '  New Display  ' },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().name).toBe('new-patch');
      expect(response.json().displayName).toBe('New Display');
    });

    it('rejeita conflito de name', async () => {
      await tenants.create({ name: 'taken-name', displayName: 'Taken' });
      const tenant = await tenants.create({ name: 'patch-target', displayName: 'Target' });
      await createPlatformUser({ email: 'admin-patch-conflict@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-patch-conflict@api.test');

      const response = await app.inject({
        method: 'PATCH',
        url: `/admin/tenants/${tenant.id}`,
        headers: { cookie },
        payload: { name: 'Taken Name' },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('CONFLICT');
    });

    it('não permite alterar status diretamente', async () => {
      const tenant = await tenants.create({ name: 'no-status-patch', displayName: 'No Status' });
      await createPlatformUser({ email: 'admin-no-status@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-no-status@api.test');

      const response = await app.inject({
        method: 'PATCH',
        url: `/admin/tenants/${tenant.id}`,
        headers: { cookie },
        payload: { status: 'DISABLED' },
      });

      expect(response.statusCode).toBe(422);
      expect(
        response.json().error.details?.some((d: { field: string }) => d.field === 'status'),
      ).toBe(true);
    });
  });

  describe('POST disable / reactivate', () => {
    it('disable: ACTIVE → DISABLED com deactivatedAt', async () => {
      const tenant = await tenants.create({ name: 'disable-me', displayName: 'Disable Me' });
      await createPlatformUser({ email: 'admin-disable@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-disable@api.test');

      const response = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/disable`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('DISABLED');
      expect(response.json().deactivatedAt).toBeTruthy();
    });

    it('disable novamente retorna CONFLICT', async () => {
      const tenant = await tenants.create({ name: 'disable-twice', displayName: 'Twice' });
      await tenants.disable(tenant.id);
      await createPlatformUser({ email: 'admin-disable-twice@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-disable-twice@api.test');

      const response = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/disable`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('CONFLICT');
    });

    it('USER perde acesso protegido após disable via API', async () => {
      const tenant = await tenants.create({ name: 'user-disable-flow', displayName: 'User Flow' });
      const user = await createPlatformUser({
        email: 'user-disable-flow@api.test',
        role: 'USER',
        tenantId: tenant.id,
      });
      await createPlatformUser({ email: 'admin-user-disable@api.test', role: 'ADMIN' });
      const app = await buildTestApp();

      const userCookie = await loginAs(app, 'user-disable-flow@api.test');
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/__test__/protected',
            headers: { cookie: userCookie },
          })
        ).statusCode,
      ).toBe(200);

      const adminCookie = await loginAs(app, 'admin-user-disable@api.test');
      await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/disable`,
        headers: { cookie: adminCookie },
      });

      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/__test__/protected',
            headers: { cookie: userCookie },
          })
        ).statusCode,
      ).toBe(401);

      expect(user.tenantId).toBe(tenant.id);
    });

    it('reactivate: DISABLED → ACTIVE com deactivatedAt null', async () => {
      const tenant = await tenants.create({ name: 'reactivate-me', displayName: 'Reactivate' });
      await tenants.disable(tenant.id);
      await createPlatformUser({ email: 'admin-reactivate@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-reactivate@api.test');

      const response = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/reactivate`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().status).toBe('ACTIVE');
      expect(response.json().deactivatedAt).toBeNull();
    });

    it('reactivate em tenant ACTIVE retorna CONFLICT', async () => {
      const tenant = await tenants.create({ name: 'already-active', displayName: 'Active' });
      await createPlatformUser({ email: 'admin-reactivate-twice@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-reactivate-twice@api.test');

      const response = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/reactivate`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('CONFLICT');
    });

    it('USER recupera contexto após reactivate', async () => {
      const tenant = await tenants.create({
        name: 'user-reactivate-flow',
        displayName: 'Reactivate Flow',
      });
      await createPlatformUser({
        email: 'user-reactivate-flow@api.test',
        role: 'USER',
        tenantId: tenant.id,
      });
      await createPlatformUser({ email: 'admin-user-reactivate@api.test', role: 'ADMIN' });
      const app = await buildTestApp();

      const userCookie = await loginAs(app, 'user-reactivate-flow@api.test');
      const adminCookie = await loginAs(app, 'admin-user-reactivate@api.test');

      await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/disable`,
        headers: { cookie: adminCookie },
      });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/__test__/protected',
            headers: { cookie: userCookie },
          })
        ).statusCode,
      ).toBe(401);

      await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/reactivate`,
        headers: { cookie: adminCookie },
      });
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/__test__/protected',
            headers: { cookie: userCookie },
          })
        ).statusCode,
      ).toBe(200);
    });
  });

  describe('segurança e contrato', () => {
    it('não expõe campos internos do Prisma', async () => {
      const tenant = await tenants.create({ name: 'public-dto', displayName: 'Public' });
      await createPlatformUser({ email: 'admin-public@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-public@api.test');

      const response = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}`,
        headers: { cookie },
      });

      const keys = Object.keys(response.json()).sort();
      expect(keys).toEqual([
        'createdAt',
        'deactivatedAt',
        'displayName',
        'id',
        'integration',
        'name',
        'status',
        'updatedAt',
      ]);
      expect(response.json().integration).toBeNull();
    });

    it('tenantId no body não altera operação de criação', async () => {
      await createPlatformUser({ email: 'admin-body-id@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-body-id@api.test');

      const fakeId = randomUUID();
      const response = await app.inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { cookie },
        payload: { name: 'body-id-co', displayName: 'Body ID', tenantId: fakeId },
      });

      expect(response.statusCode).toBe(422);
    });

    it('ADMIN e SUPER_ADMIN permanecem com tenantId null', async () => {
      await createPlatformUser({ email: 'admin-null-tenant@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'super-null-tenant@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();

      for (const email of ['admin-null-tenant@api.test', 'super-null-tenant@api.test']) {
        const cookie = await loginAs(app, email);
        await app.inject({
          method: 'POST',
          url: '/admin/tenants',
          headers: { cookie },
          payload: { name: `co-${email}`, displayName: 'Co' },
        });

        const me = await app.inject({
          method: 'GET',
          url: '/auth/me',
          headers: { cookie },
        });
        expect(me.json().user.tenantId).toBeNull();
      }
    });

    it('tenantId inválido retorna 422', async () => {
      await createPlatformUser({ email: 'admin-bad-uuid@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-bad-uuid@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/tenants/not-a-uuid',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(422);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('DELETE /admin/tenants/:tenantId', () => {
    it('rejeita sem sessão', async () => {
      const tenant = await tenants.create({ name: 'delete-unauth', displayName: 'Delete Unauth' });
      const app = await buildTestApp();

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${tenant.id}`,
      });

      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('rejeita USER', async () => {
      const tenant = await tenants.create({ name: 'delete-user', displayName: 'Delete User' });
      await createPlatformUser({ email: 'user-delete@api.test', role: 'USER' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'user-delete@api.test');

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${tenant.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });

    it('ADMIN exclui tenant sem usuários vinculados', async () => {
      await createPlatformUser({ email: 'admin-delete@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-delete@api.test');

      const created = await app.inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { cookie },
        payload: { name: 'delete-me', displayName: 'Delete Me' },
      });
      const tenantId = created.json().id as string;

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${tenantId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(await tenants.findById(tenantId)).toBeNull();
    });

    it('SUPER_ADMIN exclui tenant sem usuários vinculados', async () => {
      await createPlatformUser({ email: 'super-delete@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'super-delete@api.test');

      const created = await app.inject({
        method: 'POST',
        url: '/admin/tenants',
        headers: { cookie },
        payload: { name: 'delete-super', displayName: 'Delete Super' },
      });
      const tenantId = created.json().id as string;

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${tenantId}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
    });

    it('tenant inexistente retorna 404', async () => {
      await createPlatformUser({ email: 'admin-delete-404@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-delete-404@api.test');

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${NON_EXISTENT_TENANT_ID}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });

    it('exclusão remove apenas tenant alvo', async () => {
      await createPlatformUser({ email: 'admin-delete-scope@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-delete-scope@api.test');

      const keep = await tenants.create({ name: 'keep-co', displayName: 'Keep Co' });
      const remove = await tenants.create({ name: 'remove-co', displayName: 'Remove Co' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${remove.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(204);
      expect(await tenants.findById(remove.id)).toBeNull();
      expect(await tenants.findById(keep.id)).not.toBeNull();
    });

    it('bloqueia exclusão com usuários vinculados', async () => {
      const tenant = await tenants.create({ name: 'has-users', displayName: 'Has Users' });
      await createPlatformUser({
        email: 'user-linked@api.test',
        role: 'USER',
        tenantId: tenant.id,
      });
      await createPlatformUser({ email: 'admin-delete-block@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-delete-block@api.test');

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${tenant.id}`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('CONFLICT');
      expect(await tenants.findById(tenant.id)).not.toBeNull();
    });

    it('tenantId no body não altera alvo da exclusão', async () => {
      await createPlatformUser({ email: 'admin-delete-body@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-delete-body@api.test');

      const target = await tenants.create({ name: 'target-co', displayName: 'Target Co' });
      const decoy = await tenants.create({ name: 'decoy-co', displayName: 'Decoy Co' });

      const response = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${target.id}`,
        headers: { cookie },
        payload: { tenantId: decoy.id },
      });

      expect(response.statusCode).toBe(204);
      expect(await tenants.findById(target.id)).toBeNull();
      expect(await tenants.findById(decoy.id)).not.toBeNull();
    });
  });
});
