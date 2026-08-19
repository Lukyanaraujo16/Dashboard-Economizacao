import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { loadEnvironment } from '../src/config/env.js';
import { encryptSecret } from '../src/infrastructure/crypto/secret-box.js';
import { disconnectPrisma, getPrismaClient } from '../src/infrastructure/database/prisma.js';
import {
  createArgon2idPasswordHasher,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
import {
  CONTA_AZUL_AUTHORIZATION_URL,
  CONTA_AZUL_CONNECTED_COMPANY_URL,
  CONTA_AZUL_SCOPE,
  CONTA_AZUL_TOKEN_URL,
} from '../src/modules/integrations/conta-azul/domain/conta-azul-oauth.js';
import { createContaAzulIntegrationRepository } from '../src/modules/integrations/conta-azul/repositories/integration.repository.js';
import { createContaAzulOAuthService } from '../src/modules/integrations/conta-azul/services/conta-azul-oauth.service.js';
import { createContaAzulOAuthStateStore } from '../src/modules/integrations/conta-azul/services/oauth-state.store.js';
import { cleanTestDatabase } from './helpers/test-database.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const VALID_PASSWORD = 'Password#12345';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();
const prisma = getPrismaClient();
const tenants = createTenantRepository(prisma);
const users = createUserRepository(prisma);
const credentials = createUserCredentialRepository(prisma);
const passwordHasher = createArgon2idPasswordHasher();
const integrations = createContaAzulIntegrationRepository(prisma);

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  await Promise.all(
    [...apps].map(async (app) => {
      const sessionKeys = await app.redis.keys(`${buildSessionKeyPrefix('test')}*`);
      const oauthKeys = await app.redis.keys(
        'dashboard-economizacao:test:oauth:conta-azul:state:*',
      );
      const keys = [...sessionKeys, ...oauthKeys];
      if (keys.length > 0) {
        await app.redis.del(...keys);
      }
      await app.close();
    }),
  );
  apps.clear();
  await cleanTestDatabase(prisma);
});

afterAll(async () => {
  await disconnectPrisma();
});

function readCookie(header: string | string[] | undefined): string {
  const values = Array.isArray(header) ? header : header ? [header] : [];
  const cookie = values.find((value) => value.startsWith('dashboard.sid='));
  if (!cookie) {
    throw new Error('Cookie de sessão ausente.');
  }
  return cookie.split(';')[0]!;
}

function parseAuthorizationQuery(url: string): URLSearchParams {
  const hash = url.slice(url.indexOf('#') + 1);
  return new URLSearchParams(hash.slice(hash.indexOf('?') + 1));
}

