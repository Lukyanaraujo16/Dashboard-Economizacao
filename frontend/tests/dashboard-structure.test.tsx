import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DashboardCard,
  DashboardGrid,
  DashboardHero,
  DashboardPage,
  DashboardSection,
  EmptyPanel,
  EmptyState,
  resolveGreetingPrefix,
} from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import { DashboardOverviewRequestError } from '../src/services/dashboard/overview.types';
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
}));

vi.mock('../src/services/dashboard/overview', () => ({
  getDashboardOverview: vi.fn(),
}));

const getOverview = vi.mocked(getDashboardOverview);

const syncedOverview = {
  today: '2026-08-19',
  receivables: { open: '8.5', overdue: '3', upcoming: '5.5' },
  payables: { open: '20', overdue: '4', upcoming: '16' },
  delinquency: { overdueUnpaid: '3', openUnpaid: '8.5', rate: '35.2941' },
  integration: {
    status: 'CONNECTED' as const,
    lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
    lastErrorCode: null,
  },
};

function kpiCard(title: string) {
  const heading = screen.getByRole('heading', { name: title });
  const card = heading.closest('[data-kpi-card]');
  expect(card).toBeTruthy();
  return within(card as HTMLElement);
}

function renderDashboard(
  user = mockAuthenticatedUser,
  support:
    | { active: false }
    | {
        active: true;
        tenantId: string;
        tenantDisplayName: string;
        startedAt: string;
        supportSessionId: string;
      } = {
    active: false,
  },
) {
  return renderWithAuth(
    <ThemeProvider>
      <DashboardPage />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(user, support),
      hydrateOnMount: true,
    },
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('Dashboard structure (10B)', () => {
  it('resolveGreetingPrefix cobre manhã, tarde e noite', () => {
    expect(resolveGreetingPrefix(new Date('2026-08-13T08:00:00'))).toBe('Bom dia');
    expect(resolveGreetingPrefix(new Date('2026-08-13T15:00:00'))).toBe('Boa tarde');
    expect(resolveGreetingPrefix(new Date('2026-08-13T21:00:00'))).toBe('Boa noite');
  });

  it('mostra loading e depois KPIs reais em BRL e percentual', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    renderDashboard();

    expect(await screen.findByRole('heading', { name: 'Resumo Financeiro' })).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    });

    expect(screen.getByRole('heading', { name: 'Contas a receber' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Contas a pagar' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Recebíveis vencidos' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Inadimplência' })).toBeTruthy();
    expect(kpiCard('Contas a receber').getByText(/R\$\s*8,50/)).toBeTruthy();
    expect(kpiCard('Contas a pagar').getByText(/R\$\s*20,00/)).toBeTruthy();
    expect(kpiCard('Recebíveis vencidos').getByText(/R\$\s*3,00/)).toBeTruthy();
    expect(kpiCard('Inadimplência').getByText('35,3%')).toBeTruthy();
    expect(screen.getByText(/Última sincronização:/)).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Receita' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Despesas' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Saldo' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Resultado' })).toBeNull();
    expect(screen.getByText('O fluxo previsto entra em uma próxima etapa.')).toBeTruthy();
  });

  it('never-sync não mostra zeros como dado financeiro', async () => {
    getOverview.mockResolvedValue({
      ...syncedOverview,
      receivables: { open: '0', overdue: '0', upcoming: '0' },
      payables: { open: '0', overdue: '0', upcoming: '0' },
      delinquency: { overdueUnpaid: '0', openUnpaid: '0', rate: null },
      integration: {
        status: 'CONNECTED',
        lastSuccessfulSyncAt: null,
        lastErrorCode: null,
      },
    });
    renderDashboard();

    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="never-sync"]')).toBeTruthy();
    });
    expect(screen.getAllByText('Aguardando a primeira sincronização').length).toBe(4);
    expect(screen.queryByText(/R\$\s*0,00/)).toBeNull();
  });

  it('zero pós-sync mostra R$ 0,00 e rate null como travessão', async () => {
    getOverview.mockResolvedValue({
      ...syncedOverview,
      receivables: { open: '0', overdue: '0', upcoming: '0' },
      payables: { open: '0', overdue: '0', upcoming: '0' },
      delinquency: { overdueUnpaid: '0', openUnpaid: '0', rate: null },
    });
    renderDashboard();

    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    });
    expect(screen.getAllByText(/R\$\s*0,00/).length).toBeGreaterThan(0);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Sem valores em aberto.')).toBeTruthy();
    expect(screen.queryByText('0%')).toBeNull();
  });

  it('rate zero exato aparece como 0%', async () => {
    getOverview.mockResolvedValue({
      ...syncedOverview,
      receivables: { open: '10', overdue: '0', upcoming: '10' },
      delinquency: { overdueUnpaid: '0', openUnpaid: '10', rate: '0' },
    });
    renderDashboard();

    await waitFor(() => {
      expect(screen.getByText('0%')).toBeTruthy();
    });
  });

  it('DISCONNECTED com dados mantém KPIs e aviso', async () => {
    getOverview.mockResolvedValue({
      ...syncedOverview,
      integration: {
        status: 'DISCONNECTED',
        lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
        lastErrorCode: null,
      },
    });
    renderDashboard();

    await waitFor(() => {
      expect(kpiCard('Contas a receber').getByText(/R\$\s*8,50/)).toBeTruthy();
    });
    expect(
      screen.getByText('Integração desconectada. Exibindo os últimos dados sincronizados.'),
    ).toBeTruthy();
  });

  it('ERROR de integração não é fetch error e não mostra código cru', async () => {
    getOverview.mockResolvedValue({
      ...syncedOverview,
      integration: {
        status: 'ERROR',
        lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
        lastErrorCode: 'refresh_failed',
      },
    });
    renderDashboard();

    await waitFor(() => {
      expect(kpiCard('Contas a receber').getByText(/R\$\s*8,50/)).toBeTruthy();
    });
    expect(
      screen.getByText(
        'Não foi possível atualizar a integração. Exibindo os últimos dados sincronizados.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('refresh_failed')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
  });

  it('fetch error oferece retry', async () => {
    getOverview
      .mockRejectedValueOnce(
        new DashboardOverviewRequestError(
          'unavailable',
          'Não foi possível carregar os indicadores da sua empresa.',
        ),
      )
      .mockResolvedValueOnce(syncedOverview);
    renderDashboard();

    expect(await screen.findByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => {
      expect(kpiCard('Contas a receber').getByText(/R\$\s*8,50/)).toBeTruthy();
    });
    expect(getOverview).toHaveBeenCalledTimes(2);
  });

  it('ADMIN sem Support Mode não dispara overview como falha financeira', async () => {
    renderDashboard({
      id: 'admin-1',
      name: 'Admin',
      email: 'admin@plataforma.com',
      role: 'ADMIN',
      tenantId: null,
    });

    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="forbidden"]')).toBeTruthy();
    });
    expect(
      screen.getAllByText('Selecione uma empresa pelo modo suporte para visualizar esta Dashboard.')
        .length,
    ).toBeGreaterThan(0);
    expect(getOverview).not.toHaveBeenCalled();
  });

  it('EmptyState e EmptyPanel renderizam descrição', () => {
    renderWithAuth(
      <ThemeProvider>
        <EmptyState description="Estado vazio de teste." />
        <EmptyPanel description="Painel vazio de teste." />
        <DashboardSection id="sec-test" title="Seção teste">
          <DashboardGrid columns={2}>
            <DashboardCard title="Card A" />
            <DashboardCard title="Card B" emptyDescription="Sem dado." />
          </DashboardGrid>
        </DashboardSection>
        <DashboardHero displayName="Ana" now={new Date('2026-08-13T09:00:00')} />
      </ThemeProvider>,
    );

    expect(screen.getByText('Estado vazio de teste.')).toBeTruthy();
    expect(screen.getByText('Painel vazio de teste.')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Seção teste' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Bom dia, Ana.' })).toBeTruthy();
    expect(screen.getByText('Sem dado.')).toBeTruthy();
  });
});
