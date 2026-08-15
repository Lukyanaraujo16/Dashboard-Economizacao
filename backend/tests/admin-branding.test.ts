import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { createTenantBrandingRepository } from '../src/modules/branding/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';
const NON_EXISTENT_TENANT_ID = '00000000-0000-4000-8000-000000000099';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const branding = createTenantBrandingRepository(prisma);
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

async function createTenant(name: string, displayName: string) {
  return tenants.create({ name, displayName });
}

function brandingUrl(tenantId: string) {
  return `/admin/tenants/${tenantId}/branding`;
}

describe('API administrativa /admin/tenants/:tenantId/branding (1.3C)', () => {
  describe('auth / role', () => {
    it('rejeita sem sessão', async () => {
      const tenant = await createTenant('auth-brand', 'Auth Brand');
      const app = await buildTestApp();

      const response = await app.inject({ method: 'GET', url: brandingUrl(tenant.id) });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('rejeita USER', async () => {
      const tenant = await createTenant('user-brand', 'User Brand');
      await createPlatformUser({ email: 'user-brand@api.test', role: 'USER', tenantId: tenant.id });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'user-brand@api.test');

      const response = await app.inject({
        method: 'GET',
        url: brandingUrl(tenant.id),
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });

    it('permite ADMIN', async () => {
      const tenant = await createTenant('admin-brand', 'Admin Brand');
      await createPlatformUser({ email: 'admin-brand@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-brand@api.test');

      const response = await app.inject({
        method: 'GET',
        url: brandingUrl(tenant.id),
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
    });

    it('permite SUPER_ADMIN', async () => {
      const tenant = await createTenant('super-brand', 'Super Brand');
      await createPlatformUser({ email: 'super-brand@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'super-brand@api.test');

      const response = await app.inject({
        method: 'GET',
        url: brandingUrl(tenant.id),
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
    });
  });

  describe('GET /admin/tenants/:tenantId/branding', () => {
    it('retorna ausência de branding sem materializar defaults da plataforma', async () => {
      const tenant = await createTenant('empty-brand', 'Empty Brand');
      await createPlatformUser({ email: 'get-empty@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'get-empty@api.test');

      const response = await app.inject({
        method: 'GET',
        url: brandingUrl(tenant.id),
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body).toEqual({
        tenantId: tenant.id,
        logoUrl: null,
        light: null,
        dark: null,
        createdAt: null,
        updatedAt: null,
      });
      expect(body).not.toHaveProperty('primary');
      expect(body).not.toHaveProperty('danger');
    });

    it('retorna branding persistido', async () => {
      const tenant = await createTenant('with-brand', 'With Brand');
      await branding.upsert(tenant.id, {
        lightColors: { primary: '#141452', accent: '#F2C200' },
        darkColors: { primary: '#9A9AD4' },
      });
      await createPlatformUser({ email: 'get-brand@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'get-brand@api.test');

      const response = await app.inject({
        method: 'GET',
        url: brandingUrl(tenant.id),
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.tenantId).toBe(tenant.id);
      expect(body.light).toEqual({ primary: '#141452', accent: '#F2C200' });
      expect(body.dark).toEqual({ primary: '#9A9AD4' });
      expect(body.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
      expect(body.updatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('retorna 404 para tenant inexistente', async () => {
      await createPlatformUser({ email: 'get-missing@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'get-missing@api.test');

      const response = await app.inject({
        method: 'GET',
        url: brandingUrl(NON_EXISTENT_TENANT_ID),
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });

    it('Tenant A não retorna branding de Tenant B', async () => {
      const tenantA = await createTenant('brand-a', 'Brand A');
      const tenantB = await createTenant('brand-b', 'Brand B');
      await branding.upsert(tenantA.id, { lightColors: { primary: '#111111' } });
      await createPlatformUser({ email: 'iso-get@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'iso-get@api.test');

      const response = await app.inject({
        method: 'GET',
        url: brandingUrl(tenantB.id),
        headers: { cookie },
      });

      expect(response.json().light).toBeNull();
    });

    it('permite branding de tenant DISABLED', async () => {
      const tenant = await createTenant('disabled-brand', 'Disabled Brand');
      await tenants.disable(tenant.id);
      await createPlatformUser({ email: 'disabled-brand@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'disabled-brand@api.test');

      const response = await app.inject({
        method: 'PATCH',
        url: brandingUrl(tenant.id),
        headers: { cookie },
        payload: { light: { primary: '#141452' } },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().light).toEqual({ primary: '#141452' });
    });
  });

  describe('PATCH /admin/tenants/:tenantId/branding', () => {
    async function patchAsAdmin(
      app: Awaited<ReturnType<typeof buildApp>>,
      tenantId: string,
      payload: unknown,
      email = 'patch-admin@api.test',
    ) {
      const cookie = await loginAs(app, email);
      return app.inject({
        method: 'PATCH',
        url: brandingUrl(tenantId),
        headers: { cookie },
        payload,
      });
    }

    beforeEach(async () => {
      await createPlatformUser({ email: 'patch-admin@api.test', role: 'ADMIN' });
    });

    it('salva light, dark e ambos com merge parcial', async () => {
      const tenant = await createTenant('patch-merge', 'Patch Merge');
      const app = await buildTestApp();

      const lightOnly = await patchAsAdmin(app, tenant.id, { light: { primary: '#141452' } });
      expect(lightOnly.statusCode).toBe(200);
      expect(lightOnly.json().light).toEqual({ primary: '#141452' });
      expect(lightOnly.json().dark).toBeNull();

      const darkOnly = await patchAsAdmin(app, tenant.id, { dark: { accent: '#F2C200' } });
      expect(darkOnly.json().light).toEqual({ primary: '#141452' });
      expect(darkOnly.json().dark).toEqual({ accent: '#F2C200' });

      const merged = await patchAsAdmin(app, tenant.id, {
        light: { secondary: '#2D2D74' },
        dark: { primary: '#9A9AD4' },
      });
      expect(merged.json().light).toEqual({ primary: '#141452', secondary: '#2D2D74' });
      expect(merged.json().dark).toEqual({ accent: '#F2C200', primary: '#9A9AD4' });
    });

    it('aceita tokens allowlisted válidos', async () => {
      const tenant = await createTenant('patch-tokens', 'Patch Tokens');
      const app = await buildTestApp();

      const response = await patchAsAdmin(app, tenant.id, {
        light: {
          primary: '#141452',
          onPrimary: '#FFFFFF',
          secondary: '#2D2D74',
          accent: '#F2C200',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().light).toEqual({
        primary: '#141452',
        onPrimary: '#FFFFFF',
        secondary: '#2D2D74',
        accent: '#F2C200',
      });
    });

    it('normaliza hex para uppercase', async () => {
      const tenant = await createTenant('patch-hex', 'Patch Hex');
      const app = await buildTestApp();

      const response = await patchAsAdmin(app, tenant.id, {
        light: { primary: '#abcdef' },
      });

      expect(response.json().light.primary).toBe('#ABCDEF');
    });

    it('rejeita token protegido, chave desconhecida, hex inválido e campos extras', async () => {
      const tenant = await createTenant('patch-invalid', 'Patch Invalid');
      const app = await buildTestApp();

      for (const token of ['danger', 'success', 'warning', 'info', 'background', 'textPrimary']) {
        const response = await patchAsAdmin(app, tenant.id, { light: { [token]: '#141452' } });
        expect(response.statusCode).toBe(422);
        expect(response.json().error.code).toBe('VALIDATION_ERROR');
      }

      const unknown = await patchAsAdmin(app, tenant.id, { light: { unknown: '#141452' } });
      expect(unknown.statusCode).toBe(422);

      const invalidHex = await patchAsAdmin(app, tenant.id, { light: { primary: 'rgb(0,0,0)' } });
      expect(invalidHex.statusCode).toBe(422);

      const extra = await patchAsAdmin(app, tenant.id, {
        light: { primary: '#141452' },
        extra: true,
      });
      expect(extra.statusCode).toBe(422);
    });

    it('rejeita body malformado com 400', async () => {
      const tenant = await createTenant('patch-bad-body', 'Patch Bad Body');
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'patch-admin@api.test');

      const response = await app.inject({
        method: 'PATCH',
        url: brandingUrl(tenant.id),
        headers: { cookie },
        payload: null,
      });

      expect(response.statusCode).toBe(400);
    });

    it('rejeita payload vazio', async () => {
      const tenant = await createTenant('patch-empty', 'Patch Empty');
      const app = await buildTestApp();

      const response = await patchAsAdmin(app, tenant.id, {});
      expect(response.statusCode).toBe(422);
    });

    it('retorna 404 para tenant inexistente', async () => {
      const app = await buildTestApp();
      const response = await patchAsAdmin(app, NON_EXISTENT_TENANT_ID, {
        light: { primary: '#141452' },
      });
      expect(response.statusCode).toBe(404);
    });

    it('não altera branding de outro tenant', async () => {
      const tenantA = await createTenant('patch-a', 'Patch A');
      const tenantB = await createTenant('patch-b', 'Patch B');
      const app = await buildTestApp();

      await patchAsAdmin(app, tenantA.id, { light: { primary: '#111111' } });
      const responseB = await patchAsAdmin(app, tenantB.id, { light: { primary: '#222222' } });

      expect(responseB.json().light.primary).toBe('#222222');
      const storedA = await branding.findByTenantId(tenantA.id);
      expect(storedA?.lightColors?.primary).toBe('#111111');
    });

    it('não expõe campos internos do Prisma', async () => {
      const tenant = await createTenant('patch-dto', 'Patch DTO');
      const app = await buildTestApp();

      const response = await patchAsAdmin(app, tenant.id, { light: { primary: '#141452' } });
      const body = response.json();

      expect(body).not.toHaveProperty('id');
      expect(body).not.toHaveProperty('lightColors');
      expect(body).not.toHaveProperty('darkColors');
      expect(body).not.toHaveProperty('danger');
    });
  });

  describe('DELETE /admin/tenants/:tenantId/branding', () => {
    it('reset remove branding e mantém tenant', async () => {
      const tenant = await createTenant('reset-brand', 'Reset Brand');
      await branding.upsert(tenant.id, { lightColors: { primary: '#141452' } });
      await createPlatformUser({ email: 'reset-admin@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'reset-admin@api.test');

      const deleted = await app.inject({
        method: 'DELETE',
        url: brandingUrl(tenant.id),
        headers: { cookie },
      });
      expect(deleted.statusCode).toBe(204);

      expect(await branding.findByTenantId(tenant.id)).toBeNull();
      expect(await tenants.findById(tenant.id)).not.toBeNull();

      const getAfterReset = await app.inject({
        method: 'GET',
        url: brandingUrl(tenant.id),
        headers: { cookie },
      });
      expect(getAfterReset.json()).toEqual({
        tenantId: tenant.id,
        logoUrl: null,
        light: null,
        dark: null,
        createdAt: null,
        updatedAt: null,
      });
    });

    it('reset é idempotente quando branding já está ausente', async () => {
      const tenant = await createTenant('reset-idempotent', 'Reset Idempotent');
      await createPlatformUser({ email: 'reset-idem@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'reset-idem@api.test');

      const first = await app.inject({
        method: 'DELETE',
        url: brandingUrl(tenant.id),
        headers: { cookie },
      });
      const second = await app.inject({
        method: 'DELETE',
        url: brandingUrl(tenant.id),
        headers: { cookie },
      });

      expect(first.statusCode).toBe(204);
      expect(second.statusCode).toBe(204);
    });

    it('reset de tenant A não afeta tenant B', async () => {
      const tenantA = await createTenant('reset-a', 'Reset A');
      const tenantB = await createTenant('reset-b', 'Reset B');
      await branding.upsert(tenantA.id, { lightColors: { primary: '#111111' } });
      await branding.upsert(tenantB.id, { lightColors: { primary: '#222222' } });
      await createPlatformUser({ email: 'reset-iso@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'reset-iso@api.test');

      await app.inject({
        method: 'DELETE',
        url: brandingUrl(tenantA.id),
        headers: { cookie },
      });

      const storedB = await branding.findByTenantId(tenantB.id);
      expect(storedB?.lightColors?.primary).toBe('#222222');
    });

    it('retorna 404 para tenant inexistente', async () => {
      await createPlatformUser({ email: 'reset-missing@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'reset-missing@api.test');

      const response = await app.inject({
        method: 'DELETE',
        url: brandingUrl(NON_EXISTENT_TENANT_ID),
        headers: { cookie },
      });

      expect(response.statusCode).toBe(404);
    });
  });
});
