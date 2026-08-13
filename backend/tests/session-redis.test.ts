import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';
import { buildSessionKeyPrefix } from '../src/modules/auth/session/redis-session-store.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
});

function readSessionCookie(setCookieHeader: string | string[] | undefined): string | undefined {
  const values = Array.isArray(setCookieHeader)
    ? setCookieHeader
    : setCookieHeader
      ? [setCookieHeader]
      : [];

  return values.find((value) => value.startsWith('dashboard.sid='));
}

describe('persistência de sessão Redis (1.1B)', () => {
  it('inicializa com Redis e session store sem MemoryStore implícito ativo', async () => {
    const app = await buildApp();
    apps.add(app);
    await app.ready();

    expect(typeof app.redis.ping).toBe('function');
    expect(typeof app.decryptSession).toBe('function');

    const ping = await app.redis.ping();
    expect(ping).toBe('PONG');
  });

  it('GET /health/redis responde ok com Redis ativo', async () => {
    const app = await buildApp();
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/health/redis' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.body).not.toContain('REDIS_URL');
    expect(response.body).not.toContain('redis://');
  });

  it('GET /health não cria cookie de sessão', async () => {
    const app = await buildApp();
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('persiste sessão no Redis entre requests e remove no destroy', async () => {
    const app = await buildApp();
    apps.add(app);

    const created = await app.inject({
      method: 'POST',
      url: '/__test__/session',
      payload: { marker: 'redis-1-1b' },
    });

    expect(created.statusCode).toBe(200);
    expect(created.json()).toEqual({ status: 'ok', marker: 'redis-1-1b' });

    const sessionCookie = readSessionCookie(created.headers['set-cookie']);
    expect(sessionCookie).toBeTruthy();

    const prefix = buildSessionKeyPrefix('test');
    const keys = await app.redis.keys(`${prefix}*`);
    expect(keys.length).toBeGreaterThan(0);

    const stored = await app.redis.get(keys[0]!);
    expect(stored).toBeTruthy();
    expect(stored).toContain('redis-1-1b');
    expect(stored).not.toContain(TEST_AUTH_SECRET);
    expect(stored).not.toContain('password');

    const ttl = await app.redis.ttl(keys[0]!);
    expect(ttl).toBeGreaterThan(0);

    const recovered = await app.inject({
      method: 'GET',
      url: '/__test__/session',
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(recovered.statusCode).toBe(200);
    expect(recovered.json()).toEqual({ status: 'ok', marker: 'redis-1-1b' });

    const destroyed = await app.inject({
      method: 'DELETE',
      url: '/__test__/session',
      headers: {
        cookie: sessionCookie,
      },
    });

    expect(destroyed.statusCode).toBe(200);
    expect(await app.redis.get(keys[0]!)).toBeNull();
  });
});
