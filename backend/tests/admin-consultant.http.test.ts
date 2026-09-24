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
import { AI_PROVIDER_MODEL_CATALOG } from '../src/modules/advisor/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';
const NON_EXISTENT_TENANT_ID = '00000000-0000-4000-8000-000000000099';
const OPENAI_MODEL = AI_PROVIDER_MODEL_CATALOG.OPENAI.models[0];
const ANTHROPIC_MODEL = AI_PROVIDER_MODEL_CATALOG.ANTHROPIC.models[0];

const SETTINGS_PUBLIC_KEYS = [
  'configured',
  'status',
  'provider',
  'model',
  'consultantName',
  'businessSegment',
  'businessDescription',
  'adminPrompt',
  'tonePreset',
  'tone',
  'updatedAt',
] as const;

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

function expectNoSecretLeak(payload: unknown) {
  const serialized = JSON.stringify(payload);
  expect(serialized).not.toMatch(/api[_]?key/i);
  expect(serialized).not.toMatch(/sk-/i);
  expect(serialized).not.toMatch(/ai_runs/i);
  if (payload !== null && typeof payload === 'object' && !Array.isArray(payload)) {
    expect(payload).not.toHaveProperty('apiKey');
    expect(payload).not.toHaveProperty('credential');
    expect(payload).not.toHaveProperty('encryptedSecret');
    expect(payload).not.toHaveProperty('tenantId');
    expect(payload).not.toHaveProperty('createdById');
    expect(payload).not.toHaveProperty('createdBy');
  }
}

