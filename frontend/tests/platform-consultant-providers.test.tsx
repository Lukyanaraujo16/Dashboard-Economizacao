import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
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
  it('ADMIN vê estado configurado e nunca reexibe a chave', async () => {
    const fetchMock = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.endsWith('/admin/consultant/providers') && (!init?.method || init.method === 'GET')) {
        return Promise.resolve(
          jsonResponse({
            data: [
              { provider: 'OPENAI', configured: true },
              { provider: 'ANTHROPIC', configured: false },
            ],
          }),
        );
      }
      if (url.endsWith('/admin/consultant/providers/OPENAI/credential') && init?.method === 'PUT') {
        return Promise.resolve(jsonResponse({ provider: 'OPENAI', configured: true }));
      }
      return Promise.resolve(jsonResponse({}));
    });
    vi.stubGlobal('fetch', fetchMock);

    renderPage();
    expect(await screen.findByText('OpenAI')).toBeTruthy();
    expect(screen.getByText('Configurado')).toBeTruthy();
    expect(screen.getByText('Não configurado')).toBeTruthy();
    expect(screen.queryByDisplayValue(/sk-/)).toBeNull();

    fireEvent.change(screen.getByLabelText('Substituir chave'), {
      target: { value: 'sk-new-secret-value' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Substituir chave' }));

    await waitFor(() => {
      expect(screen.getByText('OpenAI atualizado.')).toBeTruthy();
    });
    expect((screen.getByLabelText('Substituir chave') as HTMLInputElement).value).toBe('');
    expect(screen.queryByDisplayValue('sk-new-secret-value')).toBeNull();
    const putBody = JSON.parse(String(fetchMock.mock.calls.find((call) => call[1]?.method === 'PUT')?.[1]?.body));
    expect(putBody).toEqual({ credential: 'sk-new-secret-value' });
  });

  it('SUPER_ADMIN também acessa a gestão', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        jsonResponse({
          data: [
            { provider: 'OPENAI', configured: false },
            { provider: 'ANTHROPIC', configured: false },
          ],
        }),
      ),
    );

    renderPage(superAdmin);
    expect(await screen.findByText('Credenciais do Consultor')).toBeTruthy();
    expect(screen.getAllByLabelText('Cadastrar chave').length).toBeGreaterThan(0);
  });
});
