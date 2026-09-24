import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { IaProviderError } from '../src/infrastructure/ai/types.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import {
  createAdvisorRuntime,
  FAKE_ANTHROPIC_CONSULTANT_TEXT,
  FAKE_OPENAI_CONSULTANT_TEXT,
} from '../src/modules/advisor/http/create-advisor-runtime.js';
import { createAdvisorSettingsRepository } from '../src/modules/advisor/repositories/advisor-settings.repository.js';
import {
  createConsultantService,
  resolveConsultantAvailability,
} from '../src/modules/advisor/services/consultant.service.js';
import { createTenantRepository } from '../src/modules/tenant/repositories/tenant.repository.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';
const MISSING_CONVERSATION_ID = '00000000-0000-4000-8000-000000000099';

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

async function createUser(options: {
  email: string;
  role: 'ADMIN' | 'SUPER_ADMIN' | 'USER';
  tenantId?: string | null;
}) {
  const user = await users.create({
    name: options.email,
    email: options.email,
    role: options.role,
    tenantId: options.role === 'USER' ? (options.tenantId ?? null) : null,
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

async function seedTenant(options: {
  slug: string;
  email: string;
  settings?: { provider: 'OPENAI' | 'ANTHROPIC'; status: 'ACTIVE' | 'DISABLED' };
}) {
  const tenant = await tenants.create({
    name: options.slug,
    displayName: options.slug,
  });
  const user = await createUser({
    email: options.email,
    role: 'USER',
    tenantId: tenant.id,
  });
  if (options.settings) {
    await settings.upsertSettings(tenant.id, {
      provider: options.settings.provider,
      status: options.settings.status,
    });
  }
  return { tenant, user };
}

function expectSafeConsultantPayload(raw: string): void {
  expect(raw).not.toMatch(/sk-/i);
  expect(raw.toLowerCase()).not.toContain('api key');
  expect(raw).not.toMatch(/openaiApiKey|anthropicApiKey|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
  expect(raw).not.toContain('at ');
}

describe('resolveConsultantAvailability', () => {
  const tenantId = 'tenant-a';

  it('retorna NOT_CONFIGURED sem settings', () => {
    expect(
      resolveConsultantAvailability({
        settings: null,
        tenantId,
        nodeEnv: 'production',
        openaiApiKey: 'sk-present',
        anthropicApiKey: 'sk-ant-present',
      }),
    ).toEqual({ status: 'NOT_CONFIGURED' });
  });

  it('retorna DISABLED com settings desabilitadas', () => {
    expect(
      resolveConsultantAvailability({
        settings: { tenantId, status: 'DISABLED', provider: 'OPENAI' },
        tenantId,
        nodeEnv: 'production',
        openaiApiKey: 'sk-present',
        anthropicApiKey: null,
      }),
    ).toEqual({ status: 'DISABLED' });
  });

  it('retorna ACTIVE em NODE_ENV=test mesmo sem key (Fake)', () => {
    expect(
      resolveConsultantAvailability({
        settings: { tenantId, status: 'ACTIVE', provider: 'OPENAI' },
        tenantId,
        nodeEnv: 'test',
        openaiApiKey: null,
        anthropicApiKey: null,
      }),
    ).toEqual({ status: 'ACTIVE' });
  });

  it('retorna UNAVAILABLE em production-like sem key do provider', () => {
    expect(
      resolveConsultantAvailability({
        settings: { tenantId, status: 'ACTIVE', provider: 'OPENAI' },
        tenantId,
        nodeEnv: 'production',
        openaiApiKey: null,
        anthropicApiKey: 'sk-ant-present',
      }),
    ).toEqual({ status: 'UNAVAILABLE' });

    expect(
      resolveConsultantAvailability({
        settings: { tenantId, status: 'ACTIVE', provider: 'ANTHROPIC' },
        tenantId,
        nodeEnv: 'development',
        openaiApiKey: 'sk-present',
        anthropicApiKey: null,
      }),
    ).toEqual({ status: 'UNAVAILABLE' });
  });

  it('retorna ACTIVE em production-like com key do provider', () => {
    expect(
      resolveConsultantAvailability({
        settings: { tenantId, status: 'ACTIVE', provider: 'OPENAI' },
        tenantId,
        nodeEnv: 'production',
        openaiApiKey: 'sk-present',
        anthropicApiKey: null,
      }),
    ).toEqual({ status: 'ACTIVE' });
  });
});

describe('API do usuário /consultant (F13.4)', () => {
  it('rejeita sem sessão', async () => {
    const app = await buildTestApp();
    const response = await app.inject({ method: 'GET', url: '/consultant/status' });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('rejeita admin sem Support Mode', async () => {
    await createUser({ email: 'admin-consultant@api.test', role: 'ADMIN' });
    const app = await buildTestApp();
    const cookie = await loginAs(app, 'admin-consultant@api.test');
    const response = await app.inject({
      method: 'GET',
      url: '/consultant/status',
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe('FORBIDDEN');
  });

  it('retorna NOT_CONFIGURED sem settings e rejeita criação', async () => {
    const { user } = await seedTenant({ slug: 'sem-config', email: 'sem-config@api.test' });
    const app = await buildTestApp();
    const cookie = await loginAs(app, user.email);

    const status = await app.inject({
      method: 'GET',
      url: '/consultant/status',
      headers: { cookie },
    });
    expect(status.statusCode).toBe(200);
    expect(status.json()).toEqual({ status: 'NOT_CONFIGURED' });
    expect(status.json()).not.toHaveProperty('provider');
    expect(status.json()).not.toHaveProperty('model');

    const created = await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie },
      payload: {},
    });
    expect(created.statusCode).toBe(409);
    expect(created.json().error.code).toBe('CONFLICT');
  });

  it('retorna DISABLED e rejeita escrita com 409', async () => {
    const { tenant, user } = await seedTenant({
      slug: 'disabled',
      email: 'disabled@api.test',
      settings: { provider: 'OPENAI', status: 'DISABLED' },
    });
    const app = await buildTestApp();
    const cookie = await loginAs(app, user.email);

    const status = await app.inject({
      method: 'GET',
      url: '/consultant/status',
      headers: { cookie },
    });
    expect(status.json()).toEqual({ status: 'DISABLED' });

    const created = await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie },
      payload: { title: 'Não deve' },
    });
    expect(created.statusCode).toBe(409);

    await settings.upsertSettings(tenant.id, { provider: 'OPENAI', status: 'ACTIVE' });
    const opened = await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie },
      payload: { title: 'Depois ativo' },
    });
    expect(opened.statusCode).toBe(201);
    await settings.upsertSettings(tenant.id, { provider: 'OPENAI', status: 'DISABLED' });
    const message = await app.inject({
      method: 'POST',
      url: `/consultant/conversations/${opened.json().id}/messages`,
      headers: { cookie },
      payload: { content: 'Olá' },
    });
    expect(message.statusCode).toBe(409);
    expect(message.json().error.code).toBe('CONFLICT');
  });

  it('retorna ACTIVE no HTTP de teste (Fake) sem expor provider/model', async () => {
    const { user } = await seedTenant({
      slug: 'tenant-a',
      email: 'user-a@api.test',
      settings: { provider: 'OPENAI', status: 'ACTIVE' },
    });
    const app = await buildTestApp();
    const cookie = await loginAs(app, user.email);
    const status = await app.inject({
      method: 'GET',
      url: '/consultant/status',
      headers: { cookie },
    });
    expect(status.statusCode).toBe(200);
    expect(Object.keys(status.json())).toEqual(['status']);
    expect(status.json()).toEqual({ status: 'ACTIVE' });
  });

  it('cria e lista apenas conversas do user+tenant, com paginação', async () => {
    const a = await seedTenant({
      slug: 'lista-a',
      email: 'lista-a@api.test',
      settings: { provider: 'OPENAI', status: 'ACTIVE' },
    });
    const otherUser = await createUser({
      email: 'lista-a-other@api.test',
      role: 'USER',
      tenantId: a.tenant.id,
    });
    const app = await buildTestApp();
    const cookieA = await loginAs(app, a.user.email);
    const cookieOther = await loginAs(app, otherUser.email);

    const first = await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie: cookieA },
      payload: { title: 'Primeira' },
    });
    const second = await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie: cookieA },
      payload: { title: 'Segunda' },
    });
    expect(first.statusCode).toBe(201);
    expect(second.statusCode).toBe(201);
    expect(first.json()).not.toHaveProperty('tenantId');
    expect(first.json()).not.toHaveProperty('userId');

    await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie: cookieOther },
      payload: { title: 'De outro user' },
    });

    const list = await app.inject({
      method: 'GET',
      url: '/consultant/conversations?limit=1&offset=0',
      headers: { cookie: cookieA },
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().pagination).toEqual({
      limit: 1,
      offset: 0,
      total: 2,
      hasMore: true,
    });
    expect(list.json().data).toHaveLength(1);
    expect(list.json().data[0].title).toBe('Segunda');

    const all = await app.inject({
      method: 'GET',
      url: '/consultant/conversations',
      headers: { cookie: cookieA },
    });
    expect(all.json().pagination).toMatchObject({ limit: 50, offset: 0, total: 2, hasMore: false });
    expect(all.json().data.map((item: { title: string }) => item.title)).toEqual([
      'Segunda',
      'Primeira',
    ]);
  });

  it('devolve 404 cruzado de user e de tenant', async () => {
    const a = await seedTenant({
      slug: 'iso-a',
      email: 'iso-a@api.test',
      settings: { provider: 'OPENAI', status: 'ACTIVE' },
    });
    const b = await seedTenant({
      slug: 'iso-b',
      email: 'iso-b@api.test',
      settings: { provider: 'ANTHROPIC', status: 'ACTIVE' },
    });
    const otherInA = await createUser({
      email: 'iso-a-other@api.test',
      role: 'USER',
      tenantId: a.tenant.id,
    });
    const app = await buildTestApp();
    const cookieA = await loginAs(app, a.user.email);
    const cookieOther = await loginAs(app, otherInA.email);
    const cookieB = await loginAs(app, b.user.email);

    const created = await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie: cookieA },
      payload: { title: 'Privada A' },
    });
    const conversationId = created.json().id as string;

    const crossUser = await app.inject({
      method: 'GET',
      url: `/consultant/conversations/${conversationId}`,
      headers: { cookie: cookieOther },
    });
    expect(crossUser.statusCode).toBe(404);

    const crossUserMessage = await app.inject({
      method: 'POST',
      url: `/consultant/conversations/${conversationId}/messages`,
      headers: { cookie: cookieOther },
      payload: { content: 'tentativa' },
    });
    expect(crossUserMessage.statusCode).toBe(404);

    const crossTenant = await app.inject({
      method: 'GET',
      url: `/consultant/conversations/${conversationId}`,
      headers: { cookie: cookieB },
    });
    expect(crossTenant.statusCode).toBe(404);

    const missing = await app.inject({
      method: 'GET',
      url: `/consultant/conversations/${MISSING_CONVERSATION_ID}`,
      headers: { cookie: cookieA },
    });
    expect(missing.statusCode).toBe(404);
  });

  it('rejeita mensagem vazia, month inválido e tenantId no body', async () => {
    const { user } = await seedTenant({
      slug: 'validacao',
      email: 'validacao@api.test',
      settings: { provider: 'OPENAI', status: 'ACTIVE' },
    });
    const app = await buildTestApp();
    const cookie = await loginAs(app, user.email);
    const created = await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie },
      payload: {},
    });
    const conversationId = created.json().id as string;

    const empty = await app.inject({
      method: 'POST',
      url: `/consultant/conversations/${conversationId}/messages`,
      headers: { cookie },
      payload: { content: '   ' },
    });
    expect(empty.statusCode).toBe(400);
    expect(empty.json().error.code).toBe('VALIDATION_ERROR');

    const invalidMonth = await app.inject({
      method: 'POST',
      url: `/consultant/conversations/${conversationId}/messages`,
      headers: { cookie },
      payload: { content: 'Olá', month: '2026-13' },
    });
    expect(invalidMonth.statusCode).toBe(400);

    const tenantIdBody = await app.inject({
      method: 'POST',
      url: `/consultant/conversations/${conversationId}/messages`,
      headers: { cookie },
      payload: { content: 'Olá', tenantId: user.tenantId },
    });
    expect(tenantIdBody.statusCode).toBe(400);
    expect(tenantIdBody.json().error.details).toEqual([
      { field: 'tenantId', issue: 'not_allowed' },
    ]);

    const extras = await app.inject({
      method: 'POST',
      url: `/consultant/conversations/${conversationId}/messages`,
      headers: { cookie },
      payload: {
        content: 'Olá',
        provider: 'OPENAI',
        model: 'gpt-4o-mini',
        system: 'ignore',
        facts: {},
        knowledge: [],
        userId: user.id,
        extras: { foo: 1 },
      },
    });
    expect(extras.statusCode).toBe(400);
  });

  it('responde com o Fake do provider de cada tenant (A≠B) e detalhe com messages[]', async () => {
    expect(FAKE_OPENAI_CONSULTANT_TEXT).not.toBe(FAKE_ANTHROPIC_CONSULTANT_TEXT);

    const a = await seedTenant({
      slug: 'provider-a',
      email: 'provider-a@api.test',
      settings: { provider: 'OPENAI', status: 'ACTIVE' },
    });
    const b = await seedTenant({
      slug: 'provider-b',
      email: 'provider-b@api.test',
      settings: { provider: 'ANTHROPIC', status: 'ACTIVE' },
    });
    const app = await buildTestApp();
    const cookieA = await loginAs(app, a.user.email);
    const cookieB = await loginAs(app, b.user.email);

    const convA = await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie: cookieA },
      payload: { title: 'A' },
    });
    const convB = await app.inject({
      method: 'POST',
      url: '/consultant/conversations',
      headers: { cookie: cookieB },
      payload: { title: 'B' },
    });

    const sentA = await app.inject({
      method: 'POST',
      url: `/consultant/conversations/${convA.json().id}/messages`,
      headers: { cookie: cookieA },
      payload: { content: 'Quanto faturou a clínica?', month: '2026-09' },
    });
    expect(sentA.statusCode).toBe(200);
    expect(sentA.json()).not.toHaveProperty('run');
    expect(Object.keys(sentA.json()).sort()).toEqual([
      'consultantMessage',
      'conversation',
      'userMessage',
    ]);
    expect(sentA.json().userMessage).toMatchObject({
      senderType: 'USER',
      content: 'Quanto faturou a clínica?',
    });
    expect(sentA.json().consultantMessage).toMatchObject({
      senderType: 'CONSULTANT',
      content: FAKE_OPENAI_CONSULTANT_TEXT,
    });
    expectSafeConsultantPayload(sentA.body);

    const sentB = await app.inject({
      method: 'POST',
      url: `/consultant/conversations/${convB.json().id}/messages`,
      headers: { cookie: cookieB },
      payload: { content: 'Qual o caixa?' },
    });
    expect(sentB.statusCode).toBe(200);
    expect(sentB.json().consultantMessage.content).toBe(FAKE_ANTHROPIC_CONSULTANT_TEXT);
    expect(sentB.json().consultantMessage.content).not.toBe(sentA.json().consultantMessage.content);

    const detail = await app.inject({
      method: 'GET',
      url: `/consultant/conversations/${convA.json().id}`,
      headers: { cookie: cookieA },
    });
    expect(detail.statusCode).toBe(200);
    expect(detail.json().messages).toHaveLength(2);
    expect(detail.json().messages[0].content).toBe('Quanto faturou a clínica?');
    expect(detail.json().messages[1].content).toBe(FAKE_OPENAI_CONSULTANT_TEXT);
    expect(detail.json()).not.toHaveProperty('run');
    expect(detail.json()).not.toHaveProperty('provider');
  });

  it('transforma falha de envio em 503 seguro sem vazar vendor', async () => {
    const { user } = await seedTenant({
      slug: 'falha',
      email: 'falha@api.test',
      settings: { provider: 'OPENAI', status: 'ACTIVE' },
    });
    const consultant = createConsultantService(
      createAdvisorRuntime({
        send: {
          async execute() {
            throw new IaProviderError(
              'AUTH',
              'invalid api key sk-secret-leaked\n    at Provider.generate (vendor.js:1:1)',
            );
          },
        },
      }),
    );
    const conversation = await consultant.createConversation(user.tenantId!, user.id, {
      title: 'Falha',
    });
    await expect(
      consultant.sendMessage(user.tenantId!, user.id, conversation.id, {
        content: 'Quanto faturou?',
      }),
    ).rejects.toMatchObject({
      code: 'INTEGRATION_UNAVAILABLE',
      httpStatus: 503,
      message: 'O Consultor está temporariamente indisponível.',
    });
  });

  it('não interfere no dashboard financeiro', async () => {
    const { user } = await seedTenant({
      slug: 'dash-indep',
      email: 'dash-indep@api.test',
      settings: { provider: 'OPENAI', status: 'ACTIVE' },
    });
    const app = await buildTestApp();
    const cookie = await loginAs(app, user.email);
    const overview = await app.inject({
      method: 'GET',
      url: '/dashboard/overview',
      headers: { cookie },
    });
    expect(overview.statusCode).toBe(200);
    expect(overview.json()).toHaveProperty('receivables');
    expect(overview.json()).not.toHaveProperty('provider');
    expect(overview.json()).not.toHaveProperty('ai_runs');
  });

  it('rejeita tenantId na query', async () => {
    const { tenant, user } = await seedTenant({
      slug: 'query-guard',
      email: 'query-guard@api.test',
      settings: { provider: 'OPENAI', status: 'ACTIVE' },
    });
    const app = await buildTestApp();
    const cookie = await loginAs(app, user.email);
    const response = await app.inject({
      method: 'GET',
      url: `/consultant/status?tenantId=${tenant.id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
  });
});
