import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthenticatedLayout from '../app/(authenticated)/layout';
import AuthenticatedHomePage from '../app/(authenticated)/page';
import type { AuthenticatedUser, SupportState } from '../src/auth/types';
import type { getPlatformBranding } from '../src/services/admin/platform-branding';
import type { PlatformBranding } from '../src/services/admin/platform-branding.types';
import type { getCurrentBranding } from '../src/services/branding/current';
import { BrandingCurrentRequestError } from '../src/services/branding/current.types';
import type { CurrentBranding } from '../src/services/branding/current.types';
import type { logout } from '../src/services/auth/logout';
import { lightColorTokens, RuntimeThemeProvider, useRuntimeTheme, useTheme } from '../src/theme';
import { runtimeBrandingSessionKey } from '../src/theme/provider/runtime-theme-provider';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();

vi.mock('../src/services/dashboard/overview', () => ({
  getDashboardOverview: vi.fn().mockResolvedValue({
    today: '2026-08-19',
    receivables: { open: '0', overdue: '0', upcoming: '0' },
    payables: { open: '0', overdue: '0', upcoming: '0' },
    delinquency: { overdueUnpaid: '0', openUnpaid: '0', rate: null },
    integration: {
      status: 'DISCONNECTED',
      lastSuccessfulSyncAt: null,
      lastErrorCode: null,
    },
  }),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
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
  document.title = '';
  document.head.querySelectorAll('link[data-runtime-favicon="true"]').forEach((el) => el.remove());
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
  iconUrl: '/files/icon-acme',
  faviconUrl: '/files/fav-acme',
  light: { primary: '#112233' },
  dark: { primary: '#AABBCC' },
  updatedAt: '2026-08-15T12:00:00.000Z',
};

const platformCurrentBranding: CurrentBranding = {
  scope: 'platform',
  tenantId: null,
  name: 'Economização',
  logoUrl: null,
  iconUrl: null,
  faviconUrl: null,
  light: null,
  dark: null,
  updatedAt: null,
};

const adminPlatformBranding: PlatformBranding = {
  name: 'Plataforma Admin',
  logoUrl: '/files/logo-platform',
  iconUrl: '/files/icon-platform',
  faviconUrl: '/files/fav-platform',
  light: { primary: '#334455' },
  dark: { primary: '#CCDDEE' },
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T12:00:00.000Z',
};

function ThemeProbe() {
  const { theme, branding } = useTheme();
  return (
    <div>
      <span data-testid="brand-name">{theme.brandName ?? 'null'}</span>
      <span data-testid="logo-url">{theme.logoUrl ?? 'null'}</span>
      <span data-testid="icon-url">{theme.iconUrl ?? 'null'}</span>
      <span data-testid="primary">{theme.colors.primary}</span>
      <span data-testid="scheme">{theme.colorScheme}</span>
      <span data-testid="branding-name">{branding?.name ?? 'null'}</span>
    </div>
  );
}

function RefreshProbe() {
  const { refreshBranding } = useRuntimeTheme();
  return (
    <button type="button" onClick={() => void refreshBranding()}>
      Refresh branding
    </button>
  );
}

function renderRuntime(options: {
  readonly user: AuthenticatedUser;
  readonly brandingAction?: () => Promise<CurrentBranding>;
  readonly platformBrandingAction?: () => Promise<PlatformBranding>;
  readonly logoutAction?: typeof logout;
  readonly support?: SupportState;
}) {
  return renderWithAuth(
    <RuntimeThemeProvider
      getCurrentBrandingAction={
        (options.brandingAction ??
          vi.fn().mockResolvedValue(platformCurrentBranding)) as typeof getCurrentBranding
      }
      getPlatformBrandingAction={
        (options.platformBrandingAction ??
          vi.fn().mockResolvedValue(adminPlatformBranding)) as typeof getPlatformBranding
      }
    >
      <AuthenticatedLayout>
        <AuthenticatedHomePage />
        <ThemeProbe />
        <RefreshProbe />
      </AuthenticatedLayout>
    </RuntimeThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(options.user, options.support),
      logoutAction: options.logoutAction,
      hydrateOnMount: true,
    },
  );
}

describe('Runtime branding pós-login (1.3F / 1.5E)', () => {
  it('USER recebe branding tenant e ThemeProvider aplica overrides light', async () => {
    const brandingAction = vi.fn().mockResolvedValue(tenantBranding);
    renderRuntime({ user: tenantUser, brandingAction });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Acme Runtime');
    });
    expect(screen.getByTestId('logo-url').textContent).toBe('/files/logo-acme');
    expect(screen.getByTestId('icon-url').textContent).toBe('/files/icon-acme');
    expect(screen.getByTestId('primary').textContent).toBe('#112233');
    const sidebarBrand = screen.getByTestId('app-sidebar-brand');
    expect(sidebarBrand.querySelector('img')?.getAttribute('src')).toBe('/files/icon-acme');
    expect(sidebarBrand.querySelector('img[src="/files/logo-acme"]')).toBeNull();
    expect(within(sidebarBrand).getByText('Acme Runtime')).toBeTruthy();
    expect(document.title).toBe('Acme Runtime');
    expect(
      document.head.querySelector('link[data-runtime-favicon="true"]')?.getAttribute('href'),
    ).toContain('/files/fav-acme');
    expect(brandingAction).toHaveBeenCalled();
  });

  it('Dark usa overrides dark; System permanece funcional', async () => {
    const brandingAction = vi.fn().mockResolvedValue(tenantBranding);
    renderRuntime({ user: tenantUser, brandingAction });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Acme Runtime');
    });
    fireEvent.click(screen.getByRole('button', { name: 'Tema escuro' }));

    await waitFor(() => {
      expect(screen.getByTestId('scheme').textContent).toBe('dark');
      expect(screen.getByTestId('primary').textContent).toBe('#AABBCC');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Usar tema do sistema' }));
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: 'Usar tema do sistema' }).getAttribute('aria-pressed'),
      ).toBe('true');
    });
  });

  it('ausência de branding tenant mantém cores default e displayName', async () => {
    const emptyTenant: CurrentBranding = {
      scope: 'tenant',
      tenantId: 'tenant-a',
      name: 'Empresa Sem Branding',
      logoUrl: null,
      iconUrl: null,
      faviconUrl: null,
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
    expect(screen.getByTestId('icon-url').textContent).toBe('null');
    expect(within(screen.getByTestId('app-sidebar-brand')).getByText('Empresa Sem Branding')).toBeTruthy();
    expect(
      screen.getByTestId('app-sidebar-brand').querySelector('[data-brand-placeholder="true"]'),
    ).toBeTruthy();
  });

  it('ADMIN e SUPER_ADMIN usam getPlatformBranding com logo/cores', async () => {
    const platformAction = vi.fn().mockResolvedValue(adminPlatformBranding);
    const currentAction = vi.fn().mockResolvedValue(platformCurrentBranding);
    renderRuntime({
      user: adminUser,
      brandingAction: currentAction,
      platformBrandingAction: platformAction,
    });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Plataforma Admin');
      expect(screen.getByTestId('logo-url').textContent).toBe('/files/logo-platform');
      expect(screen.getByTestId('icon-url').textContent).toBe('/files/icon-platform');
      expect(screen.getByTestId('primary').textContent).toBe('#334455');
    });
    expect(platformAction).toHaveBeenCalled();
    expect(currentAction).not.toHaveBeenCalled();
    expect(document.title).toBe('Plataforma Admin');

    cleanup();
    replaceMock.mockReset();

    const superAction = vi.fn().mockResolvedValue(adminPlatformBranding);
    renderRuntime({
      user: superAdminUser,
      brandingAction: currentAction,
      platformBrandingAction: superAction,
    });
    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Plataforma Admin');
    });
    expect(superAction).toHaveBeenCalled();
  });

  it('SUPER_ADMIN em suporte usa branding corrente e chave isolada por tenant', async () => {
    const currentAction = vi.fn().mockResolvedValue(tenantBranding);
    const platformAction = vi.fn().mockResolvedValue(adminPlatformBranding);
    renderRuntime({
      user: superAdminUser,
      brandingAction: currentAction,
      platformBrandingAction: platformAction,
      support: {
        active: true,
        tenantId: 'tenant-a',
        tenantDisplayName: 'Acme',
        startedAt: '2026-08-17T12:00:00.000Z',
        supportSessionId: 'support-1',
      },
    });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Acme Runtime');
    });
    expect(currentAction).toHaveBeenCalled();
    expect(platformAction).not.toHaveBeenCalled();
    expect(runtimeBrandingSessionKey('super-1', null, 'tenant-a')).toBe(
      'super-1:platform:support-tenant-a',
    );
    expect(runtimeBrandingSessionKey('super-1', null, null)).not.toBe(
      runtimeBrandingSessionKey('super-1', null, 'tenant-a'),
    );
  });

  it('refreshBranding recarrega branding ADMIN', async () => {
    const platformAction = vi
      .fn()
      .mockResolvedValueOnce(adminPlatformBranding)
      .mockResolvedValueOnce({
        ...adminPlatformBranding,
        name: 'Plataforma Atualizada',
        logoUrl: '/files/logo-2',
        light: { primary: '#999999' },
        updatedAt: '2026-08-15T13:00:00.000Z',
      });

    renderRuntime({
      user: adminUser,
      platformBrandingAction: platformAction,
    });

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Plataforma Admin');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Refresh branding' }));

    await waitFor(() => {
      expect(screen.getByTestId('brand-name').textContent).toBe('Plataforma Atualizada');
      expect(screen.getByTestId('primary').textContent).toBe('#999999');
    });
    expect(platformAction).toHaveBeenCalledTimes(2);
    expect(document.title).toBe('Plataforma Atualizada');
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
      await screen.findByRole('heading', { level: 1, name: 'Dashboard financeiro' }),
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
      iconUrl: null,
      faviconUrl: null,
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
