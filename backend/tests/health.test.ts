import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';

const TEST_AUTH_SECRET = 'test-auth-secret-foundation-1-1a-32chars';

const apps = new Set<Awaited<ReturnType<typeof buildApp>>>();

beforeAll(() => {
  process.env.AUTH_SECRET = TEST_AUTH_SECRET;
  process.env.NODE_ENV = 'test';
});

afterEach(async () => {
  await Promise.all([...apps].map(async (app) => app.close()));
  apps.clear();
});

describe('GET /health', () => {
  it('responde que o processo HTTP está saudável', async () => {
    const app = await buildApp();
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
