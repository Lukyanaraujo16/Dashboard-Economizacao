import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import AuthenticatedLayout from '../app/(authenticated)/layout';
import AuthenticatedHomePage from '../app/(authenticated)/page';
import { ThemeControl } from '../src/components/layout';
import { LoginExperience } from '../src/login/login-experience';
import type { CurrentBranding } from '../src/services/branding/current.types';
import { RuntimeThemeProvider, THEME_PREFERENCE_STORAGE_KEY, ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();

const platformBranding: CurrentBranding = {
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

function createPlatformBrandingAction() {
  return vi.fn().mockResolvedValue(platformBranding);
}

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
    children: ReactNode;
    className?: string;
    'aria-current'?: 'page' | 'true' | 'false' | boolean;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

type MediaStub = {
  matches: boolean;
  setMatches: (next: boolean) => void;
};

function stubPrefersColorScheme(matches: boolean): MediaStub {
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    matches,
    media: '(prefers-color-scheme: dark)',
    addEventListener(_type: string, listener: EventListener) {
      listeners.add(listener as (event: MediaQueryListEvent) => void);
    },
    removeEventListener(_type: string, listener: EventListener) {
      listeners.delete(listener as (event: MediaQueryListEvent) => void);
    },
    dispatchEvent() {
      return true;
    },
  };

  vi.stubGlobal('matchMedia', (query: string) => {
    if (query.includes('prefers-color-scheme: dark')) {
      return media;
    }
    return {
      matches: false,
      addEventListener() {
        return undefined;
      },
      removeEventListener() {
        return undefined;
      },
      dispatchEvent() {
        return true;
      },
    };
  });

  return {
    get matches() {
      return media.matches;
    },
    setMatches(next: boolean) {
      media.matches = next;
      const event = { matches: next } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  replaceMock.mockReset();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

beforeEach(() => {
  replaceMock.mockReset();
  localStorage.clear();
});

function renderControl() {
  return renderWithAuth(
    <ThemeProvider>
      <ThemeControl />
    </ThemeProvider>,
  );
}

function renderShell(options?: Parameters<typeof renderWithAuth>[1]) {
  return renderWithAuth(
    <RuntimeThemeProvider getCurrentBrandingAction={createPlatformBrandingAction()}>
      <AuthenticatedLayout>
        <AuthenticatedHomePage />
      </AuthenticatedLayout>
    </RuntimeThemeProvider>,
    options,
  );
}

describe('ThemeControl + persistência', () => {
  it('A. default sem preferência seleciona system e não grava storage', async () => {
    renderControl();

    const system = await screen.findByRole('button', { name: 'Usar tema do sistema' });
    expect(system.getAttribute('aria-pressed')).toBe('true');
    expect(screen.getByRole('button', { name: 'Tema claro' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(screen.getByRole('button', { name: 'Tema escuro' }).getAttribute('aria-pressed')).toBe(
      'false',
    );
    expect(localStorage.length).toBe(0);
  });

  it('B. selecionar dark aplica tema e persiste', async () => {
    renderControl();

    fireEvent.click(await screen.findByRole('button', { name: 'Tema escuro' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    expect(screen.getByRole('button', { name: 'Tema escuro' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
  });

  it('C. selecionar light aplica tema claro', async () => {
    renderControl();

    fireEvent.click(await screen.findByRole('button', { name: 'Tema claro' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('light');
  });

  it('D. selecionar system persiste system, não o esquema resolvido', async () => {
    stubPrefersColorScheme(true);
    renderControl();

    fireEvent.click(await screen.findByRole('button', { name: 'Usar tema do sistema' }));

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('system');
    expect(
      screen.getByRole('button', { name: 'Usar tema do sistema' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('E. re-init restaura a escolha persistida', async () => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'dark');
    renderControl();

    expect(
      (await screen.findByRole('button', { name: 'Tema escuro' })).getAttribute('aria-pressed'),
    ).toBe('true');
    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
  });

  it('G. valor inválido persistido faz fallback para system', async () => {
    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'rainbow');
    renderControl();

    expect(
      (await screen.findByRole('button', { name: 'Usar tema do sistema' })).getAttribute(
        'aria-pressed',
      ),
    ).toBe('true');
  });

  it('H. system + OS dark resolve dark', async () => {
    stubPrefersColorScheme(true);
    renderControl();

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    expect(
      screen.getByRole('button', { name: 'Usar tema do sistema' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(localStorage.length).toBe(0);
  });

  it('I. system reage à mudança do OS sem alterar a preferência', async () => {
    const media = stubPrefersColorScheme(false);
    renderControl();

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('light');
    });

    media.setMatches(true);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
    });
    expect(
      screen.getByRole('button', { name: 'Usar tema do sistema' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(localStorage.length).toBe(0);
  });

  it('M. a11y: aria-label, aria-pressed, title, teclado e foco', async () => {
    renderControl();

    const group = await screen.findByRole('group', { name: 'Tema da interface' });
    const light = screen.getByRole('button', { name: 'Tema claro' });
    const dark = screen.getByRole('button', { name: 'Tema escuro' });
    const system = screen.getByRole('button', { name: 'Usar tema do sistema' });

    expect(light.getAttribute('title')).toBe('Tema claro');
    expect(dark.getAttribute('title')).toBe('Tema escuro');
    expect(system.getAttribute('title')).toBe('Usar tema do sistema');
    expect(light.textContent?.trim()).toBe('');
    expect(screen.queryByRole('button', { name: 'Claro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Escuro' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sistema' })).toBeNull();

    system.focus();
    fireEvent.keyDown(group, { key: 'ArrowRight' });

    await waitFor(() => {
      expect(light.getAttribute('aria-pressed')).toBe('true');
    });
    expect(document.activeElement).toBe(light);
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('light');

    fireEvent.keyDown(group, { key: 'ArrowLeft' });
    await waitFor(() => {
      expect(system.getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('N. mobile estrutural: compacto, sem texto visível e sem disputa de largura', async () => {
    renderControl();

    const group = await screen.findByRole('group', { name: 'Tema da interface' });
    expect(group.className).toMatch(/themeControl/);
    const buttons = within(group).getAllByRole('button');
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button.className).toMatch(/themeOption/);
      expect(button.textContent?.trim()).toBe('');
      expect(button.getAttribute('aria-label')).toBeTruthy();
    }
  });
});

describe('Tema no shell autenticado (logout, papéis, support)', () => {
  it('F. logout não remove a preferência; login de produto continua dark', async () => {
    const logoutAction = vi.fn().mockResolvedValue({ status: 'ok' });

    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      logoutAction,
      hydrateOnMount: true,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Tema escuro' }));
    await waitFor(() => {
      expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
    });

    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    await waitFor(() => {
      expect(logoutAction).toHaveBeenCalledTimes(1);
      expect(replaceMock).toHaveBeenCalledWith('/login');
    });
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');

    cleanup();
    renderWithAuth(<LoginExperience />);

    await waitFor(() => {
      expect(document.documentElement.dataset.theme).toBe('dark');
      expect(document.querySelector('[data-scheme]')?.getAttribute('data-scheme')).toBe('dark');
    });
    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
  });

  it('J. ADMIN preserva a preferência após re-init', async () => {
    const admin = {
      ...mockAuthenticatedUser,
      role: 'ADMIN' as const,
      tenantId: null,
    };

    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(admin),
      hydrateOnMount: true,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Tema claro' }));
    await waitFor(() => {
      expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('light');
    });

    cleanup();
    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(admin),
      hydrateOnMount: true,
    });

    expect(
      (await screen.findByRole('button', { name: 'Tema claro' })).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('K. USER preserva a preferência após re-init', async () => {
    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    fireEvent.click(await screen.findByRole('button', { name: 'Tema escuro' }));
    await waitFor(() => {
      expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
    });

    cleanup();
    renderShell({
      getCurrentUserAction: createAuthenticatedGetCurrentUser(),
      hydrateOnMount: true,
    });

    expect(
      (await screen.findByRole('button', { name: 'Tema escuro' })).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('L. Support Mode entrar/sair não altera a preferência', async () => {
    const admin = {
      ...mockAuthenticatedUser,
      role: 'ADMIN' as const,
      tenantId: null,
    };
    const activeSupport = {
      active: true as const,
      tenantId: 'tenant-support',
      tenantDisplayName: 'Empresa Assistida',
      startedAt: '2026-08-17T12:00:00.000Z',
      supportSessionId: 'support-1',
    };
    const getCurrentUserAction = vi
      .fn()
      .mockResolvedValueOnce({
        kind: 'authenticated',
        user: admin,
        support: activeSupport,
      })
      .mockResolvedValue({
        kind: 'authenticated',
        user: admin,
        support: { active: false },
      });
    const fetchMock = vi.fn().mockImplementation(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            user: admin,
            support: { active: false },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      ),
    );
    vi.stubGlobal('fetch', fetchMock);

    localStorage.setItem(THEME_PREFERENCE_STORAGE_KEY, 'dark');

    renderShell({ getCurrentUserAction, hydrateOnMount: true });

    expect(
      (await screen.findByRole('button', { name: 'Tema escuro' })).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(await screen.findByLabelText('Modo suporte')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Sair do modo suporte' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/auth/support/exit',
        expect.objectContaining({ method: 'POST', credentials: 'include' }),
      );
    });

    expect(localStorage.getItem(THEME_PREFERENCE_STORAGE_KEY)).toBe('dark');
    expect(screen.getByRole('button', { name: 'Tema escuro' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
  });
});