function tokenResponse(overrides?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      access_token: 'access-1',
      refresh_token: 'refresh-1',
      expires_in: 3600,
      token_type: 'Bearer',
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

function connectedCompanyResponse(overrides?: Record<string, unknown>): Response {
  return new Response(
    JSON.stringify({
      id_empresa: '123456',
      documento: '05206246000138',
      razao_social: 'Conta Azul Software Ltda',
      nome_fantasia: 'Conta Azul',
      email: 'api@contaazul.com',
      data_fundacao: '2012-01-01',
      ...overrides,
    }),
    { status: 200, headers: { 'Content-Type': 'application/json' } },
  );
}

const disconnectedPublic = {
  provider: 'CONTA_AZUL',
  status: 'DISCONNECTED',
  connectedAt: null,
  disconnectedAt: null,
  externalAccountId: null,
  externalCompanyName: null,
  lastSuccessfulSyncAt: null,
  lastErrorAt: null,
  lastErrorCode: null,
  autoSyncEligible: false,
  autoSyncIntervalMinutes: 60,
};

function stubContaAzulNetwork(options?: {
  readonly identityForUrl?: (url: string) => Response;
}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn().mockImplementation((url: string) => {
    const href = String(url);
    if (href.includes('/oauth/token')) {
      return Promise.resolve(tokenResponse());
    }
    if (href.includes('/v1/pessoas/conta-conectada')) {
      return Promise.resolve(options?.identityForUrl?.(href) ?? connectedCompanyResponse());
    }
    return Promise.resolve(new Response('unexpected', { status: 500 }));
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function createActiveUser(
  email: string,
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN',
  tenantId?: string,
) {
  let resolvedTenantId: string | null = tenantId ?? null;
  if (role === 'USER' && !resolvedTenantId) {
    resolvedTenantId = (
      await tenants.create({
        name: `tenant-${email}`,
        displayName: `Tenant ${email}`,
      })
    ).id;
  }
  const user = await users.create({
    name: `Operador ${role}`,
    email,
    role,
    tenantId: resolvedTenantId,
    status: 'ACTIVE',
  });
  await credentials.create({
    userId: user.id,
    passwordHash: await passwordHasher.hash(VALID_PASSWORD),
  });
  return user;
}

async function buildTestApp() {
  const app = await buildApp();
  apps.add(app);
  return app;
}

async function login(app: Awaited<ReturnType<typeof buildApp>>, email: string): Promise<string> {
  const response = await app.inject({
    method: 'POST',
    url: '/auth/login',
    payload: { email, password: VALID_PASSWORD },
  });
  expect(response.statusCode).toBe(200);
  return readCookie(response.headers['set-cookie']);
}

describe('OAuth Conta Azul (fase 2.1)', () => {
  it('sem sessão retorna 401', async () => {
    const tenant = await tenants.create({ name: 'oauth-anon', displayName: 'Anon' });
    const app = await buildTestApp();
    const response = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul`,
    });
    expect(response.statusCode).toBe(401);
  });

  it.each([
    ['USER', 'oauth.user@test.local'],
    ['ADMIN', 'oauth.admin@test.local'],
    ['SUPER_ADMIN', 'oauth.super@test.local'],
  ] as const)('%s no GET de status', async (role, email) => {
    await createActiveUser(email, role);
    const tenant = await tenants.create({ name: `oauth-get-${role}`, displayName: role });
    const app = await buildTestApp();
    const cookie = await login(app, email);
    const response = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul`,
      headers: { cookie },
    });
    if (role === 'USER') {
      expect(response.statusCode).toBe(403);
      return;
    }
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(disconnectedPublic);
    expect(JSON.stringify(response.json())).not.toMatch(/access|refresh|token/i);
  });

  it('USER recebe 403 no connect', async () => {
    await createActiveUser('oauth.user-connect@test.local', 'USER');
    const tenant = await tenants.create({ name: 'oauth-user-connect', displayName: 'User' });
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.user-connect@test.local');
    const response = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('connect gera authorization URL oficial e state session-bound', async () => {
    await createActiveUser('oauth.admin-connect@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'oauth-connect', displayName: 'Connect' });
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.admin-connect@test.local');
    const response = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(200);
    const authorizationUrl = response.json().authorizationUrl as string;
    expect(authorizationUrl.startsWith(`${CONTA_AZUL_AUTHORIZATION_URL}?`)).toBe(true);
    const params = parseAuthorizationQuery(authorizationUrl);
    expect(params.get('response_type')).toBe('code');
    expect(params.get('client_id')).toBe('test-conta-azul-client-id');
    expect(params.get('redirect_uri')).toBe(
      'http://127.0.0.1:3000/integrations/conta-azul/callback',
    );
    expect(params.get('scope')).toBe(CONTA_AZUL_SCOPE);
    expect(params.get('state')).toBeTruthy();
    expect(params.get('state')).not.toBe(tenant.id);
  });

  it('rejeita tenant inexistente e DISABLED no connect', async () => {
    await createActiveUser('oauth.admin-disabled@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'oauth-disabled', displayName: 'Disabled' });
    await tenants.disable(tenant.id);
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.admin-disabled@test.local');

    const missing = await app.inject({
      method: 'POST',
      url: '/admin/tenants/00000000-0000-4000-8000-000000000099/integrations/conta-azul/connect',
      headers: { cookie },
    });
    expect(missing.statusCode).toBe(404);

    const disabled = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    expect(disabled.statusCode).toBe(422);
  });

  it('callback sucesso persiste tokens cifrados e não os expõe', async () => {
    const fetchMock = stubContaAzulNetwork();
    await createActiveUser('oauth.admin-callback@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'oauth-callback', displayName: 'Callback' });
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.admin-callback@test.local');
    const connect = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    const state = parseAuthorizationQuery(connect.json().authorizationUrl as string).get('state');

    const callback = await app.inject({
      method: 'GET',
      url: `/integrations/conta-azul/callback?code=auth-code-1&state=${state}`,
      headers: { cookie },
    });
    expect(callback.statusCode).toBe(302);
    expect(callback.headers.location).toBe(
      `http://127.0.0.1:3000/empresas/${tenant.id}/integracoes?contaAzul=connected`,
    );

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toBe(CONTA_AZUL_TOKEN_URL);
    expect((fetchMock.mock.calls[0]![1] as RequestInit).headers).toMatchObject({
      'Content-Type': 'application/x-www-form-urlencoded',
    });
    expect(String(fetchMock.mock.calls[1]![0])).toBe(CONTA_AZUL_CONNECTED_COMPANY_URL);
    const identityHeaders = (fetchMock.mock.calls[1]![1] as RequestInit).headers as Record<
      string,
      string
    >;
    expect(identityHeaders.Authorization).toMatch(/^Bearer /);

    const status = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul`,
      headers: { cookie },
    });
    expect(status.json()).toMatchObject({
      status: 'CONNECTED',
      externalAccountId: '123456',
      externalCompanyName: 'Conta Azul Software Ltda',
      lastSuccessfulSyncAt: null,
      lastErrorCode: null,
    });
    expect(JSON.stringify(status.json())).not.toContain('access-1');
    expect(JSON.stringify(status.json())).not.toContain('refresh-1');

    const stored = await prisma.integrationCredential.findFirstOrThrow();
    expect(stored.encryptedAccessToken).not.toContain('access-1');
    expect(stored.encryptedRefreshToken).not.toContain('refresh-1');
    expect(stored.encryptedAccessToken.startsWith('v1.')).toBe(true);
    expect(await prisma.integrationExternalAccount.count()).toBe(1);
  });

  it('rejeita state inválido, replay, sessão diferente, code ausente e access_denied', async () => {
    await createActiveUser('oauth.admin-errors@test.local', 'ADMIN');
    await createActiveUser('oauth.admin-errors-b@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'oauth-errors', displayName: 'Errors' });
    const app = await buildTestApp();
    const cookieA = await login(app, 'oauth.admin-errors@test.local');
    const cookieB = await login(app, 'oauth.admin-errors-b@test.local');
    const connect = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie: cookieA },
    });
    const state = parseAuthorizationQuery(connect.json().authorizationUrl as string).get('state');

    const invalid = await app.inject({
      method: 'GET',
      url: '/integrations/conta-azul/callback?code=x&state=not-a-real-state',
      headers: { cookie: cookieA },
    });
    expect(invalid.headers.location).toContain('contaAzul=replay');

    const denied = await app.inject({
      method: 'GET',
      url: `/integrations/conta-azul/callback?error=access_denied&state=${state}`,
      headers: { cookie: cookieA },
    });
    expect(denied.headers.location).toContain(`contaAzul=denied`);

    const connect2 = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie: cookieA },
    });
    const state2 = parseAuthorizationQuery(connect2.json().authorizationUrl as string).get('state');
    const otherSession = await app.inject({
      method: 'GET',
      url: `/integrations/conta-azul/callback?code=x&state=${state2}`,
      headers: { cookie: cookieB },
    });
    expect(otherSession.headers.location).toContain('contaAzul=expired');

    const connect3 = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie: cookieA },
    });
    const state3 = parseAuthorizationQuery(connect3.json().authorizationUrl as string).get('state');
    const missingCode = await app.inject({
      method: 'GET',
      url: `/integrations/conta-azul/callback?state=${state3}`,
      headers: { cookie: cookieA },
    });
    expect(missingCode.headers.location).toContain('contaAzul=error');
  });

  it('callback sem sessão não conclui autorização', async () => {
    await createActiveUser('oauth.admin-nosession@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'oauth-nosession', displayName: 'No Session' });
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.admin-nosession@test.local');
    const connect = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    const state = parseAuthorizationQuery(connect.json().authorizationUrl as string).get('state');
    const callback = await app.inject({
      method: 'GET',
      url: `/integrations/conta-azul/callback?code=x&state=${state}`,
    });
    expect(callback.headers.location).toContain('contaAzul=expired');
    const status = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul`,
      headers: { cookie },
    });
    expect(status.json().status).toBe('DISCONNECTED');
  });

  it('falha upstream no exchange não persiste tokens', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('nope', { status: 400 })));
    await createActiveUser('oauth.admin-upstream@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'oauth-upstream', displayName: 'Upstream' });
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.admin-upstream@test.local');
    const connect = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    const state = parseAuthorizationQuery(connect.json().authorizationUrl as string).get('state');
    const callback = await app.inject({
      method: 'GET',
      url: `/integrations/conta-azul/callback?code=bad&state=${state}`,
      headers: { cookie },
    });
    expect(callback.headers.location).toContain('contaAzul=error');
    expect(await prisma.integrationCredential.count()).toBe(0);
  });

  it('tenant A não desconecta tenant B; disconnect é idempotente', async () => {
    let identitySeq = 0;
    stubContaAzulNetwork({
      identityForUrl: () => {
        identitySeq += 1;
        return connectedCompanyResponse({ id_empresa: `empresa-${identitySeq}` });
      },
    });
    await createActiveUser('oauth.admin-iso@test.local', 'ADMIN');
    const tenantA = await tenants.create({ name: 'oauth-iso-a', displayName: 'A' });
    const tenantB = await tenants.create({ name: 'oauth-iso-b', displayName: 'B' });
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.admin-iso@test.local');

    const connectA = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantA.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    const stateA = parseAuthorizationQuery(connectA.json().authorizationUrl as string).get('state');
    await app.inject({
      method: 'GET',
      url: `/integrations/conta-azul/callback?code=a&state=${stateA}`,
      headers: { cookie },
    });

    const connectB = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantB.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    const stateB = parseAuthorizationQuery(connectB.json().authorizationUrl as string).get('state');
    await app.inject({
      method: 'GET',
      url: `/integrations/conta-azul/callback?code=b&state=${stateB}`,
      headers: { cookie },
    });

    await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantA.id}/integrations/conta-azul/disconnect`,
      headers: { cookie },
    });
    const statusA = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantA.id}/integrations/conta-azul`,
      headers: { cookie },
    });
    const statusB = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantB.id}/integrations/conta-azul`,
      headers: { cookie },
    });
    expect(statusA.json().status).toBe('DISCONNECTED');
    expect(statusA.json().externalAccountId).toBeNull();
    expect(statusB.json().status).toBe('CONNECTED');
    expect(statusB.json().externalAccountId).toBe('empresa-2');

    const again = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantA.id}/integrations/conta-azul/disconnect`,
      headers: { cookie },
    });
    expect(again.statusCode).toBe(200);
    expect(again.json().status).toBe('DISCONNECTED');
  });

  it('reconnect substitui credenciais anteriores', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const href = String(url);
      if (href.includes('/oauth/token')) {
        const count = fetchMock.mock.calls.filter((call) =>
          String(call[0]).includes('/oauth/token'),
        ).length;
        return Promise.resolve(
          tokenResponse(
            count <= 1
              ? { access_token: 'first-access', refresh_token: 'first-refresh' }
              : { access_token: 'second-access', refresh_token: 'second-refresh' },
          ),
        );
      }
      if (href.includes('/v1/pessoas/conta-conectada')) {
        return Promise.resolve(connectedCompanyResponse({ id_empresa: 'reconnect-1' }));
      }
      return Promise.resolve(new Response('unexpected', { status: 500 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await createActiveUser('oauth.admin-reconnect@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'oauth-reconnect', displayName: 'Reconnect' });
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.admin-reconnect@test.local');

    for (const code of ['one', 'two']) {
      const connect = await app.inject({
        method: 'POST',
        url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
        headers: { cookie },
      });
      const state = parseAuthorizationQuery(connect.json().authorizationUrl as string).get('state');
      await app.inject({
        method: 'GET',
        url: `/integrations/conta-azul/callback?code=${code}&state=${state}`,
        headers: { cookie },
      });
    }

    expect(await prisma.integration.count()).toBe(1);
    expect(await prisma.integrationExternalAccount.count()).toBe(1);
    const stored = await prisma.integrationCredential.findFirstOrThrow();
    expect(stored.encryptedAccessToken).not.toContain('first-access');
    expect(stored.encryptedRefreshToken).not.toContain('first-refresh');
    expect(stored.encryptedAccessToken).not.toContain('second-access');
  });

  it('refresh rotaciona access e refresh; concorrência chama o provider uma vez', async () => {
    const environment = loadEnvironment();
    await createActiveUser('oauth.admin-refresh@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'oauth-refresh', displayName: 'Refresh' });
    await integrations.persistConnectedTokens({
      tenantId: tenant.id,
      encryptedAccessToken: encryptSecret('old-access', environment.integrationEncryptionKey),
      encryptedRefreshToken: encryptSecret('old-refresh', environment.integrationEncryptionKey),
      accessExpiresAt: new Date(Date.now() + 60_000),
      tokenType: 'Bearer',
      at: new Date(),
    });

    let refreshCalls = 0;
    const tokenClient = {
      exchangeAuthorizationCode: async () => {
        throw new Error('não deveria trocar code');
      },
      refresh: async () => {
        refreshCalls += 1;
        await new Promise((resolve) => setTimeout(resolve, 50));
        return {
          accessToken: 'new-access',
          refreshToken: 'new-refresh',
          expiresIn: 3600,
          tokenType: 'Bearer',
        };
      },
    };

    const app = await buildTestApp();
    const service = createContaAzulOAuthService({
      tenants,
      integrations,
      stateStore: createContaAzulOAuthStateStore(app.redis, 'test'),
      tokenClient,
      contaAzul: environment.contaAzul!,
      encryptionKey: environment.integrationEncryptionKey,
      refreshSkewMs: 5 * 60 * 1000,
    });

    const [first, second] = await Promise.all([
      service.getValidAccessToken(tenant.id),
      service.getValidAccessToken(tenant.id),
    ]);
    expect(first).toBe('new-access');
    expect(second).toBe('new-access');
    expect(refreshCalls).toBe(1);

    const stillFresh = await service.getValidAccessToken(tenant.id);
    expect(stillFresh).toBe('new-access');
    expect(refreshCalls).toBe(1);

    const stored = await prisma.integrationCredential.findFirstOrThrow();
    expect(stored.encryptedRefreshToken).not.toContain('old-refresh');
    expect(stored.encryptedRefreshToken).not.toContain('new-refresh');
  });

  it('access ainda válido não chama o provider', async () => {
    const environment = loadEnvironment();
    const tenant = await tenants.create({ name: 'oauth-fresh', displayName: 'Fresh' });
    await integrations.persistConnectedTokens({
      tenantId: tenant.id,
      encryptedAccessToken: encryptSecret('fresh-access', environment.integrationEncryptionKey),
      encryptedRefreshToken: encryptSecret('fresh-refresh', environment.integrationEncryptionKey),
      accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      tokenType: 'Bearer',
      at: new Date(),
    });
    const app = await buildTestApp();
    const service = createContaAzulOAuthService({
      tenants,
      integrations,
      stateStore: createContaAzulOAuthStateStore(app.redis, 'test'),
      tokenClient: {
        exchangeAuthorizationCode: async () => {
          throw new Error('no exchange');
        },
        refresh: async () => {
          throw new Error('no refresh');
        },
      },
      contaAzul: environment.contaAzul!,
      encryptionKey: environment.integrationEncryptionKey,
    });
    expect(await service.getValidAccessToken(tenant.id)).toBe('fresh-access');
  });

  it('refresh failure sanitizada marca ERROR', async () => {
    const environment = loadEnvironment();
    const tenant = await tenants.create({ name: 'oauth-refresh-fail', displayName: 'Fail' });
    await integrations.persistConnectedTokens({
      tenantId: tenant.id,
      encryptedAccessToken: encryptSecret('old-access', environment.integrationEncryptionKey),
      encryptedRefreshToken: encryptSecret('old-refresh', environment.integrationEncryptionKey),
      accessExpiresAt: new Date(Date.now() + 30_000),
      tokenType: 'Bearer',
      at: new Date(),
    });
    const app = await buildTestApp();
    const service = createContaAzulOAuthService({
      tenants,
      integrations,
      stateStore: createContaAzulOAuthStateStore(app.redis, 'test'),
      tokenClient: {
        exchangeAuthorizationCode: async () => {
          throw new Error('no');
        },
        refresh: async () => {
          throw new Error('invalid_grant');
        },
      },
      contaAzul: environment.contaAzul!,
      encryptionKey: environment.integrationEncryptionKey,
      refreshSkewMs: 5 * 60 * 1000,
    });

    await expect(service.getValidAccessToken(tenant.id)).rejects.toMatchObject({
      code: 'INTEGRATION_UNAVAILABLE',
    });
    const record = await prisma.integration.findFirstOrThrow({ where: { tenantId: tenant.id } });
    expect(record.status).toBe('ERROR');
    expect(record.lastErrorCode).toBe('refresh_failed');
  });

  it('bloqueia connect durante modo suporte', async () => {
    await createActiveUser('oauth.support@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({ name: 'oauth-support', displayName: 'Support' });
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.support@test.local');
    await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie },
      payload: { tenantId: tenant.id },
    });
    const response = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(403);
  });

  it('tenant com integração não pode ser excluído', async () => {
    const environment = loadEnvironment();
    await createActiveUser('oauth.admin-delete@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'oauth-delete', displayName: 'Delete' });
    await integrations.persistConnectedTokens({
      tenantId: tenant.id,
      encryptedAccessToken: encryptSecret('x', environment.integrationEncryptionKey),
      encryptedRefreshToken: encryptSecret('y', environment.integrationEncryptionKey),
      accessExpiresAt: new Date(Date.now() + 3600_000),
      tokenType: 'Bearer',
      at: new Date(),
    });
    const app = await buildTestApp();
    const cookie = await login(app, 'oauth.admin-delete@test.local');
    const response = await app.inject({
      method: 'DELETE',
      url: `/admin/tenants/${tenant.id}`,
      headers: { cookie },
    });
    expect(response.statusCode).toBe(409);
    expect(await tenants.findById(tenant.id)).not.toBeNull();
  });
});

describe('Gestão das conexões Conta Azul (fase 2.2)', () => {
  async function seedConnected(tenantId: string, token = 'access-live') {
    const environment = loadEnvironment();
    await integrations.persistConnectedTokens({
      tenantId,
      encryptedAccessToken: encryptSecret(token, environment.integrationEncryptionKey),
      encryptedRefreshToken: encryptSecret(
        `refresh-${token}`,
        environment.integrationEncryptionKey,
      ),
      accessExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
      tokenType: 'Bearer',
      at: new Date(),
    });
  }

  it('GET connected inclui identidade e lastSuccessfulSyncAt nulo sem tokens', async () => {
    stubContaAzulNetwork();
    await createActiveUser('id.admin-get@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'id-get', displayName: 'Get' });
    await seedConnected(tenant.id);
    const app = await buildTestApp();
    const cookie = await login(app, 'id.admin-get@test.local');
    const verify = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/verify`,
      headers: { cookie },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toMatchObject({
      provider: 'CONTA_AZUL',
      status: 'CONNECTED',
      externalAccountId: '123456',
      externalCompanyName: 'Conta Azul Software Ltda',
      lastSuccessfulSyncAt: null,
      lastErrorAt: null,
      lastErrorCode: null,
    });
    expect(JSON.stringify(verify.json())).not.toMatch(/access|refresh|token/i);

    const status = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul`,
      headers: { cookie },
    });
    expect(status.json().lastSuccessfulSyncAt).toBeNull();
    expect(await prisma.integrationExternalAccount.count()).toBe(1);
  });

  it('dois probes não duplicam a conta externa', async () => {
    stubContaAzulNetwork();
    await createActiveUser('id.admin-idem@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'id-idem', displayName: 'Idem' });
    await seedConnected(tenant.id);
    const app = await buildTestApp();
    const cookie = await login(app, 'id.admin-idem@test.local');
    await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/verify`,
      headers: { cookie },
    });
    await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/verify`,
      headers: { cookie },
    });
    expect(await prisma.integrationExternalAccount.count()).toBe(1);
  });

  it('401 persistente marca ERROR e preserva tokens', async () => {
    stubContaAzulNetwork({
      identityForUrl: () => new Response(JSON.stringify({ error: 'denied' }), { status: 401 }),
    });
    await createActiveUser('id.admin-401@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'id-401', displayName: '401' });
    await seedConnected(tenant.id);
    const app = await buildTestApp();
    const cookie = await login(app, 'id.admin-401@test.local');
    const verify = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/verify`,
      headers: { cookie },
    });
    expect(verify.statusCode).toBe(200);
    expect(verify.json()).toMatchObject({
      status: 'ERROR',
      lastErrorCode: 'identity_unauthorized',
      lastSuccessfulSyncAt: null,
    });
    expect(JSON.stringify(verify.json())).not.toContain('denied');
    expect(await prisma.integrationCredential.count()).toBe(1);
  });

  it('429 no verify não desconecta e não persiste lastError', async () => {
    stubContaAzulNetwork({
      identityForUrl: () => new Response(JSON.stringify({ error: 'slow' }), { status: 429 }),
    });
    await createActiveUser('id.admin-429@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'id-429', displayName: '429' });
    await seedConnected(tenant.id);
    const app = await buildTestApp();
    const cookie = await login(app, 'id.admin-429@test.local');
    const verify = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/verify`,
      headers: { cookie },
    });
    expect(verify.statusCode).toBe(503);
    const status = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul`,
      headers: { cookie },
    });
    expect(status.json().status).toBe('CONNECTED');
    expect(status.json().lastErrorCode).toBeNull();
    expect(await prisma.integrationCredential.count()).toBe(1);
  });

  it('500 no callback não apaga tokens e mantém CONNECTED', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string) => {
      const href = String(url);
      if (href.includes('/oauth/token')) {
        return Promise.resolve(tokenResponse());
      }
      return Promise.resolve(new Response(JSON.stringify({ error: 'boom' }), { status: 500 }));
    });
    vi.stubGlobal('fetch', fetchMock);
    await createActiveUser('id.admin-cb500@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'id-cb500', displayName: 'CB500' });
    const app = await buildTestApp();
    const cookie = await login(app, 'id.admin-cb500@test.local');
    const connect = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/connect`,
      headers: { cookie },
    });
    const state = parseAuthorizationQuery(connect.json().authorizationUrl as string).get('state');
    const callback = await app.inject({
      method: 'GET',
      url: `/integrations/conta-azul/callback?code=ok&state=${state}`,
      headers: { cookie },
    });
    expect(callback.headers.location).toContain('contaAzul=connected');
    const status = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul`,
      headers: { cookie },
    });
    expect(status.json().status).toBe('CONNECTED');
    expect(status.json().externalAccountId).toBeNull();
    expect(status.json().lastSuccessfulSyncAt).toBeNull();
    expect(await prisma.integrationCredential.count()).toBe(1);
    expect(await prisma.integrationExternalAccount.count()).toBe(0);
  });

  it('colisão de id_empresa não compartilha credencial e sinaliza ERROR', async () => {
    stubContaAzulNetwork();
    await createActiveUser('id.admin-conflict@test.local', 'ADMIN');
    const tenantA = await tenants.create({ name: 'id-conflict-a', displayName: 'A' });
    const tenantB = await tenants.create({ name: 'id-conflict-b', displayName: 'B' });
    await seedConnected(tenantA.id, 'token-a');
    await seedConnected(tenantB.id, 'token-b');
    const app = await buildTestApp();
    const cookie = await login(app, 'id.admin-conflict@test.local');

    const first = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantA.id}/integrations/conta-azul/verify`,
      headers: { cookie },
    });
    expect(first.json().status).toBe('CONNECTED');

    const second = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenantB.id}/integrations/conta-azul/verify`,
      headers: { cookie },
    });
    expect(second.json()).toMatchObject({
      status: 'ERROR',
      lastErrorCode: 'external_account_conflict',
      externalAccountId: '123456',
    });

    const credA = await prisma.integrationCredential.findFirst({
      where: { integration: { tenantId: tenantA.id } },
    });
    const credB = await prisma.integrationCredential.findFirst({
      where: { integration: { tenantId: tenantB.id } },
    });
    expect(credA?.id).not.toBe(credB?.id);
    expect(credA?.encryptedAccessToken).not.toBe(credB?.encryptedAccessToken);

    const statusA = await app.inject({
      method: 'GET',
      url: `/admin/tenants/${tenantA.id}/integrations/conta-azul`,
      headers: { cookie },
    });
    expect(statusA.json().status).toBe('CONNECTED');
  });

  it('USER e modo suporte recebem 403 no verify', async () => {
    await createActiveUser('id.user-verify@test.local', 'USER');
    await createActiveUser('id.support-verify@test.local', 'SUPER_ADMIN');
    const tenant = await tenants.create({ name: 'id-verify-403', displayName: '403' });
    const app = await buildTestApp();

    const userCookie = await login(app, 'id.user-verify@test.local');
    const userResponse = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/verify`,
      headers: { cookie: userCookie },
    });
    expect(userResponse.statusCode).toBe(403);

    const supportCookie = await login(app, 'id.support-verify@test.local');
    await app.inject({
      method: 'POST',
      url: '/auth/support/enter',
      headers: { cookie: supportCookie },
      payload: { tenantId: tenant.id },
    });
    const supportResponse = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/verify`,
      headers: { cookie: supportCookie },
    });
    expect(supportResponse.statusCode).toBe(403);
  });

  it('disconnect remove a conta externa e preserva lastSuccessfulSyncAt nulo', async () => {
    stubContaAzulNetwork();
    await createActiveUser('id.admin-disc@test.local', 'ADMIN');
    const tenant = await tenants.create({ name: 'id-disc', displayName: 'Disc' });
    await seedConnected(tenant.id);
    const app = await buildTestApp();
    const cookie = await login(app, 'id.admin-disc@test.local');
    await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/verify`,
      headers: { cookie },
    });
    expect(await prisma.integrationExternalAccount.count()).toBe(1);

    const disconnected = await app.inject({
      method: 'POST',
      url: `/admin/tenants/${tenant.id}/integrations/conta-azul/disconnect`,
      headers: { cookie },
    });
    expect(disconnected.json()).toMatchObject({
      status: 'DISCONNECTED',
      externalAccountId: null,
      externalCompanyName: null,
      lastSuccessfulSyncAt: null,
      lastErrorCode: null,
    });
    expect(await prisma.integrationExternalAccount.count()).toBe(0);
    expect(await prisma.integration.count()).toBe(1);
  });
});
