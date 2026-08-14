import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { getPrismaClient, disconnectPrisma } from '../src/infrastructure/database/prisma.js';
import {
  AUTH_LOCKOUT_DURATION_MINUTES,
  AUTH_MAX_FAILED_LOGIN_ATTEMPTS,
  createArgon2idPasswordHasher,
  createLoginService,
  createTenantRepository,
  createUserCredentialRepository,
  createUserRepository,
} from '../src/modules/auth/index.js';
import { UnauthenticatedError } from '../src/shared/errors/application-error.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';
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
        // Redis pode já ter sido encerrado em cenários de falha.
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

  // @fastify/session pode emitir um Set-Cookie de limpeza (sid vazio) junto com o novo.
  const withValue = values.filter((value) => /^dashboard\.sid=[^;]+/.test(value));
  return withValue.at(-1);
}

function cookieValue(setCookie: string): string {
  return setCookie.split(';')[0] ?? setCookie;
}

async function createActiveUser(options: {
  email: string;
  role: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  password?: string;
  status?: 'PENDING' | 'ACTIVE' | 'BLOCKED' | 'DISABLED';
  withCredential?: boolean;
  lockedUntil?: Date | null;
  failedLoginAttempts?: number;
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
    status: options.status ?? 'ACTIVE',
  });

  if (options.failedLoginAttempts !== undefined || options.lockedUntil !== undefined) {
    await prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: options.failedLoginAttempts ?? 0,
        lockedUntil: options.lockedUntil === undefined ? undefined : options.lockedUntil,
        status: options.status ?? 'ACTIVE',
      },
    });
  }

  if (options.withCredential !== false && (options.status ?? 'ACTIVE') !== 'PENDING') {
    const hash = await passwordHasher.hash(options.password ?? VALID_PASSWORD);
    await credentials.create({ userId: user.id, passwordHash: hash });
  } else if (options.withCredential === true) {
    const hash = await passwordHasher.hash(options.password ?? VALID_PASSWORD);
    await credentials.create({ userId: user.id, passwordHash: hash });
  }

  return users.findById(user.id);
}

describe('PasswordHasher Argon2id', () => {
  it('gera hash Argon2id e verifica senha', async () => {
    const hash = await passwordHasher.hash(VALID_PASSWORD);
    expect(hash.startsWith('$argon2id$')).toBe(true);
    expect(await passwordHasher.verify(hash, VALID_PASSWORD)).toBe(true);
    expect(await passwordHasher.verify(hash, 'wrong-password')).toBe(false);
  });
});

