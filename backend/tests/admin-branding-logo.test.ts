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
import { createTenantBrandingRepository } from '../src/modules/branding/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import {
  buildMultipartPayload,
  JPEG_FIXTURE,
  oversizedPng,
  PNG_1X1,
  SVG_FIXTURE,
  WEBP_FIXTURE,
} from './helpers/image-fixtures.js';
import { cleanTestDatabase } from './helpers/test-database.js';
import { cleanTestStorage } from './helpers/test-storage.js';

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

function logoUrl(tenantId: string) {
  return `/admin/tenants/${tenantId}/branding/logo`;
}

describe('API administrativa de logo (1.3D)', () => {
  describe('auth / role', () => {
    it('rejeita sem sessão', async () => {
      const tenant = await tenants.create({ name: 'logo-auth', displayName: 'Logo Auth' });
      const app = await buildTestApp();
      const multipart = buildMultipartPayload({ body: PNG_1X1 });
      const response = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { 'content-type': multipart.contentType },
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(401);
    });

    it('rejeita USER', async () => {
      const tenant = await tenants.create({ name: 'logo-user', displayName: 'Logo User' });
      await createPlatformUser({ email: 'logo-user@api.test', role: 'USER', tenantId: tenant.id });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'logo-user@api.test');
      const multipart = buildMultipartPayload({ body: PNG_1X1 });
      const response = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { cookie, 'content-type': multipart.contentType },
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(403);
    });

    it('permite ADMIN e SUPER_ADMIN', async () => {
      const tenant = await tenants.create({ name: 'logo-admin', displayName: 'Logo Admin' });
      await createPlatformUser({ email: 'logo-admin@api.test', role: 'ADMIN' });
      await createPlatformUser({ email: 'logo-super@api.test', role: 'SUPER_ADMIN' });
      const app = await buildTestApp();
      const adminCookie = await loginAs(app, 'logo-admin@api.test');
      const superCookie = await loginAs(app, 'logo-super@api.test');
      const first = buildMultipartPayload({ body: PNG_1X1 });
      const adminUpload = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { cookie: adminCookie, 'content-type': first.contentType },
        payload: first.payload,
      });
      expect(adminUpload.statusCode).toBe(200);

      const second = buildMultipartPayload({ body: PNG_1X1, filename: 'other.png' });
      const superUpload = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { cookie: superCookie, 'content-type': second.contentType },
        payload: second.payload,
      });
      expect(superUpload.statusCode).toBe(200);
    });
  });

  describe('POST /admin/tenants/:tenantId/branding/logo', () => {
    it('tenant inexistente → 404', async () => {
      await createPlatformUser({ email: 'logo-missing@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'logo-missing@api.test');
      const multipart = buildMultipartPayload({ body: PNG_1X1 });
      const response = await app.inject({
        method: 'POST',
        url: logoUrl(NON_EXISTENT_TENANT_ID),
        headers: { cookie, 'content-type': multipart.contentType },
        payload: multipart.payload,
      });
      expect(response.statusCode).toBe(404);
    });

    it('sem arquivo → 422', async () => {
      const tenant = await tenants.create({ name: 'logo-empty', displayName: 'Logo Empty' });
      await createPlatformUser({ email: 'logo-empty@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'logo-empty@api.test');
      const response = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { cookie, 'content-type': 'multipart/form-data; boundary=----empty' },
        payload: Buffer.from('------empty--\r\n'),
      });
      expect(response.statusCode).toBe(422);
    });

    it('PNG/JPEG/WebP válidos persistem referência isolada por tenant', async () => {
      const tenantA = await tenants.create({ name: 'logo-a', displayName: 'Logo A' });
      const tenantB = await tenants.create({ name: 'logo-b', displayName: 'Logo B' });
      await createPlatformUser({ email: 'logo-ok@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'logo-ok@api.test');

      for (const [body, mimeType, filename] of [
        [PNG_1X1, 'image/png', 'a.png'],
        [JPEG_FIXTURE, 'image/jpeg', 'a.jpg'],
        [WEBP_FIXTURE, 'image/webp', 'a.webp'],
      ] as const) {
        const multipart = buildMultipartPayload({ body, mimeType, filename });
        const response = await app.inject({
          method: 'POST',
          url: logoUrl(tenantA.id),
          headers: { cookie, 'content-type': multipart.contentType },
          payload: multipart.payload,
        });
        expect(response.statusCode).toBe(200);
        expect(response.json().logoUrl).toMatch(/^\/files\/[0-9a-f-]{36}$/i);
      }

      const storedA = await branding.findByTenantId(tenantA.id);
      expect(storedA?.logoFile?.tenantId).toBe(tenantA.id);
      expect(await branding.findByTenantId(tenantB.id)).toBeNull();
    });

    it('rejeita SVG, MIME falso e arquivo >2MB', async () => {
      const tenant = await tenants.create({ name: 'logo-bad', displayName: 'Logo Bad' });
      await createPlatformUser({ email: 'logo-bad@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'logo-bad@api.test');

      const svg = buildMultipartPayload({
        body: SVG_FIXTURE,
        mimeType: 'image/svg+xml',
        filename: 'logo.svg',
      });
      expect(
        (
          await app.inject({
            method: 'POST',
            url: logoUrl(tenant.id),
            headers: { cookie, 'content-type': svg.contentType },
            payload: svg.payload,
          })
        ).statusCode,
      ).toBe(422);

      const fake = buildMultipartPayload({
        body: SVG_FIXTURE,
        mimeType: 'image/png',
        filename: 'logo.png',
      });
      expect(
        (
          await app.inject({
            method: 'POST',
            url: logoUrl(tenant.id),
            headers: { cookie, 'content-type': fake.contentType },
            payload: fake.payload,
          })
        ).statusCode,
      ).toBe(422);

      const huge = buildMultipartPayload({ body: oversizedPng() });
      const hugeResponse = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { cookie, 'content-type': huge.contentType },
        payload: huge.payload,
      });
      expect([413, 422]).toContain(hugeResponse.statusCode);
    });

    it('substituição troca referência e remove arquivo antigo', async () => {
      const tenant = await tenants.create({ name: 'logo-replace', displayName: 'Logo Replace' });
      await createPlatformUser({ email: 'logo-replace@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'logo-replace@api.test');
      const first = buildMultipartPayload({ body: PNG_1X1 });
      const uploaded = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { cookie, 'content-type': first.contentType },
        payload: first.payload,
      });
      const firstRecord = await branding.findByTenantId(tenant.id);
      const oldKey = firstRecord?.logoFile?.storageKey;
      expect(oldKey).toBeTruthy();

      const second = buildMultipartPayload({ body: WEBP_FIXTURE, mimeType: 'image/webp' });
      const replaced = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { cookie, 'content-type': second.contentType },
        payload: second.payload,
      });
      expect(replaced.statusCode).toBe(200);
      expect(replaced.json().logoUrl).not.toBe(uploaded.json().logoUrl);

      const root = process.env.TEST_STORAGE_PATH!;
      await expect(access(path.join(root, oldKey!))).rejects.toThrow();
    });
  });

  describe('DELETE /admin/tenants/:tenantId/branding/logo', () => {
    it('remove logo, preserva cores e é idempotente', async () => {
      const tenant = await tenants.create({ name: 'logo-del', displayName: 'Logo Del' });
      await branding.upsert(tenant.id, { lightColors: { primary: '#141452' } });
      await createPlatformUser({ email: 'logo-del@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'logo-del@api.test');
      const multipart = buildMultipartPayload({ body: PNG_1X1 });
      await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { cookie, 'content-type': multipart.contentType },
        payload: multipart.payload,
      });
      const before = await branding.findByTenantId(tenant.id);
      const storageKey = before?.logoFile?.storageKey;
      expect(storageKey).toBeTruthy();

      const deleted = await app.inject({
        method: 'DELETE',
        url: logoUrl(tenant.id),
        headers: { cookie },
      });
      expect(deleted.statusCode).toBe(204);

      const after = await branding.findByTenantId(tenant.id);
      expect(after?.logoFileId).toBeNull();
      expect(after?.lightColors).toEqual({ primary: '#141452' });
      await expect(
        access(path.join(process.env.TEST_STORAGE_PATH!, storageKey!)),
      ).rejects.toThrow();

      const again = await app.inject({
        method: 'DELETE',
        url: logoUrl(tenant.id),
        headers: { cookie },
      });
      expect(again.statusCode).toBe(204);

      const other = await tenants.create({ name: 'logo-other', displayName: 'Logo Other' });
      const otherUpload = buildMultipartPayload({ body: PNG_1X1 });
      await app.inject({
        method: 'POST',
        url: logoUrl(other.id),
        headers: { cookie, 'content-type': otherUpload.contentType },
        payload: otherUpload.payload,
      });
      expect((await branding.findByTenantId(other.id))?.logoFileId).toBeTruthy();
    });
  });

  describe('exclusão de tenant e serving público', () => {
    it('tenant elegível remove branding/logo; tenant com USER não apaga arquivo', async () => {
      const eligible = await tenants.create({ name: 'logo-elig', displayName: 'Logo Elig' });
      const blocked = await tenants.create({ name: 'logo-block', displayName: 'Logo Block' });
      await createPlatformUser({
        email: 'blocked-user@api.test',
        role: 'USER',
        tenantId: blocked.id,
      });
      await createPlatformUser({ email: 'logo-tenant-del@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'logo-tenant-del@api.test');

      const eligibleUpload = buildMultipartPayload({ body: PNG_1X1 });
      await app.inject({
        method: 'POST',
        url: logoUrl(eligible.id),
        headers: { cookie, 'content-type': eligibleUpload.contentType },
        payload: eligibleUpload.payload,
      });
      const blockedUpload = buildMultipartPayload({ body: PNG_1X1 });
      await app.inject({
        method: 'POST',
        url: logoUrl(blocked.id),
        headers: { cookie, 'content-type': blockedUpload.contentType },
        payload: blockedUpload.payload,
      });
      const blockedKey = (await branding.findByTenantId(blocked.id))?.logoFile?.storageKey;
      expect(blockedKey).toBeTruthy();

      const deleted = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${eligible.id}`,
        headers: { cookie },
      });
      expect(deleted.statusCode).toBe(204);

      const blockedDelete = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${blocked.id}`,
        headers: { cookie },
      });
      expect(blockedDelete.statusCode).toBe(409);
      await access(path.join(process.env.TEST_STORAGE_PATH!, blockedKey!));
    });

    it('GET /files/:fileId serve logo pública opaca', async () => {
      const tenant = await tenants.create({ name: 'logo-public', displayName: 'Logo Public' });
      await createPlatformUser({ email: 'logo-public@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'logo-public@api.test');
      const multipart = buildMultipartPayload({ body: PNG_1X1 });
      const uploaded = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: { cookie, 'content-type': multipart.contentType },
        payload: multipart.payload,
      });
      const publicPath = uploaded.json().logoUrl as string;
      const served = await app.inject({ method: 'GET', url: publicPath });
      expect(served.statusCode).toBe(200);
      expect(served.headers['content-type']).toContain('image/png');
      expect(Buffer.from(served.rawPayload).equals(PNG_1X1)).toBe(true);
    });
  });

  describe('POST /admin/tenants/:tenantId/branding/icon', () => {
    it('cria TENANT_ICON independente da logo; USER é 403', async () => {
      const tenant = await tenants.create({ name: 'icon-split', displayName: 'Icon Split' });
      await createPlatformUser({ email: 'icon-admin@api.test', role: 'ADMIN' });
      await createPlatformUser({
        email: 'icon-user@api.test',
        role: 'USER',
        tenantId: tenant.id,
      });
      const app = await buildTestApp();
      const adminCookie = await loginAs(app, 'icon-admin@api.test');
      const userCookie = await loginAs(app, 'icon-user@api.test');

      const logo = await app.inject({
        method: 'POST',
        url: logoUrl(tenant.id),
        headers: {
          cookie: adminCookie,
          'content-type': buildMultipartPayload({ body: PNG_1X1 }).contentType,
        },
        payload: buildMultipartPayload({ body: PNG_1X1 }).payload,
      });
      expect(logo.statusCode).toBe(200);

      const userDenied = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/branding/icon`,
        headers: {
          cookie: userCookie,
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
      expect(userDenied.statusCode).toBe(403);

      const icon = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/branding/icon`,
        headers: {
          cookie: adminCookie,
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
      expect(icon.statusCode).toBe(200);
      expect(icon.json().iconUrl).toMatch(/^\/files\//);
      expect(icon.json().logoUrl).toBe(logo.json().logoUrl);
      expect(icon.json().iconUrl).not.toBe(icon.json().logoUrl);

      const svg = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/branding/icon`,
        headers: {
          cookie: adminCookie,
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
        url: `/admin/tenants/${tenant.id}/branding/icon`,
        headers: { cookie: adminCookie },
      });
      expect(del.statusCode).toBe(204);
      const after = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/branding`,
        headers: { cookie: adminCookie },
      });
      expect(after.json().iconUrl).toBeNull();
      expect(after.json().logoUrl).toBe(logo.json().logoUrl);
    });
  });
});
