import { afterEach, describe, expect, it, vi } from 'vitest';

import { getCurrentUser } from '../src/services/auth/me';
import { logout } from '../src/services/auth/logout';
import { authLogoutPath, authMePath } from '../src/lib/api-config';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('getCurrentUser', () => {
  it('200 retorna usuário autenticado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            user: {
              id: 'u1',
              name: 'Ana',
              email: 'ana@empresa.com',
              role: 'USER',
              tenantId: 't1',
            },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(getCurrentUser()).resolves.toEqual({
      kind: 'authenticated',
      user: {
        id: 'u1',
        name: 'Ana',
        email: 'ana@empresa.com',
        role: 'USER',
        tenantId: 't1',
      },
    });

    const [url, init] = (fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0]!;
    expect(url).toBe(authMePath());
    expect(init?.credentials).toBe('include');
  });

  it('401 é unauthenticated', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'UNAUTHENTICATED', message: 'Credenciais inválidas.', requestId: 'r1' },
          }),
          { status: 401, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(getCurrentUser()).resolves.toEqual({ kind: 'unauthenticated' });
  });

  it('500/rede distingue erro de infraestrutura', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: { code: 'INTERNAL_ERROR', message: 'Erro interno.', requestId: 'r2' },
          }),
          { status: 500, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );

    await expect(getCurrentUser()).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Não foi possível verificar a sessão. Tente novamente.',
    });

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(getCurrentUser()).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Não foi possível verificar a sessão. Tente novamente.',
    });
  });
});

describe('logout service', () => {
  it('chama endpoint com credentials include', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ status: 'ok' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(logout()).resolves.toEqual({ status: 'ok' });
    expect(fetchMock).toHaveBeenCalledWith(authLogoutPath(), {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
  });

  it('falha de infraestrutura não finge sucesso', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    await expect(logout()).rejects.toMatchObject({
      kind: 'unavailable',
      message: 'Não foi possível encerrar a sessão. Tente novamente.',
    });
  });
});