describe('API administrativa /admin/consultant (F13.4)', () => {
  describe('auth / role', () => {
    it('rejeita sem sessão', async () => {
      const tenant = await tenants.create({
        name: 'consultant-unauth',
        displayName: 'Consultant Unauth',
      });
      const app = await buildTestApp();

      const options = await app.inject({ method: 'GET', url: '/admin/consultant/options' });
      expect(options.statusCode).toBe(401);
      expect(options.json().error.code).toBe('UNAUTHENTICATED');

      const settings = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/consultant`,
      });
      expect(settings.statusCode).toBe(401);
    });

    it('rejeita USER', async () => {
      await createPlatformUser({ email: 'user-consultant@api.test', role: 'USER' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'user-consultant@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/consultant/options',
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });

    it('rejeita ADMIN em Support Mode', async () => {
      const tenant = await tenants.create({
        name: 'consultant-support',
        displayName: 'Consultant Support',
      });
      await createPlatformUser({ email: 'admin-support-consultant@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-support-consultant@api.test');
      const enter = await app.inject({
        method: 'POST',
        url: '/auth/support/enter',
        headers: { cookie, 'user-agent': 'admin-consultant-support' },
        payload: { tenantId: tenant.id },
      });
      expect(enter.statusCode).toBe(200);

      const response = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
      });
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    });
  });

  describe('GET /admin/consultant/options', () => {
    it('lista providers e models a partir do catálogo', async () => {
      await createPlatformUser({ email: 'admin-options@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-options@api.test');

      const response = await app.inject({
        method: 'GET',
        url: '/admin/consultant/options',
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expectNoSecretLeak(body);
      expect(body.providers).toEqual(
        (Object.keys(AI_PROVIDER_MODEL_CATALOG) as Array<keyof typeof AI_PROVIDER_MODEL_CATALOG>).map(
          (id) => ({
            id,
            label: id === 'OPENAI' ? 'OpenAI' : 'Anthropic',
            models: AI_PROVIDER_MODEL_CATALOG[id].models.map((modelId) => ({
              id: modelId,
              label: modelId,
            })),
          }),
        ),
      );
    });
  });

  describe('GET/PUT /admin/tenants/:tenantId/consultant', () => {
    it('retorna NÃO configurado sem criar settings', async () => {
      const tenant = await tenants.create({
        name: 'consultant-empty',
        displayName: 'Consultant Empty',
      });
      await createPlatformUser({ email: 'admin-empty@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-empty@api.test');

      const response = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(Object.keys(body).sort()).toEqual([...SETTINGS_PUBLIC_KEYS].sort());
      expect(body).toEqual({
        configured: false,
        status: 'NOT_CONFIGURED',
        provider: null,
        model: null,
        consultantName: null,
        businessSegment: null,
        businessDescription: null,
        adminPrompt: null,
        tonePreset: null,
        tone: null,
        updatedAt: null,
      });
      expectNoSecretLeak(body);
      expect(await prisma.aiTenantSettings.count({ where: { tenantId: tenant.id } })).toBe(0);
    });

    it('faz upsert OPENAI e ANTHROPIC com models da allowlist', async () => {
      const tenant = await tenants.create({
        name: 'consultant-upsert',
        displayName: 'Consultant Upsert',
      });
      await createPlatformUser({ email: 'admin-upsert@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-upsert@api.test');

      const openai = await app.inject({
        method: 'PUT',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
        payload: {
          status: 'ACTIVE',
          provider: 'OPENAI',
          model: OPENAI_MODEL,
          businessSegment: 'Clínica',
          businessDescription: 'Atendimento',
          adminPrompt: 'Seja objetivo',
          tone: 'Formal',
        },
      });
      expect(openai.statusCode).toBe(200);
      const openaiBody = openai.json();
      expect(openaiBody).toMatchObject({
        configured: true,
        status: 'ACTIVE',
        provider: 'OPENAI',
        model: OPENAI_MODEL,
        businessSegment: 'Clínica',
        businessDescription: 'Atendimento',
        adminPrompt: 'Seja objetivo',
        tone: 'Formal',
      });
      expect(typeof openaiBody.updatedAt).toBe('string');
      expectNoSecretLeak(openaiBody);

      const anthropic = await app.inject({
        method: 'PUT',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
        payload: {
          status: 'DISABLED',
          provider: 'ANTHROPIC',
          model: ANTHROPIC_MODEL,
        },
      });
      expect(anthropic.statusCode).toBe(200);
      expect(anthropic.json()).toMatchObject({
        configured: true,
        status: 'DISABLED',
        provider: 'ANTHROPIC',
        model: ANTHROPIC_MODEL,
      });
      expectNoSecretLeak(anthropic.json());
      expect(await prisma.aiTenantSettings.count({ where: { tenantId: tenant.id } })).toBe(1);
    });

    it('rejeita provider/model inválido', async () => {
      const tenant = await tenants.create({
        name: 'consultant-invalid-model',
        displayName: 'Consultant Invalid',
      });
      await createPlatformUser({ email: 'admin-invalid-model@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-invalid-model@api.test');

      const invalidModel = await app.inject({
        method: 'PUT',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
        payload: {
          status: 'ACTIVE',
          provider: 'OPENAI',
          model: 'modelo-nao-permitido',
        },
      });
      expect([400, 422]).toContain(invalidModel.statusCode);
      expect(invalidModel.json().error.code).toBe('VALIDATION_ERROR');

      const invalidProvider = await app.inject({
        method: 'PUT',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
        payload: {
          status: 'ACTIVE',
          provider: 'GEMINI',
          model: OPENAI_MODEL,
        },
      });
      expect([400, 422]).toContain(invalidProvider.statusCode);
      expect(invalidProvider.json().error.code).toBe('VALIDATION_ERROR');
      expect(await prisma.aiTenantSettings.count({ where: { tenantId: tenant.id } })).toBe(0);
    });

    it('rejeita body com tenantId e nunca aceita/retorna apiKey', async () => {
      const tenant = await tenants.create({
        name: 'consultant-secrets',
        displayName: 'Consultant Secrets',
      });
      await createPlatformUser({ email: 'admin-secrets@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-secrets@api.test');

      const withTenantId = await app.inject({
        method: 'PUT',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
        payload: {
          status: 'ACTIVE',
          provider: 'OPENAI',
          model: OPENAI_MODEL,
          tenantId: tenant.id,
        },
      });
      expect(withTenantId.statusCode).toBe(422);
      expect(withTenantId.json().error.details?.some((d: { field: string }) => d.field === 'tenantId')).toBe(
        true,
      );

      const withApiKey = await app.inject({
        method: 'PUT',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
        payload: {
          status: 'ACTIVE',
          provider: 'OPENAI',
          model: OPENAI_MODEL,
          apiKey: 'sk-should-never-persist',
        },
      });
      expect(withApiKey.statusCode).toBe(422);
      expect(withApiKey.json().error.details?.some((d: { field: string }) => d.field === 'apiKey')).toBe(
        true,
      );

      const created = await app.inject({
        method: 'PUT',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
        payload: {
          status: 'ACTIVE',
          provider: 'OPENAI',
          model: OPENAI_MODEL,
        },
      });
      expect(created.statusCode).toBe(200);
      expectNoSecretLeak(created.json());
      expect(Object.keys(created.json()).sort()).toEqual([...SETTINGS_PUBLIC_KEYS].sort());

      const fetched = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/consultant`,
        headers: { cookie },
      });
      expect(fetched.statusCode).toBe(200);
      expectNoSecretLeak(fetched.json());
      expect(Object.keys(fetched.json()).sort()).toEqual([...SETTINGS_PUBLIC_KEYS].sort());

      const raw = await prisma.aiTenantSettings.findUnique({ where: { tenantId: tenant.id } });
      expect(JSON.stringify(raw)).not.toMatch(/sk-|api[_]?key/i);
    });

    it('retorna 404 para tenant inexistente no PUT', async () => {
      await createPlatformUser({ email: 'admin-missing@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-missing@api.test');

      const response = await app.inject({
        method: 'PUT',
        url: `/admin/tenants/${NON_EXISTENT_TENANT_ID}/consultant`,
        headers: { cookie },
        payload: {
          status: 'ACTIVE',
          provider: 'OPENAI',
          model: OPENAI_MODEL,
        },
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('NOT_FOUND');
    });
  });

  describe('knowledge CRUD', () => {
    it('cria, lista, atualiza e remove conhecimento', async () => {
      const tenant = await tenants.create({
        name: 'consultant-knowledge',
        displayName: 'Consultant Knowledge',
      });
      await createPlatformUser({ email: 'admin-knowledge@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-knowledge@api.test');

      const created = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/consultant/knowledge`,
        headers: { cookie },
        payload: {
          title: 'Protocolo clínico',
          content: 'Atender com prioridade os casos urgentes.',
          status: 'ACTIVE',
        },
      });
      expect(created.statusCode).toBe(201);
      const createdBody = created.json();
      expect(createdBody).toMatchObject({
        title: 'Protocolo clínico',
        content: 'Atender com prioridade os casos urgentes.',
        contentType: 'TEXT',
        status: 'ACTIVE',
      });
      expect(createdBody.id).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      expectNoSecretLeak(createdBody);

      const listed = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/consultant/knowledge`,
        headers: { cookie },
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().data).toHaveLength(1);
      expect(listed.json().data[0].id).toBe(createdBody.id);
      expectNoSecretLeak(listed.json());

      const patched = await app.inject({
        method: 'PATCH',
        url: `/admin/tenants/${tenant.id}/consultant/knowledge/${createdBody.id}`,
        headers: { cookie },
        payload: {
          title: 'Protocolo atualizado',
          status: 'DISABLED',
        },
      });
      expect(patched.statusCode).toBe(200);
      expect(patched.json()).toMatchObject({
        id: createdBody.id,
        title: 'Protocolo atualizado',
        content: 'Atender com prioridade os casos urgentes.',
        status: 'DISABLED',
        contentType: 'TEXT',
      });
      expectNoSecretLeak(patched.json());

      const removed = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${tenant.id}/consultant/knowledge/${createdBody.id}`,
        headers: { cookie },
      });
      expect(removed.statusCode).toBe(204);

      const afterDelete = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenant.id}/consultant/knowledge`,
        headers: { cookie },
      });
      expect(afterDelete.json().data).toHaveLength(0);
    });

    it('retorna 404 ao acessar conhecimento de outro tenant', async () => {
      const tenantA = await tenants.create({
        name: 'consultant-know-a',
        displayName: 'Consultant A',
      });
      const tenantB = await tenants.create({
        name: 'consultant-know-b',
        displayName: 'Consultant B',
      });
      await createPlatformUser({ email: 'admin-cross@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-cross@api.test');

      const createdB = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenantB.id}/consultant/knowledge`,
        headers: { cookie },
        payload: {
          title: 'Segredo B',
          content: 'Conhecimento exclusivo de B',
        },
      });
      expect(createdB.statusCode).toBe(201);
      const entryId = createdB.json().id as string;

      const listedA = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenantA.id}/consultant/knowledge`,
        headers: { cookie },
      });
      expect(listedA.json().data).toEqual([]);

      const patched = await app.inject({
        method: 'PATCH',
        url: `/admin/tenants/${tenantA.id}/consultant/knowledge/${entryId}`,
        headers: { cookie },
        payload: { title: 'Tentativa cruzada' },
      });
      expect(patched.statusCode).toBe(404);
      expect(patched.json().error.code).toBe('NOT_FOUND');
      expect(JSON.stringify(patched.json())).not.toContain('Segredo B');

      const removed = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${tenantA.id}/consultant/knowledge/${entryId}`,
        headers: { cookie },
      });
      expect(removed.statusCode).toBe(404);

      const stillOnB = await app.inject({
        method: 'GET',
        url: `/admin/tenants/${tenantB.id}/consultant/knowledge`,
        headers: { cookie },
      });
      expect(stillOnB.json().data).toHaveLength(1);
      expect(stillOnB.json().data[0].id).toBe(entryId);
    });

    it('rejeita UUID inválido e entry inexistente', async () => {
      const tenant = await tenants.create({
        name: 'consultant-know-404',
        displayName: 'Consultant 404',
      });
      await createPlatformUser({ email: 'admin-know-404@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-know-404@api.test');

      const invalid = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${tenant.id}/consultant/knowledge/not-a-uuid`,
        headers: { cookie },
      });
      expect(invalid.statusCode).toBe(422);

      const missing = await app.inject({
        method: 'DELETE',
        url: `/admin/tenants/${tenant.id}/consultant/knowledge/${randomUUID()}`,
        headers: { cookie },
      });
      expect(missing.statusCode).toBe(404);
    });
  });

  describe('GET/PUT/DELETE /admin/consultant/providers', () => {
    it('ADMIN e SUPER_ADMIN gerenciam credencial sem devolver segredo', async () => {
      await createPlatformUser({ email: 'admin-providers@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-providers@api.test');
      const secret = 'sk-test-platform-openai-key';

      const listed = await app.inject({
        method: 'GET',
        url: '/admin/consultant/providers',
        headers: { cookie },
      });
      expect(listed.statusCode).toBe(200);
      expect(listed.json().data).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ provider: 'OPENAI', configured: expect.any(Boolean) }),
          expect.objectContaining({ provider: 'ANTHROPIC', configured: expect.any(Boolean) }),
        ]),
      );
      expectNoSecretLeak(listed.json());
      expect(JSON.stringify(listed.json())).not.toContain(secret);

      const put = await app.inject({
        method: 'PUT',
        url: '/admin/consultant/providers/OPENAI/credential',
        headers: { cookie },
        payload: { credential: secret },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toEqual({ provider: 'OPENAI', configured: true });
      expectNoSecretLeak(put.json());
      expect(JSON.stringify(put.json())).not.toContain(secret);

      const stored = await prisma.aiPlatformCredential.findUnique({ where: { provider: 'OPENAI' } });
      expect(stored?.encryptedSecret.startsWith('v1.')).toBe(true);
      expect(stored?.encryptedSecret).not.toContain(secret);

      const removed = await app.inject({
        method: 'DELETE',
        url: '/admin/consultant/providers/OPENAI/credential',
        headers: { cookie },
      });
      expect(removed.statusCode).toBe(204);
      expect(await prisma.aiPlatformCredential.findUnique({ where: { provider: 'OPENAI' } })).toBeNull();
    });

    it('SUPER_ADMIN também gerencia e USER recebe 403', async () => {
      await createPlatformUser({ email: 'super-providers@api.test', role: 'SUPER_ADMIN' });
      await createPlatformUser({ email: 'user-providers@api.test', role: 'USER' });
      const app = await buildTestApp();
      const superCookie = await loginAs(app, 'super-providers@api.test');
      const userCookie = await loginAs(app, 'user-providers@api.test');

      const put = await app.inject({
        method: 'PUT',
        url: '/admin/consultant/providers/ANTHROPIC/credential',
        headers: { cookie: superCookie },
        payload: { credential: 'sk-ant-platform-test-key' },
      });
      expect(put.statusCode).toBe(200);
      expect(put.json()).toEqual({ provider: 'ANTHROPIC', configured: true });

      const forbidden = await app.inject({
        method: 'GET',
        url: '/admin/consultant/providers',
        headers: { cookie: userCookie },
      });
      expect(forbidden.statusCode).toBe(403);
    });

    it('Support Mode não eleva gestão de credencial', async () => {
      const tenant = await tenants.create({
        name: 'providers-support',
        displayName: 'Providers Support',
      });
      await createPlatformUser({ email: 'admin-providers-support@api.test', role: 'ADMIN' });
      const app = await buildTestApp();
      const cookie = await loginAs(app, 'admin-providers-support@api.test');
      const enter = await app.inject({
        method: 'POST',
        url: '/auth/support/enter',
        headers: { cookie, 'user-agent': 'admin-providers-support' },
        payload: { tenantId: tenant.id },
      });
      expect(enter.statusCode).toBe(200);

      const response = await app.inject({
        method: 'PUT',
        url: '/admin/consultant/providers/OPENAI/credential',
        headers: { cookie },
        payload: { credential: 'sk-should-not-store' },
      });
      expect(response.statusCode).toBe(403);
      expect(await prisma.aiPlatformCredential.count()).toBe(0);
    });
  });
});
