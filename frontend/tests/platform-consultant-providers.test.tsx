import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { PlatformConsultantProvidersPage } from '../src/components/settings/platform-consultant-providers-page';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => '/configuracoes/consultor',
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
    [key: string]: unknown;
  }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

const admin = { ...mockAuthenticatedUser, role: 'ADMIN' as const, tenantId: null };
const superAdmin = { ...mockAuthenticatedUser, role: 'SUPER_ADMIN' as const, tenantId: null };

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage(user: typeof admin | typeof superAdmin = admin) {
  return renderWithAuth(
    <ThemeProvider>
      <PlatformConsultantProvidersPage />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(user),
      hydrateOnMount: true,
    },
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('administração global de providers de IA', () => {
  it('NONE mostra não configurado, input vazio e salvar', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/admin/consultant/providers') && (!init?.method || init.method === 'GET')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                provider: 'OPENAI',
                configured: false,
                source: 'NONE',
                displayHint: null,
                configuredAt: null,
              },
              {
                provider: 'ANTHROPIC',
                configured: false,
                source: 'NONE',
                displayHint: null,
                configuredAt: null,
              },
            ],
          }),
        );
      }
      if (url.endsWith('/admin/consultant/providers/OPENAI/credential') && init?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse({
            provider: 'OPENAI',
            configured: true,
            source: 'MANAGED',
            displayHint: 'sk-proj-••••••••',
            configuredAt: '2026-09-24T12:00:00.000Z',
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    expect(await screen.findAllByText('Não configurado')).toHaveLength(2);
    expect(screen.queryByText('Remover')).toBeNull();
    const openaiCard = screen.getByTestId('provider-OPENAI');
    expect((within(openaiCard).getByPlaceholderText('Cole a chave da OpenAI') as HTMLInputElement).value).toBe('');

    fireEvent.change(within(openaiCard).getByPlaceholderText('Cole a chave da OpenAI'), {
      target: { value: 'sk-proj-new-secret-value' },
    });
    fireEvent.click(within(openaiCard).getByRole('button', { name: 'Salvar chave' }));

    await waitFor(() => {
      expect(screen.getByText('OpenAI atualizado.')).toBeTruthy();
    });
    expect(screen.getByText('Configurado pelo painel')).toBeTruthy();
    expect(screen.getByText('sk-proj-••••••••')).toBeTruthy();
    expect((screen.getByPlaceholderText('Cole uma nova chave para substituir') as HTMLInputElement).value).toBe('');
    expect(screen.queryByDisplayValue('sk-proj-new-secret-value')).toBeNull();
  });

  it('ENV explica infraestrutura, input vazio e não mostra Remover', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              provider: 'OPENAI',
              configured: true,
              source: 'ENV',
              displayHint: null,
              configuredAt: null,
            },
            {
              provider: 'ANTHROPIC',
              configured: false,
              source: 'NONE',
              displayHint: null,
              configuredAt: null,
            },
          ],
        }),
      ),
    );

    renderPage();
    expect(await screen.findByText('Disponível pelo servidor')).toBeTruthy();
    expect(
      screen.getByText(/Existe uma credencial configurada na infraestrutura/),
    ).toBeTruthy();
    expect(screen.queryByText('Configurado pelo painel')).toBeNull();
    expect(screen.queryByTestId('hint-OPENAI')).toBeNull();
    expect(screen.queryByText('Remover')).toBeNull();
    expect(
      (screen.getByPlaceholderText('Cadastre uma chave para gerenciá-la pelo painel') as HTMLInputElement)
        .value,
    ).toBe('');
    expect(screen.getByRole('button', { name: 'Cadastrar chave no painel' })).toBeTruthy();
  });

  it('MANAGED mostra hint fora do input, substitui e remove para ENV', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/admin/consultant/providers') && (!init?.method || init.method === 'GET')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                provider: 'OPENAI',
                configured: true,
                source: 'MANAGED',
                displayHint: 'sk-proj-••••••••',
                configuredAt: '2026-09-24T12:00:00.000Z',
              },
              {
                provider: 'ANTHROPIC',
                configured: false,
                source: 'NONE',
                displayHint: null,
                configuredAt: null,
              },
            ],
          }),
        );
      }
      if (url.endsWith('/admin/consultant/providers/OPENAI/credential') && init?.method === 'PUT') {
        return Promise.resolve(
          jsonResponse({
            provider: 'OPENAI',
            configured: true,
            source: 'MANAGED',
            displayHint: 'sk-••••••••',
            configuredAt: '2026-09-24T15:00:00.000Z',
          }),
        );
      }
      if (url.endsWith('/admin/consultant/providers/OPENAI/credential') && init?.method === 'DELETE') {
        return Promise.resolve(
          jsonResponse({
            provider: 'OPENAI',
            configured: true,
            source: 'ENV',
            displayHint: null,
            configuredAt: null,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    expect(await screen.findByText('Configurado pelo painel')).toBeTruthy();
    expect(screen.getByText('Chave cadastrada')).toBeTruthy();
    expect(screen.getByTestId('hint-OPENAI').textContent).toBe('sk-proj-••••••••');
    expect(screen.getByText(/Cadastrada em/)).toBeTruthy();
    expect((screen.getByLabelText('Substituir chave') as HTMLInputElement).value).toBe('');
    expect(screen.queryByDisplayValue(/sk-/)).toBeNull();

    fireEvent.change(screen.getByLabelText('Substituir chave'), {
      target: { value: 'sk-new-secret-value' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Substituir chave' }));

    await waitFor(() => {
      expect(screen.getByText('OpenAI atualizado.')).toBeTruthy();
    });
    expect((screen.getByLabelText('Substituir chave') as HTMLInputElement).value).toBe('');
    expect(screen.getByTestId('hint-OPENAI').textContent).toBe('sk-••••••••');
    expect(screen.queryByDisplayValue('sk-new-secret-value')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Remover' }));
    expect(screen.getByText('Remover a credencial gerenciada pelo painel?')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));

    await waitFor(() => {
      expect(screen.getByText('Disponível pelo servidor')).toBeTruthy();
    });
    expect(screen.queryByTestId('hint-OPENAI')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull();
  });

  it('remover MANAGED sem ENV volta para NONE', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/admin/consultant/providers') && (!init?.method || init.method === 'GET')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              {
                provider: 'OPENAI',
                configured: true,
                source: 'MANAGED',
                displayHint: 'sk-••••••••',
                configuredAt: '2026-09-24T12:00:00.000Z',
              },
              {
                provider: 'ANTHROPIC',
                configured: false,
                source: 'NONE',
                displayHint: null,
                configuredAt: null,
              },
            ],
          }),
        );
      }
      if (init?.method === 'DELETE') {
        return Promise.resolve(
          jsonResponse({
            provider: 'OPENAI',
            configured: false,
            source: 'NONE',
            displayHint: null,
            configuredAt: null,
          }),
        );
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Remover' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar remoção' }));
    await waitFor(() => {
      expect(screen.getAllByText('Não configurado').length).toBeGreaterThan(0);
    });
    expect(screen.queryByRole('button', { name: 'Remover' })).toBeNull();
  });

  it('SUPER_ADMIN também acessa a gestão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            {
              provider: 'OPENAI',
              configured: false,
              source: 'NONE',
              displayHint: null,
              configuredAt: null,
            },
            {
              provider: 'ANTHROPIC',
              configured: false,
              source: 'NONE',
              displayHint: null,
              configuredAt: null,
            },
          ],
        }),
      ),
    );

    renderPage(superAdmin);
    expect(await screen.findByText('Credenciais do Consultor')).toBeTruthy();
    expect(screen.getAllByLabelText('Cadastrar chave').length).toBeGreaterThan(0);
    for (const input of screen.getAllByLabelText('Cadastrar chave') as HTMLInputElement[]) {
      expect(input.value).toBe('');
    }
  });
});
