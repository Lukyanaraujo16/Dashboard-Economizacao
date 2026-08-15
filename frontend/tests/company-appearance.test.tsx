import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import AparenciaEmpresaPage from '../app/(authenticated)/empresas/[companyId]/aparencia/page';
import AuthenticatedLayout from '../app/(authenticated)/layout';
import EmpresasLayout from '../app/(authenticated)/empresas/layout';
import { CompanyAppearancePage } from '../src/components/companies/company-appearance-page';
import { CompanyFormPage } from '../src/components/companies/company-form-page';
import type { Company } from '../src/services/admin/companies.types';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();
const pushMock = vi.fn();
const refreshMock = vi.fn();

const companyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

const company: Company = {
  id: companyId,
  name: 'alpha-co',
  displayName: 'Alpha Co',
  status: 'ACTIVE',
  createdAt: '2026-08-14T10:00:00.000Z',
  updatedAt: '2026-08-14T11:00:00.000Z',
  deactivatedAt: null,
};

const emptyBranding = {
  tenantId: companyId,
  logoUrl: null as string | null,
  light: null as Record<string, string> | null,
  dark: null as Record<string, string> | null,
  createdAt: null,
  updatedAt: null,
};

const branded = {
  ...emptyBranding,
  logoUrl: '/files/logo-1',
  light: { primary: '#112233', onPrimary: '#FFFFFF' },
  dark: { primary: '#AABBCC', onPrimary: '#111111' },
  createdAt: '2026-08-14T10:00:00.000Z',
  updatedAt: '2026-08-14T11:00:00.000Z',
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

let pathname = `/empresas/${companyId}/aparencia`;

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

function renderAppearance() {
  return renderWithAuth(
    <ThemeProvider>
      <CompanyAppearancePage companyId={companyId} />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser({
        ...mockAuthenticatedUser,
        role: 'SUPER_ADMIN',
      }),
      hydrateOnMount: true,
    },
  );
}

function stubLoad(
  companyBody: unknown,
  brandingBody: unknown,
  companyStatus = 200,
  brandingStatus = 200,
) {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      const path = String(url);
      if (path.includes('/branding')) {
        return Promise.resolve(jsonResponse(brandingBody, brandingStatus));
      }
      if (path.includes(`/tenants/${companyId}`)) {
        return Promise.resolve(jsonResponse(companyBody, companyStatus));
      }
      return Promise.resolve(jsonResponse({ error: { code: 'NOT_FOUND' } }, 404));
    }),
  );
}

