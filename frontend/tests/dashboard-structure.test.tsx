import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
import {
  DashboardOverviewRequestError,
  type DashboardOverviewResponse,
} from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import type { DashboardMonthEndCashPressureResponse } from '../src/services/dashboard/month-end-cash-pressure.types';
import { getDashboardCashFlowForecast } from '../src/services/dashboard/forecast';
import type { DashboardCashFlowForecastResponse } from '../src/services/dashboard/forecast.types';
import { getDashboardMonthlyRevenue } from '../src/services/dashboard/monthly-revenue';
import type { DashboardMonthlyRevenueResponse } from '../src/services/dashboard/monthly-revenue.types';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import type { DashboardMonthlyCashFlowResponse } from '../src/services/dashboard/monthly-cash-flow.types';
import { DashboardMonthlyCashFlowRequestError } from '../src/services/dashboard/monthly-cash-flow.types';
import { getDashboardMonthlyExpenses } from '../src/services/dashboard/monthly-expenses';
import type { DashboardMonthlyExpenseResponse } from '../src/services/dashboard/monthly-expenses.types';
import { getDashboardRevenueGoal } from '../src/services/dashboard/revenue-goal';
import type { RevenueGoalSnapshot } from '../src/services/dashboard/revenue-goal.types';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import { ThemeProvider } from '../src/theme';
import { cashFlowHomeFixture } from './helpers/monthly-cash-flow-fixture';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

let dashboardSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn(),
    push: vi.fn(),
  }),
  usePathname: () => '/',
  useSearchParams: () => dashboardSearchParams,
}));

vi.mock('../src/services/dashboard/overview', () => ({
  getDashboardOverview: vi.fn(),
}));

vi.mock('../src/services/dashboard/month-end-cash-pressure', () => ({
  getDashboardMonthEndCashPressure: vi.fn(),
}));

vi.mock('../src/services/dashboard/forecast', () => ({
  getDashboardCashFlowForecast: vi.fn(),
}));

vi.mock('../src/services/dashboard/monthly-expenses', () => ({
  getDashboardMonthlyExpenses: vi.fn(),
}));

vi.mock('../src/services/dashboard/monthly-revenue', () => ({
  getDashboardMonthlyRevenue: vi.fn(),
}));

vi.mock('../src/services/dashboard/monthly-cash-flow', () => ({
  getDashboardMonthlyCashFlow: vi.fn(),
}));

vi.mock('../src/services/dashboard/revenue-goal', () => ({
  getDashboardRevenueGoal: vi.fn(),
  putDashboardRevenueGoal: vi.fn(),
}));

vi.mock('../src/services/dashboard/cost-centers', () => ({
  getDashboardCostCenters: vi.fn(),
}));

vi.mock('../src/services/dashboard/categories', () => ({
  getDashboardCategories: vi.fn(),
}));

const getOverview = vi.mocked(getDashboardOverview);
const getMonthEnd = vi.mocked(getDashboardMonthEndCashPressure);
const getForecast = vi.mocked(getDashboardCashFlowForecast);
const getMonthlyExpenses = vi.mocked(getDashboardMonthlyExpenses);
const getMonthlyRevenue = vi.mocked(getDashboardMonthlyRevenue);
const getMonthlyCashFlow = vi.mocked(getDashboardMonthlyCashFlow);
const getRevenueGoal = vi.mocked(getDashboardRevenueGoal);
const getCostCenters = vi.mocked(getDashboardCostCenters);
const getCategories = vi.mocked(getDashboardCategories);

const emptyRevenueGoal: RevenueGoalSnapshot = {
  monthKey: '2026-08',
  target: null,
  actual: '0',
  achievementRate: null,
  remaining: null,
  exceeded: null,
  status: 'NO_TARGET',
  history: [],
};

const emptyMonthEnd: DashboardMonthEndCashPressureResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-19',
  to: '2026-08-31',
  summary: { receivable: '0', payable: '0', net: '0' },
};

const emptyForecast: DashboardCashFlowForecastResponse = {
  today: '2026-08-19',
  from: '2026-08-19',
  to: '2026-11-17',
  horizonDays: 90,
  buckets: [
    { key: '2026-08', inflows: '0', outflows: '0', net: '0' },
    { key: '2026-09', inflows: '0', outflows: '0', net: '0' },
  ],
};

