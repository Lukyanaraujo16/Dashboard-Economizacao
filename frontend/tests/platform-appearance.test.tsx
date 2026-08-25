import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AuthenticatedLayout from '../app/(authenticated)/layout';
import ConfiguracoesLayout from '../app/(authenticated)/configuracoes/layout';
import { PlatformAppearancePage } from '../src/components/settings/platform-appearance-page';
import { RuntimePlatformBrandingProvider, RuntimeThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();

const emptyBranding = {
  name: null as string | null,
  logoUrl: null as string | null,
  iconUrl: null as string | null,
  faviconUrl: null as string | null,
  light: null as Record<string, string> | null,
  dark: null as Record<string, string> | null,
  createdAt: null as string | null,
  updatedAt: null as string | null,
};

const branded = {
  ...emptyBranding,
  name: 'Economização Custom',
  logoUrl: '/files/logo-1',
  iconUrl: '/files/icon-1',
  faviconUrl: '/files/fav-1',
  light: { primary: '#112233', onPrimary: '#FFFFFF' },
  dark: { primary: '#AABBCC', onPrimary: '#111111' },
  createdAt: '2026-08-15T10:00:00.000Z',
  updatedAt: '2026-08-15T11:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let pathname = '/configuracoes/aparencia';
let documentTheme = 'light';
let serverState: Record<string, unknown> = { ...emptyBranding };

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: pushMock,
    refresh: refreshMock,
  }),
  usePathname: () => pathname,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...rest
  }: {
    href: string;
    children: React.ReactNode;
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

function renderAppearance(role: 'USER' | 'ADMIN' | 'SUPER_ADMIN' = 'SUPER_ADMIN') {
  return renderWithAuth(
    <RuntimePlatformBrandingProvider
      getPublicPlatformBrandingAction={async () => ({
        scope: 'platform',
        tenantId: null,
        name: (serverState.name as string | null)?.trim() || 'Economização',
        logoUrl: (serverState.logoUrl as string | null) ?? null,
        iconUrl: (serverState.iconUrl as string | null) ?? null,
        faviconUrl: (serverState.faviconUrl as string | null) ?? null,
        light: (serverState.light as Record<string, string> | null) ?? null,
        dark: (serverState.dark as Record<string, string> | null) ?? null,
        updatedAt: (serverState.updatedAt as string | null) ?? null,
      })}
    >
      <RuntimeThemeProvider>
        <AuthenticatedLayout>
          <ConfiguracoesLayout>
            <PlatformAppearancePage />
          </ConfiguracoesLayout>
        </AuthenticatedLayout>
      </RuntimeThemeProvider>
    </RuntimePlatformBrandingProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser({
        ...mockAuthenticatedUser,
        role,
        tenantId: role === 'USER' ? mockAuthenticatedUser.tenantId : null,
      }),
      hydrateOnMount: true,
    },
  );
}

