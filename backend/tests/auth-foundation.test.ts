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

describe('fundação de autenticação (1.1A)', () => {
  it('inicializa a aplicação com plugins de cookie e sessão carregados', async () => {
    const app = await buildApp();
    apps.add(app);

    await app.ready();

    expect(typeof app.parseCookie).toBe('function');
    expect(typeof app.decryptSession).toBe('function');
  });

  it('não emite cookie de sessão em requisição sem autenticação ativa', async () => {
    const app = await buildApp();
    apps.add(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
    expect(response.headers['set-cookie']).toBeUndefined();
  });

  it('mantém as rotas de health existentes', async () => {
    const app = await buildApp();
    apps.add(app);

    const health = await app.inject({ method: 'GET', url: '/health' });
    const healthDb = await app.inject({ method: 'GET', url: '/health/db' });

    expect(health.statusCode).toBe(200);
    expect(healthDb.statusCode).toBe(503);
    expect(healthDb.json()).toEqual({ status: 'unavailable' });
  });
});
