import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthenticatedLayout from '../app/(authenticated)/layout';
import AuthenticatedHomePage from '../app/(authenticated)/page';
import type { AuthenticatedUser } from '../src/auth/types';
import type { getCurrentBranding } from '../src/services/branding/current';
import { BrandingCurrentRequestError } from '../src/services/branding/current.types';
import type { CurrentBranding } from '../src/services/branding/current.types';
import type { logout } from '../src/services/auth/logout';
import { lightColorTokens, RuntimeThemeProvider, useTheme } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
  usePathname: () => '/',
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

const tenantUser: AuthenticatedUser = {
  ...mockAuthenticatedUser,
  id: 'user-tenant-a',
  role: 'USER',
  tenantId: 'tenant-a',
};

const adminUser: AuthenticatedUser = {
  id: 'admin-1',
  name: 'Admin Plataforma',
  email: 'admin@plataforma.com',
  role: 'ADMIN',
  tenantId: null,
};

const superAdminUser: AuthenticatedUser = {
  id: 'super-1',
  name: 'Super Admin',
  email: 'super@plataforma.com',
  role: 'SUPER_ADMIN',
  tenantId: null,
};

const tenantBranding: CurrentBranding = {
  scope: 'tenant',
  tenantId: 'tenant-a',
  name: 'Acme Runtime',
  logoUrl: '/files/logo-acme',
  light: { primary: '#112233' },
  dark: { primary: '#AABBCC' },
  updatedAt: '2026-08-15T12:00:00.000Z',
};

const platformBranding: CurrentBranding = {
  scope: 'platform',
  tenantId: null,
  name: 'Economização',
  logoUrl: null,
  light: null,
  dark: null,
  updatedAt: null,
};

function ThemeProbe() {
  const { theme, branding } = useTheme();
  return (
    <div>
      <span data-testid="brand-name">{theme.brandName ?? 'null'}</span>
      <span data-testid="logo-url">{theme.logoUrl ?? 'null'}</span>
      <span data-testid="primary">{theme.colors.primary}</span>
      <span data-testid="scheme">{theme.colorScheme}</span>
      <span data-testid="branding-name">{branding?.name ?? 'null'}</span>
    </div>
  );
}

function renderRuntime(options: {
  readonly user: AuthenticatedUser;
  readonly brandingAction: () => Promise<CurrentBranding>;
  readonly logoutAction?: typeof logout;
}) {
  return renderWithAuth(
    <RuntimeThemeProvider
      getCurrentBrandingAction={options.brandingAction as typeof getCurrentBranding}
    >
      <AuthenticatedLayout>
        <AuthenticatedHomePage />
        <ThemeProbe />
      </AuthenticatedLayout>
    </RuntimeThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(options.user),
      logoutAction: options.logoutAction,
      hydrateOnMount: true,
    },
  );
}