beforeEach(() => {
  pathname = `/empresas/${companyId}/aparencia`;
  replaceMock.mockReset();
  pushMock.mockReset();
  refreshMock.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:preview-logo');
  URL.revokeObjectURL = vi.fn();
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('Company appearance UI', () => {
  it('header do shell usa Empresas / Aparência', async () => {
    stubLoad(company, emptyBranding);
    renderWithAuth(
      <ThemeProvider>
        <AuthenticatedLayout>
          <EmpresasLayout>
            <CompanyAppearancePage companyId={companyId} />
          </EmpresasLayout>
        </AuthenticatedLayout>
      </ThemeProvider>,
      {
        getCurrentUserAction: createAuthenticatedGetCurrentUser({
          ...mockAuthenticatedUser,
          role: 'SUPER_ADMIN',
          tenantId: null,
        }),
        hydrateOnMount: true,
      },
    );

    const header = await screen.findByRole('banner');
    expect(within(header).getByRole('heading', { level: 1, name: 'Aparência' })).toBeTruthy();
    expect(within(header).getByText('Empresas')).toBeTruthy();
    expect(within(header).queryByText('Visão geral')).toBeNull();
    expect(within(header).queryByText('Dashboard')).toBeNull();
  });

  it('navegação interna mostra somente Geral e Aparência', async () => {
    stubLoad(company, emptyBranding);
    renderAppearance();

    await screen.findByText('Logo da empresa');

    const nav = screen.getByRole('navigation', { name: 'Seções da empresa' });
    expect(within(nav).getByRole('link', { name: 'Geral' }).getAttribute('href')).toBe(
      `/empresas/${companyId}/editar`,
    );
    expect(within(nav).getByRole('link', { name: 'Aparência' }).getAttribute('href')).toBe(
      `/empresas/${companyId}/aparencia`,
    );
    expect(within(nav).queryByRole('link', { name: 'Usuários' })).toBeNull();
    expect(within(nav).queryByRole('link', { name: 'Integrações' })).toBeNull();
  });

  it('hub Geral também expõe Aparência', async () => {
    pathname = `/empresas/${companyId}/editar`;
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse(company)));

    renderWithAuth(
      <ThemeProvider>
        <CompanyFormPage mode="edit" companyId={companyId} />
      </ThemeProvider>,
      {
        getCurrentUserAction: createAuthenticatedGetCurrentUser({
          ...mockAuthenticatedUser,
          role: 'SUPER_ADMIN',
        }),
        hydrateOnMount: true,
      },
    );

    await screen.findByLabelText('Nome da empresa');
    const nav = screen.getByRole('navigation', { name: 'Seções da empresa' });
    expect(within(nav).getByRole('link', { name: 'Aparência' })).toBeTruthy();
    expect(within(nav).getByRole('link', { name: 'Geral' })).toBeTruthy();
  });

  it('carrega empresa sem branding com fallback de logo', async () => {
    stubLoad(company, emptyBranding);
    renderAppearance();

    await screen.findByText('Logo da empresa');
    expect(screen.getByText(/PNG, JPEG ou WebP/i)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Enviar logo' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Remover logo' })).toBeNull();
  });

  it('mostra loading enquanto carrega', async () => {
    const resolvers: Array<(value: Response) => void> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation(
        () =>
          new Promise<Response>((resolve) => {
            resolvers.push(resolve);
          }),
      ),
    );

    renderAppearance();
    expect(screen.getByLabelText(/carregando aparência/i)).toBeTruthy();

    for (const resolve of resolvers) {
      resolve(jsonResponse(emptyBranding));
    }
  });

  it('carrega branding existente com logo e cores', async () => {
    stubLoad(company, branded);
    renderAppearance();

    await screen.findByText('Logo da empresa');
    expect(screen.getByRole('button', { name: 'Substituir logo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remover logo' })).toBeTruthy();
    expect(
      (screen.getByLabelText('Cor principal — valor hexadecimal') as HTMLInputElement).value,
    ).toBe('#112233');
  });

  it('trata 404 da empresa', async () => {
    stubLoad({ error: { code: 'NOT_FOUND' } }, emptyBranding, 404, 200);
    renderAppearance();

    expect(await screen.findByText('Empresa não encontrada.')).toBeTruthy();
  });

  it('trata 403', async () => {
    stubLoad(company, { error: { code: 'FORBIDDEN' } }, 200, 403);
    renderAppearance();

    expect(await screen.findByText(/não tem permissão/i)).toBeTruthy();
  });

  it('edita Light e Dark de forma independente', async () => {
    stubLoad(company, emptyBranding);
    renderAppearance();
    await screen.findByText('Logo da empresa');

    const editTabs = screen.getByRole('tablist', { name: 'Editar cores' });
    fireEvent.click(within(editTabs).getByRole('tab', { name: 'Escuro' }));

    const primaryInput = screen.getByLabelText(
      'Cor principal — valor hexadecimal',
    ) as HTMLInputElement;
    fireEvent.change(primaryInput, { target: { value: '#ABCDEF' } });
    expect(primaryInput.value).toBe('#ABCDEF');

    fireEvent.click(within(editTabs).getByRole('tab', { name: 'Claro' }));
    expect(
      (screen.getByLabelText('Cor principal — valor hexadecimal') as HTMLInputElement).value,
    ).toBe('');
  });

  it('bloqueia save com contraste insuficiente e mensagem acessível', async () => {
    stubLoad(company, emptyBranding);
    renderAppearance();
    await screen.findByText('Logo da empresa');

    fireEvent.change(screen.getByLabelText('Cor principal — valor hexadecimal'), {
      target: { value: '#888888' },
    });
    fireEvent.change(screen.getByLabelText('Texto sobre a cor principal — valor hexadecimal'), {
      target: { value: '#777777' },
    });

    expect(await screen.findByText(/não oferece contraste suficiente/i)).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: 'Salvar cores' }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });

  it('permite save com contraste válido via PATCH', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes('/branding') && (!init || !init.method || init.method === 'GET')) {
        return Promise.resolve(jsonResponse(emptyBranding));
      }
      if (path.includes('/branding') && init?.method === 'PATCH') {
        return Promise.resolve(
          jsonResponse({
            ...emptyBranding,
            light: { primary: '#141452', onPrimary: '#FFFFFF' },
          }),
        );
      }
      if (path.includes(`/tenants/${companyId}`)) {
        return Promise.resolve(jsonResponse(company));
      }
      return Promise.resolve(jsonResponse({ error: { code: 'NOT_FOUND' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAppearance();
    await screen.findByText('Logo da empresa');

    fireEvent.change(screen.getByLabelText('Cor principal — valor hexadecimal'), {
      target: { value: '#141452' },
    });
    fireEvent.change(screen.getByLabelText('Texto sobre a cor principal — valor hexadecimal'), {
      target: { value: '#FFFFFF' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Salvar cores' }));

    await waitFor(() => {
      expect(fetchMock.mock.calls.some((call) => call[1]?.method === 'PATCH')).toBe(true);
    });
    expect(await screen.findByText('Cores da aparência salvas.')).toBeTruthy();
  });

  it('preview usa overrides e troca Claro/Escuro sem alterar tema global', async () => {
    stubLoad(company, branded);
    renderAppearance();
    await screen.findByText('Logo da empresa');

    const preview = screen.getByTestId('company-branding-preview');
    expect(preview.getAttribute('data-theme')).toBe('light');
    expect(preview.getAttribute('style') ?? '').toContain('--color-primary');

    fireEvent.click(
      within(screen.getByRole('tablist', { name: 'Prévia' })).getByRole('tab', {
        name: 'Escuro',
      }),
    );

    await waitFor(() => {
      expect(preview.getAttribute('data-theme')).toBe('dark');
    });

    expect(document.documentElement.getAttribute('data-theme')).not.toBe('dark');
  });

  it('seleciona PNG e rejeita SVG e arquivo >2MB', async () => {
    stubLoad(company, emptyBranding);
    renderAppearance();
    await screen.findByText('Logo da empresa');

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/png,image/jpeg,image/webp');

    fireEvent.change(input, {
      target: { files: [new File(['<svg></svg>'], 'logo.svg', { type: 'image/svg+xml' })] },
    });
    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.getByRole('alert').textContent).toMatch(/PNG, JPEG ou WebP/i);

    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'big.png', { type: 'image/png' })],
      },
    });
    expect((await screen.findByRole('alert')).textContent).toMatch(/excede o tamanho máximo/i);

    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })],
      },
    });
    expect(await screen.findByText(/logo\.png/i)).toBeTruthy();
    expect(URL.createObjectURL).toHaveBeenCalled();
  });

  it('upload usa FormData e não define Content-Type', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes('/logo') && init?.method === 'POST') {
        return Promise.resolve(jsonResponse({ ...emptyBranding, logoUrl: '/files/new' }));
      }
      if (path.includes('/branding')) {
        return Promise.resolve(jsonResponse(emptyBranding));
      }
      if (path.includes(`/tenants/${companyId}`)) {
        return Promise.resolve(jsonResponse(company));
      }
      return Promise.resolve(jsonResponse({ error: { code: 'NOT_FOUND' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAppearance();
    await screen.findByText('Logo da empresa');

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(input, {
      target: {
        files: [new File([new Uint8Array([1, 2, 3])], 'logo.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Enviar logo' }));

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find((call) => String(call[0]).includes('/logo'));
      expect(uploadCall).toBeTruthy();
      expect(uploadCall![1]?.body).toBeInstanceOf(FormData);
      const headers = uploadCall![1]?.headers as Record<string, string>;
      expect(headers['Content-Type']).toBeUndefined();
    });
    expect(await screen.findByText('Logo atualizada.')).toBeTruthy();
    expect(URL.revokeObjectURL).toHaveBeenCalled();
  });

  it('remove logo com confirmação inline', async () => {
    let logoPresent = true;
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes('/logo') && init?.method === 'DELETE') {
        logoPresent = false;
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (path.includes('/branding')) {
        return Promise.resolve(jsonResponse(logoPresent ? branded : { ...branded, logoUrl: null }));
      }
      if (path.includes(`/tenants/${companyId}`)) {
        return Promise.resolve(jsonResponse(company));
      }
      return Promise.resolve(jsonResponse({ error: { code: 'NOT_FOUND' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAppearance();
    await screen.findByText('Logo da empresa');

    fireEvent.click(screen.getByRole('button', { name: 'Remover logo' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));

    expect(await screen.findByText(/Logo removida/i)).toBeTruthy();
  });

  it('restaurar padrão chama DELETE branding (cores + logo)', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      const path = String(url);
      if (path.includes('/branding') && init?.method === 'DELETE') {
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      if (path.includes('/branding')) {
        return Promise.resolve(jsonResponse(branded));
      }
      if (path.includes(`/tenants/${companyId}`)) {
        return Promise.resolve(jsonResponse(company));
      }
      return Promise.resolve(jsonResponse({ error: { code: 'NOT_FOUND' } }, 404));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderAppearance();
    await screen.findByText('Logo da empresa');

    fireEvent.click(screen.getByRole('button', { name: 'Restaurar padrão' }));
    expect(screen.getByText(/cores e logo/i)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar restauração' }));

    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(
          (call) => String(call[0]).includes('/branding') && call[1]?.method === 'DELETE',
        ),
      ).toBe(true);
    });
    expect(await screen.findByText(/Aparência restaurada/i)).toBeTruthy();
  });

  it('página de rota renderiza Aparência', async () => {
    stubLoad(company, emptyBranding);
    const page = await AparenciaEmpresaPage({
      params: Promise.resolve({ companyId }),
    });

    renderWithAuth(<ThemeProvider>{page}</ThemeProvider>, {
      getCurrentUserAction: createAuthenticatedGetCurrentUser({
        ...mockAuthenticatedUser,
        role: 'SUPER_ADMIN',
      }),
      hydrateOnMount: true,
    });

    expect(await screen.findByText('Logo da empresa')).toBeTruthy();
  });

  it('labels de produto estão presentes', async () => {
    stubLoad(company, emptyBranding);
    renderAppearance();
    await screen.findByText('Logo da empresa');

    expect(screen.getByText('Cor principal')).toBeTruthy();
    expect(screen.getByText('Texto sobre a cor principal')).toBeTruthy();
    expect(screen.getByText('Cor secundária')).toBeTruthy();
    expect(screen.getByText('Cor de destaque')).toBeTruthy();
    expect(screen.getByText('Logo da empresa')).toBeTruthy();
    expect(screen.getByText('Editar cores')).toBeTruthy();
    expect(screen.getByText('Escolher imagem')).toBeTruthy();
  });

  it('preview mostra identidade da empresa sem valores financeiros', async () => {
    stubLoad(company, branded);
    renderAppearance();
    await screen.findByText('Logo da empresa');

    const preview = screen.getByTestId('company-branding-preview');
    expect(within(preview).getByText('Alpha Co')).toBeTruthy();
    expect(within(preview).getByText(/Espaço da empresa/i)).toBeTruthy();
    expect(within(preview).queryByText(/R\$/)).toBeNull();
    expect(screen.getByTestId('appearance-layout')).toBeTruthy();
  });

  it('Editar cores e Prévia são controles distintos', async () => {
    stubLoad(company, emptyBranding);
    renderAppearance();
    await screen.findByText('Logo da empresa');

    expect(screen.getByRole('tablist', { name: 'Editar cores' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Prévia' })).toBeTruthy();
  });
});
