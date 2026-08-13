import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import { buildApp } from '../src/app/build-app.js';

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

describe('handler global de erros HTTP', () => {
  it('JSON malformado em rota distinta de /auth/login também retorna 400 sanitizado', async () => {
    const app = await buildApp();
    apps.add(app);

    const response = await app.inject({
      method: 'POST',
      url: '/__test__/session',
      headers: { 'content-type': 'application/json' },
      payload: '{not-json',
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_ERROR');
    expect(response.json().error.message).toBe('Requisição malformada.');
    expect(response.json().error.requestId).toBeTruthy();
    expect(response.body).not.toContain('FST_ERR');
    expect(response.body).not.toContain('{not-json');
  });

  it('erro interno não classificado permanece 500', async () => {
    const app = await buildApp();
    apps.add(app);

    app.get('/__test__/boom', async () => {
      throw new Error('boom-interno-nao-parser');
    });

    const response = await app.inject({ method: 'GET', url: '/__test__/boom' });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({
      error: {
        code: 'INTERNAL_ERROR',
        message: 'Não foi possível concluir a operação. Tente novamente.',
        requestId: expect.any(String),
      },
    });
    expect(response.body).not.toContain('boom-interno-nao-parser');
  });
});
