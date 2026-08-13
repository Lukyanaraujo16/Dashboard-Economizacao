import { afterEach, describe, expect, it, vi } from 'vitest';

import { authLoginPath } from '../src/lib/api-config';
import { login, LoginRequestError } from '../src/services/auth/login';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('login service', () => {
  it('envia POST same-origin com credentials e payload mínimo', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(login({ email: 'user@empresa.com', password: 'Password#12345' })).resolves.toEqual(
      { status: 'ok' },
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(authLoginPath());
    expect(init?.method).toBe('POST');
    expect(init?.credentials).toBe('include');
    expect(JSON.parse(String(init?.body))).toEqual({
      email: 'user@empresa.com',
      password: 'Password#12345',
    });
  });

  it('mapeia 401 para erro genérico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'UNAUTHENTICATED',
              message: 'Credenciais inválidas.',
              requestId: 'req-1',
            },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      login({ email: 'user@empresa.com', password: 'Password#12345' }),
    ).rejects.toMatchObject({
      kind: 'unauthenticated',
      message: 'Não foi possível entrar. Verifique suas credenciais.',
    });
  });

  it('mapeia 422 com details', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Dados de login inválidos.',
              details: [{ field: 'email', issue: 'invalid_format' }],
              requestId: 'req-2',
            },
          }),
          { status: 422, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    try {
      await login({ email: 'bad', password: 'Password#12345' });
      expect.fail('deveria rejeitar');
    } catch (error) {
      expect(error).toBeInstanceOf(LoginRequestError);
      expect(error).toMatchObject({
        kind: 'validation',
        details: [{ field: 'email', issue: 'invalid_format' }],
      });
    }
  });

  it('mapeia falha de rede como unavailable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(
      login({ email: 'user@empresa.com', password: 'Password#12345' }),
    ).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Não foi possível conectar ao serviço. Tente novamente.',
    });
  });

  it('mapeia 500 como unavailable sanitizado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Erro interno.',
              requestId: 'req-3',
            },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(
      login({ email: 'user@empresa.com', password: 'Password#12345' }),
    ).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Não foi possível conectar ao serviço. Tente novamente.',
    });
  });
});