const emptyMonthlyExpenses: DashboardMonthlyExpenseResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  payables: {
    total: '0',
    paid: '0',
    outstanding: '0',
    overdue: '0',
    classified: '0',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: null,
    items: [],
    daily: [],
  },
};

const emptyMonthlyRevenue: DashboardMonthlyRevenueResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  receivables: {
    total: '0',
    received: '0',
    outstanding: '0',
    overdue: '0',
    classified: '0',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: null,
    items: [],
    daily: [],
  },
};

/** Caixa zerado — KPIs CASH-4B ficam empty com copy de regime de caixa. */
const emptyCashFlow: DashboardMonthlyCashFlowResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  costCenterCashSplit: true,
  billing: '0',
  realized: { inflows: '0', outflows: '0', result: '0' },
  expected: { receivables: '0', payables: '0', result: '0' },
  overdue: {
    receivables: '0',
    payables: '0',
    ofMonth: { receivables: '0', payables: '0' },
  },
  coverage: '0',
  realizedByCategory: {
    inflows: { total: '0', classified: '0', uncategorized: '0', imprecise: '0', coverageRate: null, items: [] },
    outflows: { total: '0', classified: '0', uncategorized: '0', imprecise: '0', coverageRate: null, items: [] },
  },
  daily: { realized: [], expected: [] },
};

const syncedOverview: DashboardOverviewResponse = {
  today: '2026-08-19',
  receivables: { open: '8.5', overdue: '3', upcoming: '5.5' },
  payables: { open: '20', overdue: '4', upcoming: '16' },
  delinquency: { overdueUnpaid: '3', openUnpaid: '8.5', rate: '35.2941' },
  integration: {
    status: 'CONNECTED',
    lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
    lastErrorCode: null,
  },
};

function section(id: string): HTMLElement {
  const node = document.querySelector(`[data-financial-section="${id}"]`);
  expect(node).toBeTruthy();
  return node as HTMLElement;
}

function sectionScope(id: string) {
  return within(section(id));
}

/** Card de KPI executivo (V2) localizado pelo título dentro da seção. */
function kpiCard(title: string, sectionId = 'resumo-financeiro') {
  const heading = sectionScope(sectionId).getByRole('heading', { name: title });
  const card = heading.closest('[data-tone]');
  expect(card).toBeTruthy();
  return card as HTMLElement;
}