describe('LoginService — domínio', () => {
  it('rejeita PENDING, DISABLED, sem credencial e bloqueio administrativo', async () => {
    const clock = { now: new Date('2026-08-13T12:00:00.000Z') };
    const service = createLoginService({
      users,
      credentials,
      passwordHasher,
      clock: () => clock.now,
    });

    await createActiveUser({
      email: 'pending@login.test',
      role: 'USER',
      status: 'PENDING',
      withCredential: false,
    });
    await createActiveUser({
      email: 'disabled@login.test',
      role: 'USER',
      status: 'DISABLED',
    });
    await createActiveUser({
      email: 'nocred@login.test',
      role: 'USER',
      status: 'ACTIVE',
      withCredential: false,
    });
    await createActiveUser({
      email: 'adminblock@login.test',
      role: 'USER',
      status: 'BLOCKED',
      lockedUntil: null,
    });

    for (const email of [
      'pending@login.test',
      'disabled@login.test',
      'nocred@login.test',
      'adminblock@login.test',
      'missing@login.test',
    ]) {
      await expect(
        service.authenticate({ email, password: VALID_PASSWORD }),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
    }
  });

  it('recupera bloqueio temporário expirado e autentica', async () => {
    const now = new Date('2026-08-13T12:00:00.000Z');
    const service = createLoginService({
      users,
      credentials,
      passwordHasher,
      clock: () => now,
    });

    const user = await createActiveUser({
      email: 'expired-lock@login.test',
      role: 'USER',
      status: 'BLOCKED',
      lockedUntil: new Date('2026-08-13T11:00:00.000Z'),
      failedLoginAttempts: 5,
    });

    const principal = await service.authenticate({
      email: 'expired-lock@login.test',
      password: VALID_PASSWORD,
    });

    expect(principal.userId).toBe(user!.id);
    const after = await users.findById(user!.id);
    // recover happens before password success; registerSuccessfulLogin is HTTP-layer
    expect(after?.status).toBe('ACTIVE');
    expect(after?.failedLoginAttempts).toBe(0);
    expect(after?.lockedUntil).toBeNull();
  });

  it('incrementa falhas e bloqueia na 5ª tentativa', async () => {
    const now = new Date('2026-08-13T15:00:00.000Z');
    const service = createLoginService({
      users,
      credentials,
      passwordHasher,
      clock: () => now,
    });

    const user = await createActiveUser({
      email: 'lockout@login.test',
      role: 'USER',
    });

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      await expect(
        service.authenticate({ email: 'lockout@login.test', password: 'WrongPass!!' }),
      ).rejects.toBeInstanceOf(UnauthenticatedError);
      const current = await users.findById(user!.id);
      expect(current?.failedLoginAttempts).toBe(attempt);
      expect(current?.status).toBe('ACTIVE');
    }

    await expect(
      service.authenticate({ email: 'lockout@login.test', password: 'WrongPass!!' }),
    ).rejects.toBeInstanceOf(UnauthenticatedError);

    const blocked = await users.findById(user!.id);
    expect(blocked?.status).toBe('BLOCKED');
    expect(blocked?.failedLoginAttempts).toBe(AUTH_MAX_FAILED_LOGIN_ATTEMPTS);
    expect(blocked?.lockedUntil).toBeTruthy();
    const deltaMinutes = (blocked!.lockedUntil!.getTime() - now.getTime()) / (60 * 1000);
    expect(deltaMinutes).toBe(AUTH_LOCKOUT_DURATION_MINUTES);
  });
});

