import { access } from 'node:fs/promises';
import path from 'node:path';

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
import {
  buildMultipartPayload,
  PNG_1X1,
  SVG_FIXTURE,
  WEBP_FIXTURE,
} from './helpers/image-fixtures.js';
import { cleanTestDatabase } from './helpers/test-database.js';
import { cleanTestStorage } from './helpers/test-storage.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const tenantBranding = createTenantBrandingRepository(prisma);
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
  await cleanTestStorage();
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

function expectPublicDto(body: Record<string, unknown>) {
  expect(Object.keys(body).sort()).toEqual(
    ['createdAt', 'dark', 'faviconUrl', 'iconUrl', 'light', 'logoUrl', 'name', 'updatedAt'].sort(),
  );
  expect(body).not.toHaveProperty('singletonKey');
  expect(body).not.toHaveProperty('storageKey');
  expect(body).not.toHaveProperty('checksum');
  expect(body).not.toHaveProperty('logoFileId');
  expect(body).not.toHaveProperty('iconFileId');
  expect(body).not.toHaveProperty('faviconFileId');
}

describe('API administrativa /admin/platform/branding (1.5C)', () => {
  describe('auth / role', () => {
    it('sem sessão → 401; USER → 403; ADMIN e SUPER_ADMIN permitidos', async () => {
      await createPlatformUser({ email: 'plat-user@api.test', role: 'USER' });
      await createPlatformUser({ email: 'plat-admin@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'plat-super@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();

      expect(
        (await app.inject({ method: 'GET', url: '/admin/platform/branding' })).statusCode,
      ).toBe(401);

      const userCookie = await loginAs(app, 'plat-user@api.test');
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/admin/platform/branding',
            headers: { cookie: userCookie },
          })
        ).statusCode,
      ).toBe(403);

      const adminCookie = await loginAs(app, 'plat-admin@api.test');
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/admin/platform/branding',
            headers: { cookie: adminCookie },
          })
        ).statusCode,
      ).toBe(200);

      const superCookie = await loginAs(app, 'plat-super@api.test');
      expect(
        (
          await app.inject({
            method: 'GET',
            url: '/admin/platform/branding',
            headers: { cookie: superCookie },
          })
        ).statusCode,
      ).toBe(200);
    });
  });

  describe('GET / PATCH', () => {
    it('GET sem config retorna nulls sem materializar defaults', async () => {
      await createPlatformUser({ email: 'plat-get@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'plat-get@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/platform/branding',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(200);
      expectPublicDto(response.json());
      expect(response.json()).toEqual({
        name: null,
        logoUrl: null,
        iconUrl: null,
        faviconUrl: null,
        light: null,
        dark: null,
        createdAt: null,
        updatedAt: null,
      });
      expect(await prisma.platformBranding.count()).toBe(0);
    });

    it('PATCH cria/atualiza name e cores com merge parcial', async () => {
      await createPlatformUser({ email: 'plat-patch@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'plat-patch@api.test');

      const created = await app.inject({
        method: 'PATCH',
        url: '/admin/platform/branding',
        headers: { cookie },
        payload: {
          name: '  Economização  ',
          light: { primary: '#141452' },
        },
      });
      expect(created.statusCode).toBe(200);
      expect(created.json().name).toBe('Economização');
      expect(created.json().light).toEqual({ primary: '#141452' });

      const merged = await app.inject({
        method: 'PATCH',
        url: '/admin/platform/branding',
        headers: { cookie },
        payload: {
          light: { accent: '#F2C200' },
          dark: { primary: '#EEEEEE' },
        },
      });
      expect(merged.statusCode).toBe(200);
      expect(merged.json().light).toEqual({ primary: '#141452', accent: '#F2C200' });
      expect(merged.json().dark).toEqual({ primary: '#EEEEEE' });
      expect(await prisma.platformBranding.count()).toBe(1);
    });

    it('PATCH rejeita token proibido, hex inválido, campo extra e name vazio', async () => {
      await createPlatformUser({ email: 'plat-validate@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'plat-validate@api.test');

      await app.inject({
        method: 'PATCH',
        url: '/admin/platform/branding',
        headers: { cookie },
        payload: { name: 'Economização' },
      });

      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/admin/platform/branding',
            headers: { cookie },
            payload: { light: { danger: '#FF0000' } },
          })
        ).statusCode,
      ).toBe(422);

      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/admin/platform/branding',
            headers: { cookie },
            payload: { light: { primary: 'red' } },
          })
        ).statusCode,
      ).toBe(422);

      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/admin/platform/branding',
            headers: { cookie },
            payload: { logoFileId: 'x' },
          })
        ).statusCode,
      ).toBe(422);

      expect(
        (
          await app.inject({
            method: 'PATCH',
            url: '/admin/platform/branding',
            headers: { cookie },
            payload: { name: '   ' },
          })
        ).statusCode,
      ).toBe(422);
    });
  });

  describe('logo / icon / favicon', () => {
    it('upload logo cria PLATFORM_LOGO com tenantId null e serve via /files', async () => {
      await createPlatformUser({ email: 'plat-logo@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'plat-logo@api.test');
      const multipart = buildMultipartPayload({ body: PNG_1X1 });

      const upload = await app.inject({
        method: 'POST',
        url: '/admin/platform/branding/logo',
        headers: { cookie, 'content-type': multipart.contentType },
        payload: multipart.payload,
      });
      expect(upload.statusCode).toBe(200);
      expect(upload.json().logoUrl).toMatch(/^\/files\//);
      expect(upload.json()).not.toHaveProperty('storageKey');

      const fileId = String(upload.json().logoUrl).replace('/files/', '');
      const stored = await files.findById(fileId);
      expect(stored?.fileType).toBe('PLATFORM_LOGO');
      expect(stored?.tenantId).toBeNull();
      expect(stored?.storageKey.startsWith('platform/branding/logo/')).toBe(true);

      const served = await app.inject({ method: 'GET', url: `/files/${fileId}` });
      expect(served.statusCode).toBe(200);
      expect(served.headers['x-content-type-options']).toBe('nosniff');
    });

    it('substitui logo e remove o anterior; delete é idempotente', async () => {
      await createPlatformUser({ email: 'plat-logo-replace@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'plat-logo-replace@api.test');

      const first = await app.inject({
        method: 'POST',
        url: '/admin/platform/branding/logo',
        headers: {
          cookie,
          'content-type': buildMultipartPayload({ body: PNG_1X1 }).contentType,
        },
        payload: buildMultipartPayload({ body: PNG_1X1 }).payload,
      });
      const firstId = String(first.json().logoUrl).replace('/files/', '');
      const firstKey = (await files.findById(firstId))!.storageKey;

      const second = await app.inject({
        method: 'POST',
        url: '/admin/platform/branding/logo',
        headers: {
          cookie,
          'content-type': buildMultipartPayload({ body: WEBP_FIXTURE, mimeType: 'image/webp' })
            .contentType,
        },
        payload: buildMultipartPayload({
          body: WEBP_FIXTURE,
          mimeType: 'image/webp',
          filename: 'logo.webp',
        }).payload,
      });
      const secondId = String(second.json().logoUrl).replace('/files/', '');
      expect(secondId).not.toBe(firstId);
      expect(await files.findById(firstId)).toBeNull();

      const storageRoot = process.env.TEST_STORAGE_PATH!;
      await expect(access(path.join(storageRoot, firstKey))).rejects.toThrow();

      const del = await app.inject({
        method: 'DELETE',
        url: '/admin/platform/branding/logo',
        headers: { cookie },
      });
      expect(del.statusCode).toBe(204);
      expect((await platformBranding.get())?.logoFileId).toBeNull();

      const delAgain = await app.inject({
        method: 'DELETE',
        url: '/admin/platform/branding/logo',
        headers: { cookie },
      });
      expect(delAgain.statusCode).toBe(204);
    });

    it('upload favicon (PNG/JPEG/WebP) cria PLATFORM_FAVICON; SVG rejeitado', async () => {
      await createPlatformUser({ email: 'plat-fav@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'plat-fav@api.test');

      const upload = await app.inject({
        method: 'POST',
        url: '/admin/platform/branding/favicon',
        headers: {
          cookie,
          'content-type': buildMultipartPayload({
            fieldName: 'favicon',
            filename: 'favicon.png',
            body: PNG_1X1,
          }).contentType,
        },
        payload: buildMultipartPayload({
          fieldName: 'favicon',
          filename: 'favicon.png',
          body: PNG_1X1,
        }).payload,
      });
      expect(upload.statusCode).toBe(200);
      const fileId = String(upload.json().faviconUrl).replace('/files/', '');
      const stored = await files.findById(fileId);
      expect(stored?.fileType).toBe('PLATFORM_FAVICON');
      expect(stored?.tenantId).toBeNull();
      expect(stored?.storageKey.startsWith('platform/branding/favicon/')).toBe(true);

      const svg = await app.inject({
        method: 'POST',
        url: '/admin/platform/branding/favicon',
        headers: {
          cookie,
          'content-type': buildMultipartPayload({
            fieldName: 'favicon',
            filename: 'x.svg',
            mimeType: 'image/svg+xml',
            body: SVG_FIXTURE,
          }).contentType,
        },
        payload: buildMultipartPayload({
          fieldName: 'favicon',
          filename: 'x.svg',
          mimeType: 'image/svg+xml',
          body: SVG_FIXTURE,
        }).payload,
      });
      expect(svg.statusCode).toBe(422);

      const del = await app.inject({
        method: 'DELETE',
        url: '/admin/platform/branding/favicon',
        headers: { cookie },
      });
      expect(del.statusCode).toBe(204);
    });

    it('upload ícone cria PLATFORM_ICON independente da logo; SVG rejeitado', async () => {
      await createPlatformUser({ email: 'plat-icon@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'plat-icon@api.test');

      const logo = await app.inject({
        method: 'POST',
        url: '/admin/platform/branding/logo',
        headers: {
          cookie,
          'content-type': buildMultipartPayload({ body: PNG_1X1 }).contentType,
        },
        payload: buildMultipartPayload({ body: PNG_1X1 }).payload,
      });
      expect(logo.statusCode).toBe(200);

      const upload = await app.inject({
        method: 'POST',
        url: '/admin/platform/branding/icon',
        headers: {
          cookie,
          'content-type': buildMultipartPayload({
            fieldName: 'icon',
            filename: 'icon.png',
            body: PNG_1X1,
          }).contentType,
        },
        payload: buildMultipartPayload({
          fieldName: 'icon',
          filename: 'icon.png',
          body: PNG_1X1,
        }).payload,
      });
      expect(upload.statusCode).toBe(200);
      expect(upload.json().iconUrl).toMatch(/^\/files\//);
      expect(upload.json().logoUrl).toBe(logo.json().logoUrl);
      expect(upload.json().iconUrl).not.toBe(upload.json().logoUrl);

      const fileId = String(upload.json().iconUrl).replace('/files/', '');
      const stored = await files.findById(fileId);
      expect(stored?.fileType).toBe('PLATFORM_ICON');
      expect(stored?.tenantId).toBeNull();
      expect(stored?.storageKey.startsWith('platform/branding/icon/')).toBe(true);

      const svg = await app.inject({
        method: 'POST',
        url: '/admin/platform/branding/icon',
        headers: {
          cookie,
          'content-type': buildMultipartPayload({
            fieldName: 'icon',
            filename: 'x.svg',
            mimeType: 'image/svg+xml',
            body: SVG_FIXTURE,
          }).contentType,
        },
        payload: buildMultipartPayload({
          fieldName: 'icon',
          filename: 'x.svg',
          mimeType: 'image/svg+xml',
          body: SVG_FIXTURE,
        }).payload,
      });
      expect(svg.statusCode).toBe(422);

      const del = await app.inject({
        method: 'DELETE',
        url: '/admin/platform/branding/icon',
        headers: { cookie },
      });
      expect(del.statusCode).toBe(204);
      expect((await platformBranding.get())?.iconFileId).toBeNull();
      expect((await platformBranding.get())?.logoFileId).not.toBeNull();
    });
  });

  describe('reset / ownership / regressão tenant', () => {
    it('DELETE reset remove config e assets; TenantBranding intacto; idempotente', async () => {
      const tenant = await tenants.create({ name: 'plat-reset-t', displayName: 'Reset T' });
      await tenantBranding.upsert(tenant.id, { lightColors: { primary: '#AAAAAA' } });
      await createPlatformUser({ email: 'plat-reset@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'plat-reset@api.test');

      await app.inject({
        method: 'PATCH',
        url: '/admin/platform/branding',
        headers: { cookie },
        payload: { name: 'Economização', light: { primary: '#141452' } },
      });
      const logo = await app.inject({
        method: 'POST',
        url: '/admin/platform/branding/logo',
        headers: {
          cookie,
          'content-type': buildMultipartPayload({ body: PNG_1X1 }).contentType,
        },
        payload: buildMultipartPayload({ body: PNG_1X1 }).payload,
      });
      const logoId = String(logo.json().logoUrl).replace('/files/', '');

      const reset = await app.inject({
        method: 'DELETE',
        url: '/admin/platform/branding',
        headers: { cookie },
      });
      expect(reset.statusCode).toBe(204);
      expect(await platformBranding.get()).toBeNull();
      expect(await files.findById(logoId)).toBeNull();
      expect(await tenantBranding.findByTenantId(tenant.id)).not.toBeNull();

      expect(
        (
          await app.inject({
            method: 'DELETE',
            url: '/admin/platform/branding',
            headers: { cookie },
          })
        ).statusCode,
      ).toBe(204);
    });

    it('arquivo TENANT_LOGO não pode ser anexado como logo da plataforma', async () => {
      const tenant = await tenants.create({ name: 'own-t', displayName: 'Own T' });
      const tenantFile = await files.create({
        tenantId: tenant.id,
        fileType: 'TENANT_LOGO',
        storageKey: `tenants/${tenant.id}/branding/x.png`,
        mimeType: 'image/png',
        size: 10,
        checksum: 'x',
      });
      await platformBranding.upsert({ name: 'Economização' });

      await expect(platformBranding.attachLogo(tenantFile.id)).rejects.toMatchObject({
        code: 'BRANDING_FILE_OWNERSHIP_INVALID',
      });
    });
  });
});
