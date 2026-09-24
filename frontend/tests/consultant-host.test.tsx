import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ConsultantHost, shouldShowConsultantHost } from '../src/components/consultant';
import { useAuth } from '../src/auth';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();
let pathname = '/';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
  usePathname: () => pathname,
  useSearchParams: () => new URLSearchParams(),
}));

function AuthProbe() {
  const { status, user } = useAuth();
  return (
    <div data-testid="auth-status">
      {status}:{user?.role ?? 'none'}
    </div>
  );
}

function LogoutControl() {
  const { logout } = useAuth();
  return (
    <button type="button" onClick={() => void logout()}>
      Encerrar sessão
    </button>
  );
}

function renderHost(
  options?: Parameters<typeof renderWithAuth>[1],
  extra?: { readonly withLogout?: boolean },
) {
  return renderWithAuth(
    <>
      <AuthProbe />
      {extra?.withLogout ? <LogoutControl /> : null}
      <ConsultantHost />
    </>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(mockAuthenticatedUser),
      hydrateOnMount: true,
      ...options,
    },
  );
}

afterEach(() => {
  cleanup();
  pathname = '/';
  replaceMock.mockReset();
});

beforeEach(() => {
  pathname = '/';
});

describe('shouldShowConsultantHost', () => {
  it('mostra apenas em superfícies tenant para USER', () => {
    expect(shouldShowConsultantHost('/', mockAuthenticatedUser, { active: false })).toBe(true);
    expect(shouldShowConsultantHost('/relatorios', mockAuthenticatedUser, { active: false })).toBe(
      true,
    );
    expect(
      shouldShowConsultantHost('/relatorios/despesas', mockAuthenticatedUser, { active: false }),
    ).toBe(true);
    expect(shouldShowConsultantHost('/empresas', mockAuthenticatedUser, { active: false })).toBe(
      false,
    );
    expect(shouldShowConsultantHost('/login', mockAuthenticatedUser, { active: false })).toBe(false);
    expect(
      shouldShowConsultantHost('/configuracoes', mockAuthenticatedUser, { active: false }),
    ).toBe(false);
  });

  it('esconde quando o usuário não pode usar superfícies tenant', () => {
    const admin = { ...mockAuthenticatedUser, role: 'ADMIN' as const, tenantId: null };
    expect(shouldShowConsultantHost('/', admin, { active: false })).toBe(false);
  });
});

describe('ConsultantHost', () => {
  it('mostra o FAB em `/` com USER tenant', async () => {
    renderHost();

    expect((await screen.findByTestId('auth-status')).textContent).toBe('authenticated:USER');
    expect(screen.getByRole('button', { name: 'Abrir o Consultor' })).toBeTruthy();
  });

  it('não mostra o FAB em `/empresas`', async () => {
    pathname = '/empresas';
    renderHost();

    expect((await screen.findByTestId('auth-status')).textContent).toBe('authenticated:USER');
    expect(screen.queryByRole('button', { name: 'Abrir o Consultor' })).toBeNull();
  });

  it('não mostra o FAB quando o usuário não pode usar superfícies tenant', async () => {
    renderHost({
      getCurrentUserAction: createAuthenticatedGetCurrentUser({
        ...mockAuthenticatedUser,
        role: 'ADMIN',
        tenantId: null,
      }),
    });

    expect((await screen.findByTestId('auth-status')).textContent).toBe('authenticated:ADMIN');
    expect(screen.queryByRole('button', { name: 'Abrir o Consultor' })).toBeNull();
  });

  it('some com o FAB após logout', async () => {
    renderHost(undefined, { withLogout: true });

    expect(await screen.findByRole('button', { name: 'Abrir o Consultor' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Encerrar sessão' }));

    await waitFor(() => {
      expect(screen.queryByRole('button', { name: 'Abrir o Consultor' })).toBeNull();
    });
  });
});
