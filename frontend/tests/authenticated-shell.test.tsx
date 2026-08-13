import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthenticatedLayout from '../app/(authenticated)/layout';
import AuthenticatedHomePage from '../app/(authenticated)/page';
import { SessionRequestError } from '../src/services/auth/me';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  createUnauthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
    'aria-current'?: 'page' | 'true' | 'false' | boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

afterEach(() => {
  cleanup();
  replaceMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

beforeEach(() => {
  replaceMock.mockReset();
});

function renderShell(options?: Parameters<typeof renderWithAuth>[1]) {
  return renderWithAuth(
    <ThemeProvider>
      <AuthenticatedLayout>
        <AuthenticatedHomePage />
      </AuthenticatedLayout>
    </ThemeProvider>,
    options,
  );
}

describe('RequireSession + AppShell (1.1F-E.4)', () => {
  it('loading não renderiza conteúdo privado', () => {
    const pending = vi.fn(
      () =>
        new Promise<never>(() => {
          // pendente
        }),
    );

    renderShell({
      getCurrentUserAction: pending as never,
      hydrateOnMount: true,
    });

    expect(screen.getByLabelText(/verificando sessão|redirecionando/i)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /olá/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sair' })).toBeNull();
  });

  it('authenticated renderiza shell e home com nome do usuário', async () => {
    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(mockAuthenticatedUser),
      hydrateOnMount: true,
    });

    expect(await screen.findByRole('heading', { name: /olá, usuário teste/i })).toBeTruthy();
    expect(screen.getByRole('navigation', { name: /navegação principal|seções/i })).toBeTruthy();
    expect(screen.getByRole('main')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
    expect(screen.getAllByText(mockAuthenticatedUser.email).length).toBeGreaterThan(0);
    expect(screen.queryByText(mockAuthenticatedUser.tenantId!)).toBeNull();
    expect(screen.queryByText(/sessionId/i)).toBeNull();
    expect(screen.queryByText(/receita|despesa|saldo|kpi|gráfico/i)).toBeNull();
  });

  it('alterna entre os temas claro e escuro pelo Theme Engine', async () => {
    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    const toggle = await screen.findByRole('button', { name: 'Ativar tema escuro' });
    expect(document.documentElement.dataset.theme).toBe('light');

    fireEvent.click(toggle);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    expect(screen.getByRole('button', { name: 'Ativar tema claro' })).toBeTruthy();
  });

  it('unauthenticated redireciona /login', async () => {
    renderShell({
      getCurrentUserAction: createUnauthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
    expect(screen.queryByRole('heading', { name: /olá/i })).toBeNull();
  });

  it('error mostra retry e chama refreshSession', async () => {
    const getCurrentUserAction = vi
      .fn()
      .mockRejectedValueOnce(
        new SessionRequestError('Não foi possível verificar a sessão.', { httpStatus: 500 }),
      )
      .mockResolvedValueOnce({ kind: 'authenticated', user: mockAuthenticatedUser });

    renderShell({
      getCurrentUserAction,
      hydrateOnMount: true,
    });

    expect(
      await screen.findByRole('heading', { name: /não foi possível verificar sua sessão/i }),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));

    await waitFor(() => {
      expect(getCurrentUserAction).toHaveBeenCalledTimes(2);
    });
    expect(await screen.findByRole('heading', { name: /olá, usuário teste/i })).toBeTruthy();
  });

  it('logout usa AuthProvider e redireciona /login', async () => {
    const logoutAction = vi.fn().mockResolvedValue({ status: 'ok' });

    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      logoutAction,
      hydrateOnMount: true,
    });

    expect(await screen.findByRole('button', { name: 'Sair' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => {
      expect(logoutAction).toHaveBeenCalledTimes(1);
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
  });

  it('falha de logout preserva sessão e bloqueia cliques concorrentes', async () => {
    let resolveLogout: ((value: { status: 'ok' }) => void) | undefined;
    let rejectLogout: ((reason?: unknown) => void) | undefined;
    const logoutAction = vi.fn(
      () =>
        new Promise<{ status: 'ok' }>((resolve, reject) => {
          resolveLogout = resolve;
          rejectLogout = reject;
        }),
    );

    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      logoutAction,
      hydrateOnMount: true,
    });

    const button = await screen.findByRole('button', { name: /sair|carregando/i });
    fireEvent.click(button);
    fireEvent.click(button);

    await waitFor(() => {
      expect(logoutAction).toHaveBeenCalledTimes(1);
    });
    expect(button).toHaveProperty('disabled', true);

    rejectLogout?.(new SessionRequestError('Não foi possível encerrar a sessão.'));

    expect(await screen.findByText(/não foi possível encerrar a sessão/i)).toBeTruthy();
    expect(screen.getByRole('heading', { name: /olá, usuário teste/i })).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalledWith('/login');

    // evita unhandled rejection residual
    resolveLogout?.({ status: 'ok' });
  });

  it('estrutura mobile mantém landmarks utilizáveis', async () => {
    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    expect(await screen.findByRole('main')).toBeTruthy();
    expect(screen.getByRole('navigation', { name: /seções/i })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Início' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sair' })).toBeTruthy();
  });

  it('não salva token em storage', async () => {
    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    await screen.findByRole('heading', { name: /olá/i });
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });
});