describe('Runtime branding pós-login (1.3F)', () => {
  it('USER recebe branding tenant e ThemeProvider aplica overrides light', async () => {
    const brandingAction = vi.fn().mockResolvedValue(tenantBranding);
    renderRuntime({ user: tenantUser, brandingAction });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Acme Runtime');
    });
    expect(screen.getByTestId('logo-url').textContent).toBe('/files/logo-acme');
    expect(screen.getByTestId('primary').textContent).toBe('#112233');
    expect(screen.getByRole('img', { name: 'Acme Runtime' }).getAttribute('src')).toBe(
      '/files/logo-acme',
    );
    expect(brandingAction).toHaveBeenCalled();
  });

  it('Dark usa overrides dark; System permanece funcional', async () => {
    const brandingAction = vi.fn().mockResolvedValue(tenantBranding);
    renderRuntime({ user: tenantUser, brandingAction });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Acme Runtime');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Escuro' }));

    await waitFor(() => {
      expect(screen.getByTestId('scheme').textContent).toBe('dark');
      expect(screen.getByTestId('primary').textContent).toBe('#AABBCC');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sistema' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Sistema' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });
  });

  it('ausência de branding tenant mantém cores default e displayName', async () => {
    const emptyTenant: CurrentBranding = {
      scope: 'tenant',
      tenantId: 'tenant-a',
      name: 'Empresa Sem Branding',
      logoUrl: null,
      light: null,
      dark: null,
      updatedAt: null,
    };
    const brandingAction = vi.fn().mockResolvedValue(emptyTenant);
    renderRuntime({ user: tenantUser, brandingAction });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Empresa Sem Branding');
    });
    expect(screen.getByTestId('primary').textContent).toBe(lightColorTokens.primary);
    expect(screen.getByTestId('logo-url').textContent).toBe('null');
    expect(screen.getByLabelText('Empresa Sem Branding')).toBeTruthy();
  });

  it('ADMIN e SUPER_ADMIN usam branding de plataforma', async () => {
    const brandingAction = vi.fn().mockResolvedValue(platformBranding);
    renderRuntime({ user: adminUser, brandingAction });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Economização');
      expect(screen.getByTestId('primary').textContent).toBe(lightColorTokens.primary);
    });

    cleanup();
    replaceMock.mockReset();

    const superAction = vi.fn().mockResolvedValue(platformBranding);
    renderRuntime({ user: superAdminUser, brandingAction: superAction });
    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Economização');
    });
  });

  it('erro de branding usa fallback sem logout', async () => {
    const logoutAction = vi.fn().mockResolvedValue({ status: 'ok' }) as typeof logout;
    const brandingAction = vi
      .fn()
      .mockRejectedValue(
        new BrandingCurrentRequestError('unavailable', 'falha', { httpStatus: 500 }),
      );

    renderRuntime({ user: tenantUser, brandingAction, logoutAction });

    expect(
      await screen.findByRole('heading', {
        level: 1,
        name: /(bom dia|boa tarde|boa noite)/i,
      }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('null');
    });
    expect(screen.getByText('Economização')).toBeTruthy();
    expect(logoutAction).not.toHaveBeenCalled();
    expect(replaceMock).not.toHaveBeenCalledWith('/login');
  });

  it('logout limpa branding tenant', async () => {
    const logoutAction = vi.fn().mockResolvedValue({ status: 'ok' }) as typeof logout;
    const brandingAction = vi.fn().mockResolvedValue(tenantBranding);

    renderRuntime({ user: tenantUser, brandingAction, logoutAction });
    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Acme Runtime');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));

    await waitFor(() => {
      expect(logoutAction).toHaveBeenCalledTimes(1);
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
  });

  it('troca de usuário não reaproveita branding anterior', async () => {
    const tenantBUser: AuthenticatedUser = {
      id: 'user-tenant-b',
      name: 'Usuário B',
      email: 'b@empresa.com',
      role: 'USER',
      tenantId: 'tenant-b',
    };
    const brandingB: CurrentBranding = {
      scope: 'tenant',
      tenantId: 'tenant-b',
      name: 'Beta Co',
      logoUrl: '/files/logo-beta',
      light: { primary: '#00FF00' },
      dark: null,
      updatedAt: null,
    };

    renderRuntime({ user: tenantUser, brandingAction: vi.fn().mockResolvedValue(tenantBranding) });
    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Acme Runtime');
      expect(screen.getByTestId('primary').textContent).toBe('#112233');
    });

    cleanup();
    renderRuntime({
      user: tenantBUser,
      brandingAction: vi.fn().mockResolvedValue(brandingB),
    });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Beta Co');
      expect(screen.getByTestId('primary').textContent).toBe('#00FF00');
    });
    expect(screen.queryByText('Acme Runtime')).toBeNull();
  });

  it('não persiste branding em storage', async () => {
    const brandingAction = vi.fn().mockResolvedValue(tenantBranding);
    renderRuntime({ user: tenantUser, brandingAction });
    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Acme Runtime');
    });

    expect(JSON.stringify(localStorage)).not.toMatch(/Acme|branding|logo-acme|112233/i);
    expect(JSON.stringify(sessionStorage)).not.toMatch(/Acme|branding|logo-acme|112233/i);
  });
});
