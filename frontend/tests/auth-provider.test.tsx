import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { AuthProvider, useAuth } from '../src/auth';
import { SessionRequestError } from '../src/services/auth/me';
import {
  createAuthenticatedGetCurrentUser,
  createUnauthenticatedGetCurrentUser,
  mockAuthenticatedUser,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
}));

afterEach(() => {
  cleanup();
  replaceMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
});

function Probe() {
  const { status, user } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <span data-testid="user">{user ? user.email : 'none'}</span>
    </div>
  );
}

function LogoutProbe() {
  const { status, logout } = useAuth();
  return (
    <div>
      <span data-testid="status">{status}</span>
      <button
        type="button"
        onClick={() => {
          void logout().catch(() => {
            // Consumidor futuro pode exibir erro; estado permanece autenticado.
          });
        }}
      >
        Sair
      </button>
    </div>
  );
}

describe('AuthProvider', () => {
  it('começa em loading e hidrata authenticated', async () => {
    render(
      <AuthProvider
        hydrateOnMount
        getCurrentUserAction={createAuthenticatedGetCurrentUser(mockAuthenticatedUser)}
      >
        <Probe />
      </AuthProvider>,
    );

    expect(screen.getByTestId('status').textContent).toBe('loading');

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });
    expect(screen.getByTestId('user').textContent).toBe(mockAuthenticatedUser.email);
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  it('/me 401 → unauthenticated', async () => {
    render(
      <AuthProvider hydrateOnMount getCurrentUserAction={createUnauthenticatedGetCurrentUser()}>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
    });
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('/me 500 → error sem tratar como logout', async () => {
    const failing = vi.fn().mockRejectedValue(
      new SessionRequestError('Não foi possível verificar a sessão.', {
        httpStatus: 500,
      }),
    );

    render(
      <AuthProvider hydrateOnMount getCurrentUserAction={failing}>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('error');
    });
    expect(screen.getByTestId('user').textContent).toBe('none');
  });

  it('logout limpa estado somente após sucesso e redireciona /login', async () => {
    let resolveLogout: ((value: { status: 'ok' }) => void) | undefined;
    const logoutAction = vi.fn(
      () =>
        new Promise<{ status: 'ok' }>((resolve) => {
          resolveLogout = resolve;
        }),
    );

    render(
      <AuthProvider
        hydrateOnMount
        getCurrentUserAction={createAuthenticatedGetCurrentUser()}
        logoutAction={logoutAction}
      >
        <LogoutProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    screen.getByRole('button', { name: 'Sair' }).click();
    expect(logoutAction).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId('status').textContent).toBe('authenticated');

    resolveLogout?.({ status: 'ok' });
    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('unauthenticated');
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
  });

  it('falha de logout não limpa estado', async () => {
    const logoutAction = vi
      .fn()
      .mockRejectedValue(
        new SessionRequestError('Não foi possível encerrar a sessão. Tente novamente.'),
      );

    render(
      <AuthProvider
        hydrateOnMount
        getCurrentUserAction={createAuthenticatedGetCurrentUser()}
        logoutAction={logoutAction}
      >
        <LogoutProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId('status').textContent).toBe('authenticated');
    });

    screen.getByRole('button', { name: 'Sair' }).click();

    await waitFor(() => {
      expect(logoutAction).toHaveBeenCalled();
    });

    expect(screen.getByTestId('status').textContent).toBe('authenticated');
    expect(replaceMock).not.toHaveBeenCalled();
  });
});