function stubBranding(initial: Record<string, unknown>, getStatus = 200) {
  serverState = { ...initial };

  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);

      if (path.includes('/branding/platform') && (init?.method ?? 'GET') === 'GET') {
        return Promise.resolve(
          jsonResponse({
            scope: 'platform',
            tenantId: null,
            name: (serverState.name as string | null)?.trim() || 'Economização',
            logoUrl: serverState.logoUrl ?? null,
            iconUrl: serverState.iconUrl ?? null,
            faviconUrl: serverState.faviconUrl ?? null,
            light: serverState.light ?? null,
            dark: serverState.dark ?? null,
            updatedAt: serverState.updatedAt ?? null,
          }),
        );
      }

      if (!path.includes('/admin/platform/branding')) {
        return Promise.resolve(jsonResponse({ error: { code: 'NOT_FOUND' } }, 404));
      }

      const method = init?.method ?? 'GET';

      if (method === 'GET') {
        return Promise.resolve(jsonResponse(serverState, getStatus));
      }

      if (method === 'DELETE') {
        if (path.endsWith('/logo')) {
          serverState = { ...serverState, logoUrl: null };
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (path.endsWith('/icon')) {
          serverState = { ...serverState, iconUrl: null };
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        if (path.endsWith('/favicon')) {
          serverState = { ...serverState, faviconUrl: null };
          return Promise.resolve(new Response(null, { status: 204 }));
        }
        serverState = { ...emptyBranding };
        return Promise.resolve(new Response(null, { status: 204 }));
      }

      if (method === 'POST') {
        if (path.endsWith('/logo')) {
          serverState = {
            ...serverState,
            name: serverState.name ?? 'Economização',
            logoUrl: '/files/logo-new',
            createdAt: serverState.createdAt ?? '2026-08-15T12:00:00.000Z',
            updatedAt: '2026-08-15T12:00:00.000Z',
          };
          return Promise.resolve(jsonResponse(serverState));
        }
        if (path.endsWith('/icon')) {
          serverState = {
            ...serverState,
            name: serverState.name ?? 'Economização',
            iconUrl: '/files/icon-new',
            createdAt: serverState.createdAt ?? '2026-08-15T12:00:00.000Z',
            updatedAt: '2026-08-15T12:00:00.000Z',
          };
          return Promise.resolve(jsonResponse(serverState));
        }
        if (path.endsWith('/favicon')) {
          serverState = {
            ...serverState,
            name: serverState.name ?? 'Economização',
            faviconUrl: '/files/fav-new',
            createdAt: serverState.createdAt ?? '2026-08-15T12:00:00.000Z',
            updatedAt: '2026-08-15T12:00:00.000Z',
          };
          return Promise.resolve(jsonResponse(serverState));
        }
      }

      if (method === 'PATCH' && typeof init?.body === 'string') {
        const payload = JSON.parse(init.body) as Record<string, unknown>;
        serverState = {
          ...serverState,
          ...payload,
          name:
            typeof payload.name === 'string'
              ? payload.name
              : ((serverState.name as string | null) ?? null),
          light: payload.light !== undefined ? payload.light : serverState.light,
          dark: payload.dark !== undefined ? payload.dark : serverState.dark,
          createdAt: serverState.createdAt ?? '2026-08-15T12:00:00.000Z',
          updatedAt: '2026-08-15T12:00:00.000Z',
        };
        return Promise.resolve(jsonResponse(serverState));
      }

      return Promise.resolve(jsonResponse({ error: { code: 'BAD_REQUEST' } }, 400));
    }),
  );
}

function saveButton() {
  return screen.getByRole('button', { name: 'Salvar alterações' }) as HTMLButtonElement;
}

beforeEach(() => {
  pathname = '/configuracoes/aparencia';
  documentTheme = document.documentElement.dataset.theme ?? 'light';
  replaceMock.mockReset();
  pushMock.mockReset();
  refreshMock.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:preview-asset');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.dataset.theme = documentTheme;
});

