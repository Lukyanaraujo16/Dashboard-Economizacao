import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import LoginPage from '../app/login/page';
import { RuntimePlatformBrandingProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  createUnauthenticatedGetCurrentUser,
  renderWithAuth,
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
});

const emptyPlatformBranding = {
  scope: 'platform' as const,
  tenantId: null,
  name: 'Economização',
  logoUrl: null,
  iconUrl: null,
  faviconUrl: null,
  light: null,
  dark: null,
  updatedAt: null,
};

function renderLoginPage(options?: Parameters<typeof renderWithAuth>[1]) {
  return renderWithAuth(
    <RuntimePlatformBrandingProvider
      getPublicPlatformBrandingAction={vi.fn().mockResolvedValue(emptyPlatformBranding)}
    >
      <LoginPage />
    </RuntimePlatformBrandingProvider>,
    options,
  );
}

describe('rota /login', () => {
  it('não autenticado → Login Experience', async () => {
    renderLoginPage({
      getCurrentUserAction: createUnauthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    expect(await screen.findByRole('heading', { name: /bem-vindo de volta/i })).toBeTruthy();
    expect(screen.getByLabelText(/e-mail/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Entrar' })).toBeTruthy();
    expect(screen.queryByText('DEV')).toBeNull();
    expect(replaceMock).not.toHaveBeenCalled();
  });

  it('autenticado USER → redirect /', async () => {
    renderLoginPage({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/');
    });
    expect(screen.queryByRole('heading', { name: /bem-vindo de volta/i })).toBeNull();
  });

  it('autenticado ADMIN → redirect /empresas', async () => {
    renderLoginPage({
      getCurrentUserAction: createAuthenticatedGetCurrentUser({
        id: 'admin-1',
        name: 'Admin',
        email: 'admin@plataforma.com',
        role: 'ADMIN',
        tenantId: null,
      }),
      hydrateOnMount: true,
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/empresas');
    });
    expect(replaceMock).not.toHaveBeenCalledWith('/');
  });

  it('autenticado SUPER_ADMIN → redirect /empresas', async () => {
    renderLoginPage({
      getCurrentUserAction: createAuthenticatedGetCurrentUser({
        id: 'super-1',
        name: 'Super',
        email: 'super@plataforma.com',
        role: 'SUPER_ADMIN',
        tenantId: null,
      }),
      hydrateOnMount: true,
    });

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/empresas');
    });
    expect(replaceMock).not.toHaveBeenCalledWith('/');
  });

  it('durante loading não flasha o formulário', () => {
    const pending = vi.fn(
      () =>
        new Promise<never>(() => {
          // pendente propositalmente
        }),
    );

    renderLoginPage({
      getCurrentUserAction: pending as never,
      hydrateOnMount: true,
    });

    expect(screen.queryByRole('heading', { name: /bem-vindo de volta/i })).toBeNull();
  });
});