function kpiScope(title: string, sectionId = 'resumo-financeiro') {
  return within(kpiCard(title, sectionId));
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

beforeEach(() => {
  dashboardSearchParams = new URLSearchParams();
  getMonthEnd.mockResolvedValue(emptyMonthEnd);
  getForecast.mockResolvedValue(emptyForecast);
  getMonthlyExpenses.mockResolvedValue(emptyMonthlyExpenses);
  getMonthlyRevenue.mockResolvedValue(emptyMonthlyRevenue);
  getMonthlyCashFlow.mockResolvedValue(cashFlowHomeFixture);
  getRevenueGoal.mockResolvedValue(emptyRevenueGoal);
  getCostCenters.mockResolvedValue({
    items: [
      {
        id: '11111111-1111-4111-8111-111111111111',
        name: 'Operações',
        code: 'OP',
        active: true,
      },
      {
        id: '22222222-2222-4222-8222-222222222222',
        name: 'Administrativo',
        code: null,
        active: false,
      },
    ],
  });
  getCategories.mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('Dashboard V2 structure', () => {
  it('resolveGreetingPrefix cobre manhã, tarde e noite', () => {
    expect(resolveGreetingPrefix(new Date('2026-08-13T08:00:00'))).toBe('Bom dia');
    expect(resolveGreetingPrefix(new Date('2026-08-13T15:00:00'))).toBe('Boa tarde');
    expect(resolveGreetingPrefix(new Date('2026-08-13T21:00:00'))).toBe('Boa noite');
  });

  it('monta a grade executiva do mês corrente sem blocos legados', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    renderDashboard();

    expect(
      await screen.findByRole('heading', { level: 1, name: 'Dashboard financeiro' }),
    ).toBeTruthy();
    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
      expect(document.querySelector('[data-cash-flow-state="ready"]')).toBeTruthy();
    });
    expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();

    for (const title of [
      'Faturamento',
      'A receber',
      'Despesas',
      'Contas a pagar',
      'Resultado',
    ]) {
      expect(kpiCard(title)).toBeTruthy();
    }
    expect(
      sectionScope('resumo-financeiro').queryByRole('heading', { name: 'Já recebido' }),
    ).toBeNull();

    for (const title of [
      'Entradas × Saídas',
      'Despesas por categoria',
      'Receitas por categoria',
      'Meta de faturamento',
      'Inadimplência',
      'Comparativo mensal',
      'Movimentação diária',
      'Fluxo previsto',
    ]) {
      expect(screen.getByRole('heading', { name: title })).toBeTruthy();
    }

    expect(screen.queryByRole('heading', { name: 'Leitura executiva' })).toBeNull();
    expect(document.querySelector('[data-home-band="executive-reading"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="leitura-executiva"]')).toBeNull();
    expect(screen.queryByText('Sinais do fluxo de caixa do mês')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir detalhe de Já recebido' })).toBeNull();

    expect(screen.queryByRole('heading', { name: 'Receitas × Despesas' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Até o fim do mês' })).toBeNull();
    expect(
      screen.queryByRole('heading', { name: 'Movimentação diária da competência' }),
    ).toBeNull();
    expect(screen.queryByText(/Competência de/i)).toBeNull();

    expect(screen.queryByText('Previsto até o fim do mês')).toBeNull();
    expect(screen.getByRole('button', { name: 'Realizado' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Previsto' })).toBeTruthy();

    expect(screen.queryByRole('heading', { name: 'Top 5 despesas' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Composição por categoria' })).toBeNull();
    expect(screen.getByText('Meta ainda não definida')).toBeTruthy();
    expect(document.querySelector('[data-financial-section="top-despesas"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="despesas-mes"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="receitas-categoria"]')).toBeTruthy();
    expect(document.querySelector('[data-financial-section="despesas-categoria"]')).toBeTruthy();
    expect(document.querySelector('[data-financial-section="entradas-saidas"]')).toBeTruthy();
    expect(document.querySelector('[data-financial-section="meta-faturamento"]')).toBeTruthy();
    expect(document.querySelector('[data-financial-section="ate-fim-do-mes"]')).toBeNull();
    expect(document.querySelector('[data-home-band="compact-kpis"]')?.getAttribute('data-cols')).toBe(
      '2',
    );
    expect(document.querySelector('[data-financial-section="comparativo-mensal"]')).toBeTruthy();
    expect(document.querySelector('[data-financial-section="movimentacao-diaria"]')).toBeTruthy();

    expect(screen.getByText('Última atualização')).toBeTruthy();
    expect(document.querySelector('[data-cost-center-selector="true"]')).toBeTruthy();
    expect(document.querySelector('[data-situation-selector]')).toBeNull();
    expect(screen.getByRole('tablist', { name: 'Centros de custo' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Todos' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Próximos vencimentos' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Recebíveis vencidos' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Qualidade dos recebíveis' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Alertas' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Pressão de caixa' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Movimentações Recentes' })).toBeNull();
    expect(screen.queryByRole('columnheader')).toBeNull();
    expect(screen.queryByText('15 dias')).toBeNull();
    expect(document.querySelector('[data-kpi-card]')).toBeNull();

    expect(getOverview).toHaveBeenCalledWith(null);
    expect(getMonthlyCashFlow).toHaveBeenCalledWith(null, null, null);
    expect(getMonthlyCashFlow).toHaveBeenCalledWith('2026-07', null, null);
  });

  it('exibe nota de meta consolidada quando centro de custo está selecionado', async () => {
    dashboardSearchParams = new URLSearchParams(
      'costCenter=11111111-1111-4111-8111-111111111111',
    );
    getOverview.mockResolvedValue(syncedOverview);
    getRevenueGoal.mockResolvedValue({
      ...emptyRevenueGoal,
      target: '10000',
      actual: '4000',
      achievementRate: '40',
      remaining: '6000',
      exceeded: '0',
      status: 'IN_PROGRESS',
    });
    renderDashboard();

    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    });
    expect(await screen.findByText('Visão executiva · Operações')).toBeTruthy();
    expect(await screen.findByText(/Meta consolidada da empresa/)).toBeTruthy();
    expect(getOverview).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(getRevenueGoal).toHaveBeenCalledWith(null);
  });

  it('propaga category aos widgets mensais e preserva meta consolidada', async () => {
    const categoryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const centerId = '11111111-1111-4111-8111-111111111111';
    dashboardSearchParams = new URLSearchParams(
      `costCenter=${centerId}&situation=settled&category=${categoryId}`,
    );
    getOverview.mockResolvedValue(syncedOverview);
    getCategories.mockResolvedValue({
      items: [{ id: categoryId, name: 'Serviços', type: 'REVENUE' }],
    });
    getRevenueGoal.mockResolvedValue({
      ...emptyRevenueGoal,
      target: '10000',
      actual: '4000',
      achievementRate: '40',
      remaining: '6000',
      exceeded: '0',
      status: 'IN_PROGRESS',
    });
    renderDashboard();

    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-situation-selector]')).toBeNull();
    expect(screen.getByRole('button', { name: /Categoria: Serviços/ })).toBeTruthy();
    expect(await screen.findByText(/Meta consolidada da empresa/)).toBeTruthy();
    expect(getMonthlyCashFlow).toHaveBeenCalledWith(null, centerId, categoryId);
    expect(getMonthlyCashFlow).toHaveBeenCalledWith('2026-07', centerId, categoryId);
    expect(getForecast).toHaveBeenCalledWith(centerId, categoryId);
    expect(getMonthEnd).not.toHaveBeenCalled();
    expect(getOverview).toHaveBeenCalledWith(centerId);
    expect(getRevenueGoal).toHaveBeenCalledWith(null);
    expect(getForecast.mock.calls.every((call) => call.length === 2)).toBe(true);
  });

  it('nota de meta consolidada aparece com categoria selecionada', async () => {
    const categoryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    dashboardSearchParams = new URLSearchParams(`category=${categoryId}`);
    getOverview.mockResolvedValue(syncedOverview);
    getCategories.mockResolvedValue({
      items: [{ id: categoryId, name: 'Serviços', type: 'REVENUE' }],
    });
    getRevenueGoal.mockResolvedValue({
      ...emptyRevenueGoal,
      target: '10000',
      actual: '4000',
      achievementRate: '40',
      remaining: '6000',
      exceeded: '0',
      status: 'IN_PROGRESS',
    });
    renderDashboard();
    expect(await screen.findByText(/Meta consolidada da empresa/)).toBeTruthy();
    expect(getRevenueGoal).toHaveBeenCalledWith(null);
    expect(getMonthlyCashFlow).toHaveBeenCalledWith(null, null, categoryId);
  });

  it('sem caixa no mês os KPIs ficam vazios com copy honesta', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    getMonthlyCashFlow.mockResolvedValue(emptyCashFlow);
    renderDashboard();

    await waitFor(() => {
      expect(kpiCard('Faturamento').dataset.state).toBe('empty');
    });
    expect(kpiScope('Faturamento').getByText('Sem faturamento de caixa no mês')).toBeTruthy();
    expect(kpiScope('A receber').getByText('Sem valores a receber no prazo')).toBeTruthy();
    expect(kpiScope('Despesas').getByText('Sem despesas de caixa no mês')).toBeTruthy();
    expect(kpiScope('Resultado').getByText('Sem resultado de caixa no mês')).toBeTruthy();
    expect(sectionScope('inadimplencia').getByText('Taxa global (D1)')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Leitura executiva' })).toBeNull();
    expect(document.querySelector('[data-home-band="executive-reading"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="despesas-mes"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="receitas-categoria"]')).toBeTruthy();
    expect(
      sectionScope('fluxo-previsto').getByText('Sem lançamentos previstos no horizonte.'),
    ).toBeTruthy();
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
    expect(
      screen.getAllByText('Aguardando a primeira sincronização').length,
    ).toBeGreaterThanOrEqual(4);
    expect(screen.queryByText(/R\$\s*0,00/)).toBeNull();
    expect(getMonthEnd).not.toHaveBeenCalled();
    expect(getForecast).not.toHaveBeenCalled();
    expect(getMonthlyExpenses).not.toHaveBeenCalled();
    expect(getMonthlyRevenue).not.toHaveBeenCalled();
  });

  it('rate zero exato aparece como 0%', async () => {
    getOverview.mockResolvedValue({
      ...syncedOverview,
      delinquency: { overdueUnpaid: '0', openUnpaid: '10', rate: '0' },
    });
    renderDashboard();

    await waitFor(() => {
      expect(sectionScope('inadimplencia').getByText('0%')).toBeTruthy();
    });
  });

  it('DISCONNECTED com dados mantém widgets e mantém o aviso fora deles', async () => {
    getOverview.mockResolvedValue({
      ...syncedOverview,
      integration: {
        status: 'DISCONNECTED',
        lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
        lastErrorCode: null,
      },
    });
    renderDashboard();

    expect(
      await screen.findByText('Integração desconectada. Exibindo os últimos dados sincronizados.'),
    ).toBeTruthy();
    expect(await screen.findByRole('heading', { name: 'Meta de faturamento' })).toBeTruthy();
    await waitFor(() => {
      expect(sectionScope('inadimplencia').getByText('Taxa global (D1)')).toBeTruthy();
    });
    for (const id of ['entradas-saidas', 'meta-faturamento', 'inadimplencia']) {
      expect(sectionScope(id).queryByText(/Integração desconectada/)).toBeNull();
    }
    expect(getMonthEnd).not.toHaveBeenCalled();
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

    expect(
      await screen.findByText(
        'Não foi possível atualizar a integração. Exibindo os últimos dados sincronizados.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText('refresh_failed')).toBeNull();
    await waitFor(() => {
      expect(sectionScope('inadimplencia').getByText('Taxa global (D1)')).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Tentar novamente' })).toBeNull();
    expect(getMonthEnd).not.toHaveBeenCalled();
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
    expect(
      screen.getAllByText('Disponível junto com os indicadores da empresa.').length,
    ).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => {
      expect(kpiCard('Faturamento')).toBeTruthy();
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
    expect(getMonthEnd).not.toHaveBeenCalled();
    expect(getForecast).not.toHaveBeenCalled();
    expect(getMonthlyExpenses).not.toHaveBeenCalled();
    expect(getMonthlyRevenue).not.toHaveBeenCalled();
  });

  it('mês passado oculta Fluxo previsto', async () => {
    dashboardSearchParams = new URLSearchParams('month=2026-07');
    getOverview.mockResolvedValue(syncedOverview);
    renderDashboard();

    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalledWith('2026-07', null, null);
    });
    expect(document.querySelector('[data-financial-section="ate-fim-do-mes"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="fluxo-previsto"]')).toBeNull();
    expect(getMonthEnd).not.toHaveBeenCalled();
    expect(getForecast).not.toHaveBeenCalled();
    expect(getMonthlyCashFlow).toHaveBeenCalledWith('2026-07', null, null);
    expect(getMonthlyCashFlow).toHaveBeenCalledWith('2026-06', null, null);
    expect(screen.queryByRole('heading', { name: 'Leitura executiva' })).toBeNull();
    expect(document.querySelector('[data-home-band="executive-reading"]')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Meta de faturamento' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Inadimplência' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Comparativo mensal' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Receitas × Despesas' })).toBeNull();
    expect(document.querySelector('[data-financial-section="comparativo-mensal"]')).toBeTruthy();
    expect(document.querySelector('[data-home-band="compact-kpis"]')?.getAttribute('data-cols')).toBe(
      '2',
    );
  });

  it('fluxo previsto usa o líquido do backend e resume os picos do horizonte', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    getForecast.mockResolvedValue({
      ...emptyForecast,
      buckets: [
        { key: '2026-08', inflows: '10', outflows: '4', net: '6' },
        { key: '2026-09', inflows: '0', outflows: '0', net: '0' },
      ],
    });
    renderDashboard();

    const scope = await waitFor(() => {
      const node = sectionScope('fluxo-previsto');
      expect(node.getAllByText('ago/2026').length).toBeGreaterThan(0);
      return node;
    });
    expect(scope.getAllByText('set/2026').length).toBeGreaterThan(0);
    expect(scope.getAllByText(/R\$\s*6,00/).length).toBeGreaterThan(0);
    expect(scope.getByText('Meses previstos')).toBeTruthy();
    expect(scope.getByText('Maior entrada prevista')).toBeTruthy();
    expect(scope.getByText('Maior saída prevista')).toBeTruthy();
    expect(
      scope.getByText(
        'O líquido é a diferença prevista de cada mês e não o saldo bancário acumulado.',
      ),
    ).toBeTruthy();
    expect(screen.queryByText(/saldo projetado/i)).toBeNull();
  });

  it('KPIs de caixa usam MonthlyCashFlow e não totais de competência', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    renderDashboard();

    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();
    });
    expect(kpiScope('Contas a pagar').getByText(/R\$\s*22\.222,22/)).toBeTruthy();
    expect(kpiScope('Resultado').getByText(/R\$\s*866\.666,66/)).toBeTruthy();
    expect(kpiScope('Faturamento').getByText('Recebido')).toBeTruthy();
    expect(kpiScope('Faturamento').getByText('A receber')).toBeTruthy();
    expect(
      sectionScope('resumo-financeiro').queryByRole('heading', { name: 'Já recebido' }),
    ).toBeNull();
    expect(kpiScope('Faturamento').queryByText(/R\$\s*10\.000,00/)).toBeNull();
    expect(document.querySelector('[data-financial-section="receitas-mes"]')).toBeNull();
  });

  it('erro de cash-flow não derruba KPIs nem o fluxo previsto', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    getMonthlyCashFlow.mockRejectedValue(
      new DashboardMonthlyCashFlowRequestError(
        'unavailable',
        'Não foi possível carregar o fluxo de caixa do mês.',
      ),
    );
    renderDashboard();

    await waitFor(() => {
      expect(
        screen.getAllByText('Não foi possível carregar o fluxo de caixa do mês.').length,
      ).toBeGreaterThan(0);
    });
    expect(screen.getByRole('heading', { name: 'Fluxo previsto' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Entradas × Saídas' })).toBeTruthy();
  });

  it('Leitura executiva e banda executive-reading estão ausentes da Home', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    renderDashboard();

    await waitFor(() => {
      expect(document.querySelector('[data-cash-flow-state="ready"]')).toBeTruthy();
    });
    expect(screen.queryByRole('heading', { name: 'Leitura executiva' })).toBeNull();
    expect(document.querySelector('[data-home-band="executive-reading"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="leitura-executiva"]')).toBeNull();
    expect(screen.queryByText('Sinais do fluxo de caixa do mês')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir detalhe de Já recebido' })).toBeNull();
    expect(kpiScope('Faturamento').getByText('Recebido')).toBeTruthy();
    expect(kpiScope('Faturamento').getByText('A receber')).toBeTruthy();
  });

  it('erro de cash-flow não derruba os demais widgets', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    getMonthlyCashFlow.mockRejectedValue(
      new DashboardMonthlyCashFlowRequestError(
        'unavailable',
        'Não foi possível carregar o fluxo de caixa do mês.',
      ),
    );
    renderDashboard();

    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/Não foi possível carregar o fluxo de caixa/)).toBeTruthy();
    });
    expect(
      (await screen.findAllByText('Não foi possível carregar o fluxo de caixa do mês.')).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('heading', { name: 'Fluxo previsto' })).toBeTruthy();
  });

  it('Inadimplência mostra vencido agora e taxa global D1', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    renderDashboard();

    const scope = await waitFor(() => {
      const node = sectionScope('inadimplencia');
      expect(node.getByText('Vencido agora')).toBeTruthy();
      return node;
    });
    expect(scope.getByText(/R\$\s*1,00/)).toBeTruthy();
    expect(scope.getByText('Taxa global (D1)')).toBeTruthy();
    expect(scope.getByText('35,3%')).toBeTruthy();
    expect(document.querySelector('[data-financial-section="qualidade-recebiveis"]')).toBeNull();
  });

  it('KPI de faturamento expande na Home CASH (PRE-F13-HOME-POLISH)', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    renderDashboard();

    await waitFor(() => {
      expect(kpiScope('Faturamento').getByRole('button', { name: 'Expandir' })).toBeTruthy();
    });
  });

  it('exibe régua de competência sem refetch dos demais blocos ao carregar', async () => {
    getOverview.mockResolvedValue(syncedOverview);
    renderDashboard();

    expect(await screen.findByLabelText('Visão mensal por competência')).toBeTruthy();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalledWith(null, null, null);
    });
    expect(getOverview).toHaveBeenCalledTimes(1);
    expect(getMonthEnd).not.toHaveBeenCalled();
    expect(getForecast).toHaveBeenCalledTimes(1);
    expect(getMonthlyCashFlow).toHaveBeenCalledWith('2026-07', null, null);
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
