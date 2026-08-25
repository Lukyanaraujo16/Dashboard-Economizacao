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
  createPlatformBrandingRepository,
  createStoredFileRepository,
  createTenantBrandingRepository,
} from '../src/modules/branding/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const branding = createTenantBrandingRepository(prisma);
const platformBranding = createPlatformBrandingRepository(prisma);
const files = createStoredFileRepository(prisma);
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

describe('GET /branding/current (1.3F)', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/branding/current' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('USER com tenant ACTIVE e branding retorna scope tenant', async () => {
    const tenant = await tenants.create({
      name: 'runtime-tenant-a',
      displayName: 'Acme Runtime',
    });
    const stored = await files.create({
      tenantId: tenant.id,
      fileType: 'TENANT_LOGO',
      storageKey: 'tenants/runtime-tenant-a/logo.png',
      mimeType: 'image/png',
      size: 64,
      checksum: 'abc',
    });
    await branding.upsert(tenant.id, {
      lightColors: { primary: '#141452', accent: '#F2C200' },
      darkColors: { primary: '#9A9AD4', onPrimary: '#0A0A12' },
    });
    await branding.setLogo(tenant.id, stored.id);
    await createPlatformUser({
      email: 'user-branded@runtime.test',
      role: 'USER',
      tenantId: tenant.id,
    });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-branded@runtime.test');
    const response = await app.inject({
      method: 'GET',
      url: '/branding/current',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toEqual({
      scope: 'tenant',
      tenantId: tenant.id,
      name: 'Acme Runtime',
      logoUrl: `/files/${stored.id}`,
      iconUrl: null,
      faviconUrl: null,
      light: { primary: '#141452', accent: '#F2C200' },
      dark: { primary: '#9A9AD4', onPrimary: '#0A0A12' },
      updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
    });
    expect(body).not.toHaveProperty('storageKey');
    expect(body).not.toHaveProperty('logoFileId');
    expect(body).not.toHaveProperty('id');
    expect(JSON.stringify(body)).not.toContain('tenants/runtime-tenant-a');
  });

  it('USER com tenant ACTIVE sem branding usa displayName e overrides null', async () => {
    const tenant = await tenants.create({
      name: 'runtime-empty',
      displayName: 'Empresa Sem Branding',
    });
    await createPlatformUser({
      email: 'user-empty@runtime.test',
      role: 'USER',
      tenantId: tenant.id,
    });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-empty@runtime.test');
    const response = await app.inject({
      method: 'GET',
      url: '/branding/current',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scope: 'tenant',
      tenantId: tenant.id,
      name: 'Empresa Sem Branding',
      logoUrl: null,
      iconUrl: null,
      faviconUrl: null,
      light: null,
      dark: null,
      updatedAt: null,
    });
  });

  it('USER de tenant A não recebe branding de tenant B', async () => {
    const tenantA = await tenants.create({ name: 'iso-a', displayName: 'Tenant A' });
    const tenantB = await tenants.create({ name: 'iso-b', displayName: 'Tenant B' });
    await branding.upsert(tenantA.id, { lightColors: { primary: '#111111' } });
    await branding.upsert(tenantB.id, { lightColors: { primary: '#222222' } });
    await createPlatformUser({
      email: 'user-a@runtime.test',
      role: 'USER',
      tenantId: tenantA.id,
    });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-a@runtime.test');
    const response = await app.inject({
      method: 'GET',
      url: '/branding/current',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.tenantId).toBe(tenantA.id);
    expect(body.name).toBe('Tenant A');
    expect(body.light).toEqual({ primary: '#111111' });
    expect(body.light).not.toEqual({ primary: '#222222' });
  });

  it('USER com tenant DISABLED perde contexto autenticado', async () => {
    const tenant = await tenants.create({
      name: 'runtime-disabled',
      displayName: 'Disabled Co',
    });
    await branding.upsert(tenant.id, { lightColors: { primary: '#ABCDEF' } });
    await createPlatformUser({
      email: 'user-disabled@runtime.test',
      role: 'USER',
      tenantId: tenant.id,
    });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-disabled@runtime.test');
    await tenants.disable(tenant.id);

    const response = await app.inject({
      method: 'GET',
      url: '/branding/current',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('logo ausente retorna logoUrl null sem erro', async () => {
    const tenant = await tenants.create({
      name: 'runtime-nologo',
      displayName: 'Sem Logo',
    });
    await branding.upsert(tenant.id, {
      lightColors: { primary: '#141452' },
    });
    await createPlatformUser({
      email: 'user-nologo@runtime.test',
      role: 'USER',
      tenantId: tenant.id,
    });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-nologo@runtime.test');
    const response = await app.inject({
      method: 'GET',
      url: '/branding/current',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().logoUrl).toBeNull();
    expect(response.json().light).toEqual({ primary: '#141452' });
  });

  it('ADMIN recebe branding de plataforma', async () => {
    await createPlatformUser({ email: 'admin@runtime.test', role: 'ADMIN' });
    const tenant = await tenants.create({ name: 'ignored', displayName: 'Ignored Tenant' });
    await branding.upsert(tenant.id, { lightColors: { primary: '#FF0000' } });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'admin@runtime.test');
    const response = await app.inject({
      method: 'GET',
      url: '/branding/current',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scope: 'platform',
      tenantId: null,
      name: 'Economização',
      logoUrl: null,
      iconUrl: null,
      faviconUrl: null,
      light: null,
      dark: null,
      updatedAt: null,
    });
  });

  it('SUPER_ADMIN recebe branding de plataforma', async () => {
    await createPlatformUser({ email: 'super@runtime.test', role: 'SUPER_ADMIN' });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'super@runtime.test');
    const response = await app.inject({
      method: 'GET',
      url: '/branding/current',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scope: 'platform',
      tenantId: null,
      name: 'Economização',
      logoUrl: null,
      iconUrl: null,
      faviconUrl: null,
      light: null,
      dark: null,
      updatedAt: null,
    });
  });

  it('GET /branding/platform é público e retorna identidade da plataforma', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/branding/platform' });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      scope: 'platform',
      tenantId: null,
      name: 'Economização',
      logoUrl: null,
      iconUrl: null,
      faviconUrl: null,
      light: null,
      dark: null,
      updatedAt: null,
    });
  });

  it('logo do tenant não preenche iconUrl; ícone cai para a plataforma', async () => {
    const tenant = await tenants.create({
      name: 'runtime-logo-only',
      displayName: 'Logo Only Co',
    });
    const tenantLogo = await files.create({
      tenantId: tenant.id,
      fileType: 'TENANT_LOGO',
      storageKey: `tenants/${tenant.id}/branding/${tenant.id}.png`,
      mimeType: 'image/png',
      size: 32,
      checksum: 'logo-only',
    });
    await branding.upsert(tenant.id, {});
    await branding.setLogo(tenant.id, tenantLogo.id);

    await platformBranding.upsert({ name: 'Economização' });
    const platformIcon = await files.create({
      fileType: 'PLATFORM_ICON',
      storageKey: 'platform/branding/icon.png',
      mimeType: 'image/png',
      size: 16,
      checksum: 'plat-icon',
    });
    await platformBranding.attachIcon(platformIcon.id);

    await createPlatformUser({
      email: 'user-logo-only@runtime.test',
      role: 'USER',
      tenantId: tenant.id,
    });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-logo-only@runtime.test');
    const response = await app.inject({
      method: 'GET',
      url: '/branding/current',
      headers: { cookie },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().logoUrl).toBe(`/files/${tenantLogo.id}`);
    expect(response.json().iconUrl).toBe(`/files/${platformIcon.id}`);
    expect(response.json().iconUrl).not.toBe(response.json().logoUrl);
  });

  it('ícone do tenant prevalece sobre o ícone da plataforma', async () => {
    const tenant = await tenants.create({
      name: 'runtime-icon-own',
      displayName: 'Own Icon Co',
    });
    await branding.upsert(tenant.id, {});
    const tenantIcon = await files.create({
      tenantId: tenant.id,
      fileType: 'TENANT_ICON',
      storageKey: `tenants/${tenant.id}/branding/icon/${tenant.id}.png`,
      mimeType: 'image/png',
      size: 20,
      checksum: 'tenant-icon',
    });
    await branding.setIcon(tenant.id, tenantIcon.id);

    await platformBranding.upsert({ name: 'Economização' });
    const platformIcon = await files.create({
      fileType: 'PLATFORM_ICON',
      storageKey: 'platform/branding/icon-plat.png',
      mimeType: 'image/png',
      size: 16,
      checksum: 'plat-icon-2',
    });
    await platformBranding.attachIcon(platformIcon.id);

    await createPlatformUser({
      email: 'user-own-icon@runtime.test',
      role: 'USER',
      tenantId: tenant.id,
    });

    const app = await buildTestApp();
    const cookie = await loginAs(app, 'user-own-icon@runtime.test');
    const body = (
      await app.inject({
        method: 'GET',
        url: '/branding/current',
        headers: { cookie },
      })
    ).json();

    expect(body.iconUrl).toBe(`/files/${tenantIcon.id}`);
    expect(body.iconUrl).not.toBe(`/files/${platformIcon.id}`);
  });
});