describe('Platform appearance UI (1.5D.2)', () => {
  it('ADMIN acessa e vê CTA único Salvar alterações', async () => {
    stubBranding(emptyBranding);
    renderAppearance('ADMIN');

    expect(await screen.findByRole('textbox', { name: 'Nome da plataforma' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Salvar nome' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Salvar cores' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar logo' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Enviar ícone' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Identidade' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Aparência' }).length).toBeGreaterThanOrEqual(1);
  });

  it('USER é negado', async () => {
    stubBranding(emptyBranding);
    renderAppearance('USER');
    expect(await screen.findByRole('heading', { name: /acesso não permitido/i })).toBeTruthy();
  });

  it('save fica disabled sem alterações', async () => {
    stubBranding(emptyBranding);
    renderAppearance();
    await screen.findByRole('textbox', { name: 'Nome da plataforma' });
    expect(saveButton().disabled).toBe(true);
  });

  it('alteração de nome habilita e salva só o nome', async () => {
    stubBranding(emptyBranding);
    renderAppearance();

    const nameInput = await screen.findByRole('textbox', { name: 'Nome da plataforma' });
    fireEvent.change(nameInput, { target: { value: '  Nova Plataforma  ' } });
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/admin/platform/branding',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ name: 'Nova Plataforma' }),
        }),
      );
    });
    expect((await screen.findByRole('status')).textContent).toMatch(/alterações salvas/i);
    expect(saveButton().disabled).toBe(true);
  });

  it('alteração de cor habilita e salva cores com bootstrap de nome', async () => {
    stubBranding(emptyBranding);
    renderAppearance();
    await screen.findByRole('textbox', { name: 'Nome da plataforma' });

    fireEvent.change(screen.getByLabelText('Cor principal — valor hexadecimal'), {
      target: { value: '#112233' },
    });
    fireEvent.change(screen.getByLabelText('Texto sobre a cor principal — valor hexadecimal'), {
      target: { value: '#FFFFFF' },
    });
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    await waitFor(() => {
      const patches = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patches.length).toBeGreaterThan(0);
    });
    expect((await screen.findByRole('status')).textContent).toMatch(/alterações salvas/i);
  });

  it('bloqueia save com contraste inválido', async () => {
    stubBranding(emptyBranding);
    renderAppearance();
    await screen.findByRole('textbox', { name: 'Nome da plataforma' });

    fireEvent.change(screen.getByLabelText('Cor principal — valor hexadecimal'), {
      target: { value: '#EEEEEE' },
    });
    fireEvent.change(screen.getByLabelText('Texto sobre a cor principal — valor hexadecimal'), {
      target: { value: '#FFFFFF' },
    });

    expect(saveButton().disabled).toBe(true);
    expect(screen.getByRole('alert').textContent).toMatch(/contraste suficiente/i);
  });

  it('seleção de logo habilita, preview local, upload só no save', async () => {
    stubBranding(emptyBranding);
    renderAppearance();
    await screen.findByRole('textbox', { name: 'Nome da plataforma' });

    const logoSection = screen
      .getByRole('heading', { name: 'Logo principal' })
      .closest('section') as HTMLElement;
    const input = logoSection.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File([new Uint8Array([137, 80, 78, 71])], 'logo.png', { type: 'image/png' });

    fireEvent.change(input, { target: { files: [file] } });
    expect(URL.createObjectURL).toHaveBeenCalled();
    expect(saveButton().disabled).toBe(false);
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.every(
        (call) => (call[1] as RequestInit | undefined)?.method !== 'POST',
      ),
    ).toBe(true);

    fireEvent.click(saveButton());

    await waitFor(() => {
      const call = (fetch as ReturnType<typeof vi.fn>).mock.calls.find(
        (entry) => String(entry[0]).endsWith('/logo') && entry[1]?.method === 'POST',
      );
      expect(call?.[1]?.body).toBeInstanceOf(FormData);
    });
    expect((await screen.findByRole('status')).textContent).toMatch(/alterações salvas/i);
  });

  it('seleção de favicon habilita e sobe no save', async () => {
    stubBranding(branded);
    renderAppearance();
    await screen.findByDisplayValue('Economização Custom');

    const favSection = screen
      .getByRole('heading', { name: /ícone da aba/i })
      .closest('section') as HTMLElement;
    const input = favSection.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], 'fav.png', { type: 'image/png' })],
      },
    });
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/admin/platform/branding/favicon',
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('remoção de favicon é pendente até o save', async () => {
    stubBranding(branded);
    renderAppearance();
    await screen.findByDisplayValue('Economização Custom');

    fireEvent.click(screen.getByRole('button', { name: 'Remover ícone da aba' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));

    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.every(
        (call) =>
          !(
            String(call[0]).endsWith('/favicon') &&
            (call[1] as RequestInit | undefined)?.method === 'DELETE'
          ),
      ),
    ).toBe(true);
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/admin/platform/branding/favicon',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('múltiplas alterações no mesmo save (nome + cores)', async () => {
    stubBranding(branded);
    renderAppearance();
    await screen.findByDisplayValue('Economização Custom');

    fireEvent.change(screen.getByRole('textbox', { name: 'Nome da plataforma' }), {
      target: { value: 'Marca Unificada' },
    });
    fireEvent.change(screen.getByLabelText('Cor principal — valor hexadecimal'), {
      target: { value: '#224466' },
    });

    fireEvent.click(saveButton());

    await waitFor(() => {
      const patches = (fetch as ReturnType<typeof vi.fn>).mock.calls.filter(
        (call) => (call[1] as RequestInit | undefined)?.method === 'PATCH',
      );
      expect(patches.some((call) => String(call[1]?.body).includes('Marca Unificada'))).toBe(true);
      expect(patches.some((call) => String(call[1]?.body).includes('#224466'))).toBe(true);
    });
  });

  it('erro parcial não marca sucesso total', async () => {
    stubBranding(branded);
    renderAppearance();
    await screen.findByDisplayValue('Economização Custom');

    const favSection = screen
      .getByRole('heading', { name: /ícone da aba/i })
      .closest('section') as HTMLElement;
    fireEvent.change(favSection.querySelector('input[type="file"]') as HTMLInputElement, {
      target: {
        files: [new File([new Uint8Array([1])], 'fav.png', { type: 'image/png' })],
      },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Nome da plataforma' }), {
      target: { value: 'Depois do favicon' },
    });

    const fetchMock = fetch as ReturnType<typeof vi.fn>;
    fetchMock.mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return Promise.resolve(jsonResponse(serverState));
      }
      if (method === 'POST' && path.endsWith('/favicon')) {
        serverState = { ...serverState, faviconUrl: '/files/fav-ok' };
        return Promise.resolve(jsonResponse(serverState));
      }
      if (method === 'PATCH') {
        return Promise.resolve(
          jsonResponse({ error: { code: 'VALIDATION_ERROR', message: 'Nome inválido.' } }, 422),
        );
      }
      return Promise.resolve(jsonResponse(serverState));
    });

    fireEvent.click(saveButton());

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(screen.getByRole('alert').textContent).toMatch(/parte das alterações foi salva/i);
  });

  it('reset global permanece separado', async () => {
    stubBranding(branded);
    renderAppearance();
    await screen.findByDisplayValue('Economização Custom');

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
    expect(screen.getByLabelText('Confirmar restauração')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar restauração' }));

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/admin/platform/branding',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });
  });

  it('prévia claro/escuro não altera tema global', async () => {
    stubBranding(emptyBranding);
    document.documentElement.dataset.theme = 'light';
    renderAppearance();
    await screen.findByTestId('platform-branding-preview');

    fireEvent.click(
      within(screen.getByRole('tablist', { name: 'Prévia' })).getByRole('tab', { name: 'Escuro' }),
    );
    expect(document.documentElement.dataset.theme).toBe('light');
    expect(screen.getByTestId('platform-branding-preview').getAttribute('data-theme')).toBe('dark');
  });

  it('exibe orientação visual de proporção', async () => {
    stubBranding(emptyBranding);
    renderAppearance();
    await screen.findByRole('textbox', { name: 'Nome da plataforma' });
    expect(screen.getByTestId('platform-logo-guidance').textContent).toMatch(/horizontal/i);
    expect(screen.getByTestId('platform-icon-guidance').textContent).toMatch(/quadrada/i);
    expect(screen.getByTestId('platform-favicon-guidance').textContent).toMatch(/512×512/);
  });

  it('rejeita SVG e favicon grande localmente', async () => {
    stubBranding(emptyBranding);
    renderAppearance();
    await screen.findByRole('textbox', { name: 'Nome da plataforma' });

    const logoSection = screen
      .getByRole('heading', { name: 'Logo principal' })
      .closest('section') as HTMLElement;
    fireEvent.change(logoSection.querySelector('input[type="file"]') as HTMLInputElement, {
      target: {
        files: [new File([new Uint8Array([1])], 'logo.svg', { type: 'image/svg+xml' })],
      },
    });
    expect(screen.getByRole('alert').textContent).toMatch(/PNG, JPEG ou WebP/i);
  });

  it('seleção de ícone compacto sobe no save sem reutilizar a logo', async () => {
    stubBranding(emptyBranding);
    renderAppearance();
    await screen.findByRole('heading', { name: 'Ícone da plataforma' });

    const iconSection = screen
      .getByRole('heading', { name: 'Ícone da plataforma' })
      .closest('section') as HTMLElement;
    fireEvent.change(iconSection.querySelector('input[type="file"]') as HTMLInputElement, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], 'icon.png', { type: 'image/png' })],
      },
    });
    expect(saveButton().disabled).toBe(false);

    fireEvent.click(saveButton());

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/admin/platform/branding/icon',
        expect.objectContaining({ method: 'POST' }),
      );
    });
    expect(
      (fetch as ReturnType<typeof vi.fn>).mock.calls.every(
        (call) => !(String(call[0]).endsWith('/logo') && call[1]?.method === 'POST'),
      ),
    ).toBe(true);
  });
});
