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
  integration: null,
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
  autoSyncEligible: false,
  autoSyncIntervalMinutes: 60,
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
  autoSyncEligible: false,
  autoSyncIntervalMinutes: 60,
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
    vi.restoreAllMocks();
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
    expect(screen.getByText('Sincronização automática indisponível.')).toBeTruthy();
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
    expect(
      screen.getByText(
        'A sincronização automática será ativada após a primeira sincronização manual.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/Frequência:/)).toBeNull();
    expect(screen.queryByText(/Próxima sincronização/)).toBeNull();
    expect(screen.getByRole('button', { name: 'Reconectar' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Verificar conexão' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toBeTruthy();
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

  it('sincronizar agora dispara POST e mostra andamento', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/sync') && init?.method === 'POST') {
          return Promise.resolve(jsonResponse({ syncRunId: 'run-1', status: 'PENDING' }, 202));
        }
        if (url.endsWith('/sync/current')) {
          return Promise.resolve(jsonResponse({ run: null }));
        }
        return Promise.resolve(jsonResponse(connected));
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar agora' }));
    expect(await screen.findByText('Sincronização em andamento')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Sincronizar agora/ })).toHaveProperty(
      'disabled',
      true,
    );
    expect(screen.queryByText('Sincronização concluída.')).toBeNull();
  });

  it('polling 2,5s mostra SUCCESS com counts processed e data da última sync', async () => {
    const pollers: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      pollers.push(handler as () => void);
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
    let integrationStatus = connected;
    let currentRun: {
      id: string;
      status: string;
      startedAt: string;
      finishedAt: string | null;
      counts: {
        categories: number;
        financialAccounts: number;
        parties: number;
        receivables: number;
        payables: number;
      } | null;
      errorCode: string | null;
    } | null = null;
    const synced = {
      ...connected,
      lastSuccessfulSyncAt: '2026-08-18T18:00:00.000Z',
      autoSyncEligible: true,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/sync') && init?.method === 'POST') {
          return Promise.resolve(
            jsonResponse({ syncRunId: 'run-success', status: 'PENDING' }, 202),
          );
        }
        if (url.endsWith('/sync/current')) {
          return Promise.resolve(jsonResponse({ run: currentRun }));
        }
        return Promise.resolve(jsonResponse(integrationStatus));
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar agora' }));
    expect(await screen.findByText('Sincronização em andamento')).toBeTruthy();
    expect(screen.queryByText('Sincronização concluída.')).toBeNull();
    expect(window.setInterval).toHaveBeenCalledWith(expect.any(Function), 2500);
    currentRun = {
      id: 'run-success',
      status: 'SUCCESS',
      startedAt: '2026-08-18T17:59:00.000Z',
      finishedAt: '2026-08-18T18:00:00.000Z',
      counts: {
        categories: 3,
        financialAccounts: 2,
        parties: 4,
        receivables: 10,
        payables: 8,
      },
      errorCode: null,
    };
    integrationStatus = synced;
    await pollers[pollers.length - 1]!();
    expect(await screen.findByText('Sincronização concluída.')).toBeTruthy();
    expect(
      screen.getByText('Categorias: 3 · Contas: 2 · Pessoas: 4 · A receber: 10 · A pagar: 8'),
    ).toBeTruthy();
    expect(screen.getByText(/Última sincronização:/)).toBeTruthy();
    expect(screen.getByText('Sincronização automática: Ativa')).toBeTruthy();
    expect(screen.getByText('Frequência: a cada 60 minutos')).toBeTruthy();
    expect(screen.queryByText(/Próxima sincronização/)).toBeNull();
    expect(screen.queryByText(/importad/i)).toBeNull();
  });

  it('FAILED mostra mensagem amigável e permite sincronizar de novo', async () => {
    const pollers: Array<() => void> = [];
    vi.spyOn(window, 'setInterval').mockImplementation((handler) => {
      pollers.push(handler as () => void);
      return 1 as unknown as ReturnType<typeof setInterval>;
    });
    vi.spyOn(window, 'clearInterval').mockImplementation(() => undefined);
    let currentRun: {
      id: string;
      status: string;
      startedAt: string;
      finishedAt: string | null;
      counts: null;
      errorCode: string | null;
    } | null = null;
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string, init?: RequestInit) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/sync') && init?.method === 'POST') {
          return Promise.resolve(jsonResponse({ syncRunId: 'run-fail', status: 'PENDING' }, 202));
        }
        if (url.endsWith('/sync/current')) {
          return Promise.resolve(jsonResponse({ run: currentRun }));
        }
        return Promise.resolve(jsonResponse(connected));
      }),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: 'Sincronizar agora' }));
    expect(await screen.findByText('Sincronização em andamento')).toBeTruthy();
    currentRun = {
      id: 'run-fail',
      status: 'FAILED',
      startedAt: '2026-08-18T17:59:00.000Z',
      finishedAt: '2026-08-18T18:01:00.000Z',
      counts: null,
      errorCode: 'sync_upstream_unavailable',
    };
    await pollers[pollers.length - 1]!();
    expect(
      await screen.findByText('Não foi possível sincronizar agora. Tente novamente.'),
    ).toBeTruthy();
    expect(screen.queryByText('Sincronização concluída.')).toBeNull();
    expect(screen.getByRole('button', { name: 'Sincronizar agora' })).toHaveProperty(
      'disabled',
      false,
    );
  });

  it('reload com run RUNNING restaura o andamento', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((url: string) => {
        if (url.endsWith(`/admin/tenants/${companyId}`)) {
          return Promise.resolve(jsonResponse(company));
        }
        if (url.endsWith('/sync/current')) {
          return Promise.resolve(
            jsonResponse({
              run: {
                id: 'run-2',
                status: 'RUNNING',
                startedAt: '2026-08-18T15:00:00.000Z',
                finishedAt: null,
                counts: null,
                errorCode: null,
              },
            }),
          );
        }
        return Promise.resolve(jsonResponse(connected));
      }),
    );
    renderPage();
    expect(await screen.findByText('Sincronização em andamento')).toBeTruthy();
  });
});
