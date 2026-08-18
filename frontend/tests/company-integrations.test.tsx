import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';

import { CompanyIntegrationsPage } from '../src/components/companies/company-integrations-page';
import type { Company } from '../src/services/admin/companies.types';
import type { ContaAzulIntegration } from '../src/services/admin/conta-azul.types';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

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

const disconnected: ContaAzulIntegration = {
  provider: 'CONTA_AZUL',
  status: 'DISCONNECTED',
  connectedAt: null,
  disconnectedAt: null,
  externalAccountId: null,
  externalCompanyName: null,
  lastSuccessfulSyncAt: null,
  lastErrorAt: null,
  lastErrorCode: null,
};

const connected: ContaAzulIntegration = {
  provider: 'CONTA_AZUL',
  status: 'CONNECTED',
  connectedAt: '2026-08-17T12:00:00.000Z',
  disconnectedAt: null,
  externalAccountId: '123456',
  externalCompanyName: 'Conta Azul Software Ltda',
  lastSuccessfulSyncAt: null,
  lastErrorAt: null,
  lastErrorCode: null,
};

const attention: ContaAzulIntegration = {
  ...connected,
  status: 'ERROR',
  lastErrorAt: '2026-08-18T15:00:00.000Z',
  lastErrorCode: 'identity_unauthorized',
};

const replaceMock = vi.fn();
const assignMock = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
  usePathname: () => `/empresas/${companyId}/integracoes`,
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

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function renderPage(oauthResult?: string | null) {
  return renderWithAuth(
    <ThemeProvider>
      <CompanyIntegrationsPage companyId={companyId} oauthResult={oauthResult} />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser({
        ...mockAuthenticatedUser,
        role: 'ADMIN',
        tenantId: null,
      }),
      hydrateOnMount: true,
    },
  );
}

describe('UI Integrações Conta Azul (2.2)', () => {
  beforeEach(() => {
    replaceMock.mockReset();
    assignMock.mockReset();
    vi.stubGlobal('location', { ...window.location, assign: assignMock });
  });

  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it('mostra aba Integrações e estado não conectado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        return Promise.resolve(jsonResponse(disconnected));
      }),
    );
    renderPage();
    expect(await screen.findByRole('heading', { name: 'Conta Azul' })).toBeTruthy();
    const nav = screen.getByRole('navigation', { name: 'Seções da empresa' });
    expect(within(nav).getByRole('link', { name: 'Integrações' }).getAttribute('href')).toBe(
      `/empresas/${companyId}/integracoes`,
    );
    expect(screen.getByText('Não conectada')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conectar Conta Azul' })).toBeTruthy();
  });

  it('conectar redireciona para a URL oficial da Conta Azul', async () => {
    const authorizationUrl =
      'https://login.contaazul.com/#/oauth/authorize?response_type=code&client_id=abc&redirect_uri=http%3A%2F%2F127.0.0.1%3A3000%2Fintegrations%2Fconta-azul%2Fcallback&state=xyz&scope=openid+profile+aws.cognito.signin.user.admin';
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/connect') && init?.method === 'POST') {
          return Promise.resolve(jsonResponse({ authorizationUrl }));
        }
        return Promise.resolve(jsonResponse(disconnected));
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Conectar Conta Azul' }));
    await waitFor(() => {
      expect(assignMock).toHaveBeenCalledWith(authorizationUrl);
    });
  });

  it('estado conectado oferece reconectar e desconectar com confirmação', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/disconnect') && init?.method === 'POST') {
          return Promise.resolve(jsonResponse(disconnected));
        }
        return Promise.resolve(jsonResponse(connected));
      }),
    );
    renderPage();
    expect(await screen.findByText('Conectada')).toBeTruthy();
    expect(screen.getByText('Empresa conectada: Conta Azul Software Ltda')).toBeTruthy();
    expect(screen.getByText('Identificador: 123456')).toBeTruthy();
    expect(screen.getByText('Última sincronização: Nunca sincronizado')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Reconectar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verificar conexão' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Desconectar' }));
    expect(screen.getByText('A sincronização com a Conta Azul será interrompida.')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar desconexão' }));
    expect(await screen.findByText('Não conectada')).toBeTruthy();
  });

  it('callback de sucesso mostra mensagem e limpa a query', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        return Promise.resolve(jsonResponse(connected));
      }),
    );
    renderPage('connected');
    expect(await screen.findByText('Conta Azul conectada com sucesso.')).toBeTruthy();
    expect(replaceMock).toHaveBeenCalledWith(`/empresas/${companyId}/integracoes`);
  });

  it('callback de falha mostra mensagem sanitizada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        return Promise.resolve(jsonResponse(disconnected));
      }),
    );
    renderPage('denied');
    expect(await screen.findByText('A autorização na Conta Azul foi recusada.')).toBeTruthy();
  });

  it('estado de atenção mostra diagnóstico amigável sem código técnico', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        return Promise.resolve(jsonResponse(attention));
      }),
    );
    renderPage();
    expect(await screen.findByText('Atenção necessária')).toBeTruthy();
    expect(screen.getByText(/A autorização da Conta Azul precisa ser renovada/)).toBeTruthy();
    expect(screen.queryByText('identity_unauthorized')).toBeNull();
  });

  it('verificar conexão atualiza o card', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/verify') && init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse({
              ...connected,
              externalCompanyName: 'Empresa Verificada',
            }),
          );
        }
        return Promise.resolve(jsonResponse(connected));
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Verificar conexão' }));
    expect(await screen.findByText('Empresa conectada: Empresa Verificada')).toBeTruthy();
    expect(screen.getByText('Conexão com a Conta Azul verificada.')).toBeTruthy();
  });
});