describe('POST /auth/login (1.1D)', () => {
  it('login válido: cookie HttpOnly, contexto Redis, lastLoginAt e múltiplas sessões', async () => {
    const user = await createActiveUser({
      email: '  Success.User@Example.TEST ',
      role: 'USER',
    });

    const app = await buildApp();
    apps.add(app);

    const first = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {
        email: '  Success.User@Example.TEST ',
        password: VALID_PASSWORD,
      },
      headers: { 'user-agent': 'vitest-agent-1' },
    });

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ status: 'ok' });
    expect(first.body).not.toContain('passwordHash');
    expect(first.body).not.toContain('$argon2id$');

    const cookie1Header = readSessionCookie(first.headers['set-cookie']);
    expect(cookie1Header).toBeTruthy();
    expect(cookie1Header!.toLowerCase()).toContain('httponly');

    const context1 = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie: cookieValue(cookie1Header!) },
    });
    expect(context1.statusCode).toBe(200);
    const body1 = context1.json();
    expect(body1.userId).toBe(user!.id);
    expect(body1.tenantId).toBe(user!.tenantId);
    expect(body1.role).toBe('USER');
    expect(body1.createdAt).toBeTruthy();
    expect(body1.lastAccess).toBeTruthy();
    expect(body1.userAgent).toBe('vitest-agent-1');

    const prefix = buildSessionKeyPrefix('test');
    const keysAfterFirst = await app.redis.keys(`${prefix}*`);
    expect(keysAfterFirst.length).toBeGreaterThanOrEqual(1);
    const payloads = await Promise.all(
      keysAfterFirst.map(async (key) => ({ key, value: await app.redis.get(key) })),
    );
    const stored = payloads.find((entry) => entry.value?.includes(user!.id))?.value;
    expect(stored).toBeTruthy();
    expect(stored).toContain(user!.id);
    expect(stored).not.toContain('passwordHash');
    expect(stored).not.toContain(VALID_PASSWORD);
    expect(stored).not.toContain(TEST_AUTH_SECRET);

    const refreshed = await users.findById(user!.id);
    expect(refreshed?.lastLoginAt).toBeInstanceOf(Date);
    expect(refreshed?.failedLoginAttempts).toBe(0);
    expect(refreshed?.lockedUntil).toBeNull();

    const second = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'success.user@example.test', password: VALID_PASSWORD },
    });
    expect(second.statusCode).toBe(200);
    const cookie2Header = readSessionCookie(second.headers['set-cookie']);
    expect(cookie2Header).toBeTruthy();
    expect(cookieValue(cookie2Header!)).not.toBe(cookieValue(cookie1Header!));

    const context2 = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie: cookieValue(cookie2Header!) },
    });
    expect(context2.json().sessionId).not.toBe(body1.sessionId);

    const stillFirst = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie: cookieValue(cookie1Header!) },
    });
    expect(stillFirst.json().userId).toBe(user!.id);

    const keysAfterSecond = await app.redis.keys(`${prefix}*`);
    expect(keysAfterSecond.length).toBeGreaterThanOrEqual(2);
  });

  it('ADMIN e SUPER_ADMIN autenticam com tenantId null', async () => {
    await createActiveUser({ email: 'admin@platform.test', role: 'ADMIN' });
    await createActiveUser({ email: 'super@platform.test', role: 'SUPER_ADMIN' });

    const app = await buildApp();
    apps.add(app);

    for (const email of ['admin@platform.test', 'super@platform.test']) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: VALID_PASSWORD },
      });
      expect(response.statusCode).toBe(200);
      const cookie = readSessionCookie(response.headers['set-cookie']);
      const context = await app.inject({
        method: 'GET',
        url: '/__test__/auth-context',
        headers: { cookie: cookieValue(cookie!) },
      });
      expect(context.json().tenantId).toBeNull();
      expect(['ADMIN', 'SUPER_ADMIN']).toContain(context.json().role);
    }
  });

  it('não enumera email inexistente vs senha inválida', async () => {
    await createActiveUser({ email: 'exists@login.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);

    const missing = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'missing@login.test', password: VALID_PASSWORD },
    });
    const wrong = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'exists@login.test', password: 'WrongPass!!' },
    });

    expect(missing.statusCode).toBe(401);
    expect(wrong.statusCode).toBe(401);
    expect(missing.json().error.code).toBe('UNAUTHENTICATED');
    expect(wrong.json().error.code).toBe('UNAUTHENTICATED');
    expect(missing.json().error.message).toBe(wrong.json().error.message);
    expect(missing.body).not.toContain('não encontrado');
    expect(wrong.body).not.toContain('senha');
  });

  it('lockout HTTP: 5 falhas, nega durante bloqueio, recupera após expiração', async () => {
    const user = await createActiveUser({ email: 'http-lock@login.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);

    for (let i = 0; i < 5; i += 1) {
      const failed = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email: 'http-lock@login.test', password: 'WrongPass!!' },
      });
      expect(failed.statusCode).toBe(401);
    }

    const blocked = await users.findById(user!.id);
    expect(blocked?.status).toBe('BLOCKED');
    expect(blocked?.lockedUntil).toBeTruthy();

    const duringLock = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'http-lock@login.test', password: VALID_PASSWORD },
    });
    expect(duringLock.statusCode).toBe(401);

    await prisma.user.update({
      where: { id: user!.id },
      data: { lockedUntil: new Date(Date.now() - 60_000) },
    });

    const afterExpiry = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'http-lock@login.test', password: VALID_PASSWORD },
    });
    expect(afterExpiry.statusCode).toBe(200);

    const recovered = await users.findById(user!.id);
    expect(recovered?.status).toBe('ACTIVE');
    expect(recovered?.failedLoginAttempts).toBe(0);
    expect(recovered?.lockedUntil).toBeNull();
  });

  it('bloqueio administrativo não é removido automaticamente', async () => {
    await createActiveUser({
      email: 'admin-locked@login.test',
      role: 'USER',
      status: 'BLOCKED',
      lockedUntil: null,
    });
    const app = await buildApp();
    apps.add(app);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'admin-locked@login.test', password: VALID_PASSWORD },
    });
    expect(response.statusCode).toBe(401);

    const still = await users.findByEmail('admin-locked@login.test');
    expect(still?.status).toBe('BLOCKED');
    expect(still?.lockedUntil).toBeNull();
  });

  it('PENDING e DISABLED não autenticam; usuário sem credencial também não', async () => {
    await createActiveUser({
      email: 'pending-http@login.test',
      role: 'USER',
      status: 'PENDING',
      withCredential: false,
    });
    await createActiveUser({
      email: 'disabled-http@login.test',
      role: 'USER',
      status: 'DISABLED',
    });
    await createActiveUser({
      email: 'active-nocred@login.test',
      role: 'USER',
      status: 'ACTIVE',
      withCredential: false,
    });

    const app = await buildApp();
    apps.add(app);

    for (const email of [
      'pending-http@login.test',
      'disabled-http@login.test',
      'active-nocred@login.test',
    ]) {
      const response = await app.inject({
        method: 'POST',
        url: '/auth/login',
        payload: { email, password: VALID_PASSWORD },
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    }
  });

  it('regenera sessão (anti session fixation) e /health não cria sessão', async () => {
    await createActiveUser({ email: 'fixation@login.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);

    const anonymous = await app.inject({
      method: 'POST',
      url: '/__test__/session',
      payload: { marker: 'pre-login' },
    });
    const anonymousCookie = readSessionCookie(anonymous.headers['set-cookie']);
    const before = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie: cookieValue(anonymousCookie!) },
    });
    const beforeId = before.json().sessionId;

    const login = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { cookie: cookieValue(anonymousCookie!) },
      payload: { email: 'fixation@login.test', password: VALID_PASSWORD },
    });
    expect(login.statusCode).toBe(200);
    const loginCookie = readSessionCookie(login.headers['set-cookie']);
    const after = await app.inject({
      method: 'GET',
      url: '/__test__/auth-context',
      headers: { cookie: cookieValue(loginCookie!) },
    });
    expect(after.json().sessionId).not.toBe(beforeId);
    expect(after.json().userId).toBeTruthy();

    const health = await app.inject({ method: 'GET', url: '/health' });
    expect(health.statusCode).toBe(200);
    expect(health.headers['set-cookie']).toBeUndefined();
  });

  it('payload semanticamente inválido retorna VALIDATION_ERROR com HTTP 422', async () => {
    const app = await buildApp();
    apps.add(app);

    const invalidEmail = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'not-an-email', password: VALID_PASSWORD },
    });
    expect(invalidEmail.statusCode).toBe(422);
    expect(invalidEmail.json().error.code).toBe('VALIDATION_ERROR');
    expect(invalidEmail.json().error.requestId).toBeTruthy();
    expect(invalidEmail.json().error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'email' })]),
    );

    const shortPassword = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'user@example.test', password: 'short' },
    });
    expect(shortPassword.statusCode).toBe(422);
    expect(shortPassword.json().error.code).toBe('VALIDATION_ERROR');
    expect(shortPassword.json().error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password', issue: 'min_length' })]),
    );

    const missingFields = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: {},
    });
    expect(missingFields.statusCode).toBe(422);
    expect(missingFields.json().error.code).toBe('VALIDATION_ERROR');
    expect(missingFields.json().error.details).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ field: 'email' }),
        expect.objectContaining({ field: 'password' }),
      ]),
    );
  });

  it('JSON sintaticamente inválido retorna HTTP 400 com envelope oficial', async () => {
    const app = await buildApp();
    apps.add(app);

    const response = await app.inject({
      method: 'POST',
      url: '/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: '{"email":',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({
      error: {
        code: 'VALIDATION_ERROR',
        message: 'Requisição malformada.',
        requestId: expect.any(String),
      },
    });
    expect(response.body).not.toContain('Unexpected');
    expect(response.body).not.toContain('stack');
    expect(response.body).not.toContain('{"email":');
  });

  it('falha Redis durante criação da sessão não autentica', async () => {
    await createActiveUser({ email: 'redis-fail@login.test', role: 'USER' });
    const app = await buildApp();
    apps.add(app);

    await app.redis.quit();

    const failedSession = await app.inject({
      method: 'POST',
      url: '/auth/login',
      payload: { email: 'redis-fail@login.test', password: VALID_PASSWORD },
    });
    expect(failedSession.statusCode).toBe(500);
    expect(failedSession.json().error.code).toBe('INTERNAL_ERROR');
    expect(failedSession.headers['set-cookie']).toBeUndefined();

    apps.delete(app);
    try {
      await app.close();
    } catch {
      // Redis já encerrado propositalmente neste cenário.
    }
  });
});
