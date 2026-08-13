import { afterEach, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';

const originalDatabaseUrl = process.env.DATABASE_URL;
const apps = new Set<ReturnType<typeof buildApp>>();

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
    const app = buildApp();
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/health/db' });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ status: 'unavailable' });
    expect(response.body).not.toContain('DATABASE_URL');
    expect(response.body).not.toContain('postgresql://');
  });
});
