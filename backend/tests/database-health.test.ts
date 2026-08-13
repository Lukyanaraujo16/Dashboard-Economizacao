import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';
const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const originalDatabaseUrl = process.env.DATABASE_URL;
const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.REDIS_URL = TEST_REDIS_URL;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();

  if (originalDatabaseUrl === undefined) {
    delete process.env.DATABASE_URL;
  } else {
    process.env.DATABASE_URL = originalDatabaseUrl;
  }
});

describe('GET /health/db', () => {
  it('responde de forma sanitizada quando DATABASE_URL não está configurada', async () => {
    delete process.env.DATABASE_URL;
    const app = await buildApp();
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/health/db' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.body).not.toContain('DATABASE_URL');
    expect(response.body).not.toContain('postgresql://');
  });
});
