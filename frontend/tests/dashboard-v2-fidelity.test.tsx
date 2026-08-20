import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import type { DashboardMonthEndCashPressureResponse } from '../src/services/dashboard/month-end-cash-pressure.types';
import { getDashboardCashFlowForecast } from '../src/services/dashboard/forecast';
import type { DashboardCashFlowForecastResponse } from '../src/services/dashboard/forecast.types';
import { getDashboardMonthlyRevenue } from '../src/services/dashboard/monthly-revenue';
import type { DashboardMonthlyRevenueResponse } from '../src/services/dashboard/monthly-revenue.types';
import { getDashboardMonthlyExpenses } from '../src/services/dashboard/monthly-expenses';
import type { DashboardMonthlyExpenseResponse } from '../src/services/dashboard/monthly-expenses.types';
import { getDashboardExecutiveInsights } from '../src/services/dashboard/executive-insights';
import type { DashboardExecutiveInsightsResponse } from '../src/services/dashboard/executive-insights.types';
import { ThemeProvider } from '../src/theme';
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

vi.mock('../src/services/dashboard/executive-insights', () => ({
  getDashboardExecutiveInsights: vi.fn(),
}));

const getOverview = vi.mocked(getDashboardOverview);
const getMonthEnd = vi.mocked(getDashboardMonthEndCashPressure);
const getForecast = vi.mocked(getDashboardCashFlowForecast);
const getMonthlyExpenses = vi.mocked(getDashboardMonthlyExpenses);
const getMonthlyRevenue = vi.mocked(getDashboardMonthlyRevenue);
const getInsights = vi.mocked(getDashboardExecutiveInsights);

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

const monthEnd: DashboardMonthEndCashPressureResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-19',
  to: '2026-08-31',
  summary: { receivable: '8.5', payable: '4', net: '4.5' },
};

const forecast: DashboardCashFlowForecastResponse = {
  today: '2026-08-19',
  from: '2026-08-19',
  to: '2026-11-17',
  horizonDays: 90,
  buckets: [
    { key: '2026-08', inflows: '10', outflows: '4', net: '6' },
    { key: '2026-09', inflows: '0', outflows: '0', net: '0' },
  ],
};

const loadedRevenue: DashboardMonthlyRevenueResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  receivables: {
    total: '10000',
    received: '4000',
    outstanding: '6000',
    overdue: '3000',
    classified: '10000',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: '100',
    items: [
      {
        kind: 'category',
        name: 'Serviços',
        amount: '7000',
        received: '4000',
        outstanding: '3000',
        percentage: '70',
      },
      {
        kind: 'category',
        name: 'Produtos',
        amount: '3000',
        received: '0',
        outstanding: '3000',
        percentage: '30',
      },
    ],
    daily: [
      { date: '2026-08-05', amount: '4000', received: '4000', outstanding: '0' },
      { date: '2026-08-12', amount: '6000', received: '0', outstanding: '6000' },
    ],
  },
};

const loadedExpenses: DashboardMonthlyExpenseResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  payables: {
    total: '100',
    paid: '20',
    outstanding: '80',
    overdue: '0',
    classified: '80',
    uncategorized: '20',
    imprecise: '0',
    coverageRate: '80',
    items: [
      {
        kind: 'category',
        name: 'Salários',
        amount: '80',
        paid: '0',
        outstanding: '80',
        percentage: '80',
      },
      {
        kind: 'uncategorized',
        name: 'Sem categoria',
        amount: '20',
        paid: '20',
        outstanding: '0',
        percentage: '20',
      },
    ],
    daily: [
      { date: '2026-08-03', amount: '20', received: '20', outstanding: '0' },
      { date: '2026-08-18', amount: '80', received: '0', outstanding: '80' },
    ],
  },
};

const insights: DashboardExecutiveInsightsResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  insights: [
    {
      id: 'revenue-expense-total',
      body: 'Agosto de 2026 gerou R$ 10.000,00 em receitas de competência.',
    },
  ],
};

/** Card do widget pela âncora analítica (`data-financial-section`). */
function widget(sectionId: string): HTMLElement {
  const node = document.querySelector(`[data-financial-section="${sectionId}"]`);
  expect(node).toBeTruthy();
  return node as HTMLElement;
}

function widgetScope(sectionId: string) {
  return within(widget(sectionId));
}

function renderDashboard() {
  return renderWithAuth(
    <ThemeProvider>
      <DashboardPage />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(mockAuthenticatedUser),
      hydrateOnMount: true,
    },
  );
}

/** Aguarda a competência selecionada e a anterior estarem carregadas. */
async function renderReadyDashboard() {
  renderDashboard();
  await waitFor(() => {
    expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
  });
  await waitFor(() => {
    expect(getMonthlyRevenue).toHaveBeenCalledTimes(2);
    expect(getMonthlyExpenses).toHaveBeenCalledTimes(2);
  });
}

beforeEach(() => {
  dashboardSearchParams = new URLSearchParams();
  getOverview.mockResolvedValue(syncedOverview);
  getMonthEnd.mockResolvedValue(monthEnd);
  getForecast.mockResolvedValue(forecast);
  getMonthlyExpenses.mockResolvedValue(loadedExpenses);
  getMonthlyRevenue.mockResolvedValue(loadedRevenue);
  getInsights.mockResolvedValue(insights);
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  document.body.style.overflow = '';
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('style');
});

describe('Dashboard V2.3 fidelidade', () => {
  it('cabeçalho da página anuncia a Dashboard financeira, não uma saudação', async () => {
    renderDashboard();

    const title = await screen.findByRole('heading', {
      level: 1,
      name: 'Dashboard financeiro',
    });
    expect(title).toBeTruthy();
    expect(screen.getByText('Visão executiva · Competência selecionada')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: /(bom dia|boa tarde|boa noite)/i })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Resumo Financeiro' })).toBeNull();
  });

  it('seletor de mês é compacto e abre os doze meses do ano', async () => {
    await renderReadyDashboard();

    const selector = screen.getByLabelText('Visão mensal por competência');
    const scope = within(selector);
    const trigger = scope.getByRole('button', { name: 'AGO 2026' });
    expect(scope.getByRole('button', { name: 'Mês anterior' })).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Próximo mês' })).toBeTruthy();
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(scope.queryByRole('group', { name: 'Meses de 2026' })).toBeNull();

    fireEvent.click(trigger);

    const grid = scope.getByRole('group', { name: 'Meses de 2026' });
    expect(within(grid).getAllByRole('button')).toHaveLength(12);
    expect(within(grid).getByRole('button', { name: 'ago 2026, Atual' })).toBeTruthy();
    expect(within(grid).getByRole('button', { name: 'jul 2026, Competência' })).toBeTruthy();
    expect(within(grid).getByRole('button', { name: 'set 2026, Previsto' })).toBeTruthy();
  });

  it('cada widget carrega o próprio título dentro do card', async () => {
    await renderReadyDashboard();

    const widgets: readonly (readonly [string, string])[] = [
      ['receitas-mes', 'Receitas × Despesas'],
      ['despesas-mes', 'Despesas por categoria'],
      ['receitas-categoria', 'Receitas por categoria'],
      ['meta-faturamento', 'Meta de faturamento'],
      ['ate-fim-do-mes', 'Até o fim do mês'],
      ['leitura-executiva', 'Leitura executiva'],
      ['inadimplencia', 'Inadimplência'],
      ['comparativo-mensal', 'Comparativo mensal'],
      ['movimentacao-diaria', 'Movimentação diária da competência'],
      ['fluxo-previsto', 'Fluxo previsto'],
    ];

    for (const [sectionId, title] of widgets) {
      const card = widget(sectionId);
      expect(card.tagName).toBe('ARTICLE');
      expect(within(card).getByRole('heading', { level: 3, name: title })).toBeTruthy();
    }

    expect(screen.queryByRole('heading', { name: 'Top 5 despesas' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Composição por categoria' })).toBeNull();
    expect(document.querySelector('[data-financial-section="top-despesas"]')).toBeNull();
  });

  it('clique no card expansível abre o detalhe da competência', async () => {
    await renderReadyDashboard();

    const card = await waitFor(() => {
      const node = widget('receitas-mes');
      expect(node.getAttribute('role')).toBe('button');
      return node;
    });
    fireEvent.click(card);

    const dialog = await screen.findByRole('dialog');
    const dialogScope = within(dialog);
    expect(dialogScope.getByRole('heading', { name: 'Receitas × Despesas' })).toBeTruthy();
    expect(dialogScope.getByText('Competência de ago/2026')).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('Despesas e Receitas por categoria são widgets independentes', async () => {
    await renderReadyDashboard();

    const expenses = widgetScope('despesas-mes');
    const revenues = widgetScope('receitas-categoria');

    expect(
      expenses.getByRole('img', { name: 'Despesas por categoria do mês selecionado' }),
    ).toBeTruthy();
    expect(expenses.getByText('Salários')).toBeTruthy();
    expect(
      expenses.queryByRole('img', { name: 'Receitas por categoria do mês selecionado' }),
    ).toBeNull();

    expect(
      revenues.getByRole('img', { name: 'Receitas por categoria do mês selecionado' }),
    ).toBeTruthy();
    expect(revenues.getByText('Serviços')).toBeTruthy();
    expect(
      revenues.queryByRole('img', { name: 'Despesas por categoria do mês selecionado' }),
    ).toBeNull();

    expect(screen.queryByRole('button', { name: 'Abrir receitas por categoria' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir despesas por categoria' })).toBeNull();
    expect(screen.queryByRole('group', { name: 'Lado da composição por categoria' })).toBeNull();
  });

  it('clique na raiz do card de despesas abre o ranking completo', async () => {
    await renderReadyDashboard();

    const card = await waitFor(() => {
      const node = widget('despesas-mes');
      expect(node.getAttribute('role')).toBe('button');
      return node;
    });
    fireEvent.click(card);

    const dialog = await screen.findByRole('dialog');
    const dialogScope = within(dialog);
    expect(dialogScope.getByRole('heading', { name: 'Despesas por categoria' })).toBeTruthy();
    expect(
      dialogScope.getByRole('img', {
        name: 'Todas as despesas por categoria do mês selecionado',
      }),
    ).toBeTruthy();
    expect(dialogScope.getAllByText('Salários').length).toBeGreaterThan(0);
    expect(dialogScope.getAllByText('Sem categoria').length).toBeGreaterThan(0);

    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('clique e Enter no card de receitas abrem o detalhe de receitas', async () => {
    await renderReadyDashboard();

    const card = await waitFor(() => {
      const node = widget('receitas-categoria');
      expect(node.getAttribute('role')).toBe('button');
      return node;
    });
    fireEvent.click(card);

    let dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Receitas por categoria' })).toBeTruthy();
    expect(
      within(dialog).getByRole('img', {
        name: 'Todas as receitas por categoria do mês selecionado',
      }),
    ).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.keyDown(card, { key: 'Enter' });
    dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Receitas por categoria' })).toBeTruthy();
  });

  it('Meta de faturamento aparece com empty state comercial limpo', async () => {
    await renderReadyDashboard();

    const scope = widgetScope('meta-faturamento');
    expect(scope.getByRole('heading', { level: 3, name: 'Meta de faturamento' })).toBeTruthy();
    expect(scope.getByText('Meta ainda não definida')).toBeTruthy();
    expect(
      scope.getByText('Defina uma meta mensal para acompanhar o desempenho do faturamento.'),
    ).toBeTruthy();
    expect(scope.queryByText(/configuração|disponível|API|persistência|IA|histórico/i)).toBeNull();
    expect(scope.queryByRole('button', { name: /definir meta/i })).toBeNull();
    expect(document.querySelector('[data-revenue-goal="unconfigured"]')).toBeTruthy();
  });

  it('os cinco KPIs executivos têm microvisualização diária', async () => {
    await renderReadyDashboard();

    const scope = widgetScope('resumo-financeiro');
    for (const name of [
      'Faturamento — série diária por competência',
      'Valor atualmente recebido dos títulos com competência neste dia',
      'Valor ainda em aberto dos títulos com competência neste dia',
      'Despesas — série diária por competência',
      'Resultado gerencial da competência no dia',
    ]) {
      expect(scope.getByRole('img', { name })).toBeTruthy();
    }
    expect(scope.queryByRole('img', { name: /recebido neste dia/i })).toBeNull();
  });

  it('rodapés dos KPIs abrem o total da competência sem prometer caixa', async () => {
    await renderReadyDashboard();

    const billing = within(
      widgetScope('resumo-financeiro')
        .getByRole('heading', { name: 'Faturamento' })
        .closest('[data-tone]') as HTMLElement,
    );
    expect(billing.getByText('Recebido')).toBeTruthy();
    expect(billing.getByText('A receber')).toBeTruthy();

    const expenses = within(
      widgetScope('resumo-financeiro')
        .getByRole('heading', { name: 'Despesas' })
        .closest('[data-tone]') as HTMLElement,
    );
    expect(expenses.getByText('Pago')).toBeTruthy();
    expect(expenses.getByText('A pagar')).toBeTruthy();

    const result = within(
      widgetScope('resumo-financeiro')
        .getByRole('heading', { name: 'Resultado gerencial' })
        .closest('[data-tone]') as HTMLElement,
    );
    // 9.900,00 sobre 10.000,00 de receitas na competência.
    expect(result.getByText('Margem')).toBeTruthy();
    expect(result.getByText('99,0%')).toBeTruthy();
  });

  it('freshness é uma pílula ao lado do seletor de competência', async () => {
    await renderReadyDashboard();

    const cluster = document.querySelector('[data-v2-section="competencia"]');
    expect(cluster).toBeTruthy();
    const scope = within(cluster as HTMLElement);
    expect(scope.getByLabelText('Visão mensal por competência')).toBeTruthy();
    expect(scope.getByText('Última atualização')).toBeTruthy();
    const time = (cluster as HTMLElement).querySelector('time');
    expect(time?.getAttribute('datetime')).toBe('2026-08-10T09:00:00.000Z');
  });

  it('comparativo mensal compara a competência selecionada com a anterior', async () => {
    await renderReadyDashboard();

    const scope = await waitFor(() => {
      const node = widgetScope('comparativo-mensal');
      expect(node.getByText('Faturamento')).toBeTruthy();
      return node;
    });
    expect(scope.getByText('AGO × JUL')).toBeTruthy();
    expect(scope.getByText('Despesas')).toBeTruthy();
    expect(scope.getByText('Resultado gerencial')).toBeTruthy();
    expect(scope.getAllByText('AGO').length).toBe(3);
    expect(scope.getAllByText('JUL').length).toBe(3);
    expect(
      scope.getByText('Comparação entre competências; a variação não representa movimento de caixa.'),
    ).toBeTruthy();
    expect(getMonthlyRevenue).toHaveBeenCalledWith(null);
    expect(getMonthlyRevenue).toHaveBeenCalledWith('2026-07');
    expect(getMonthlyExpenses).toHaveBeenCalledWith('2026-07');
  });

  it('movimentação diária da competência declara que não é caixa', async () => {
    await renderReadyDashboard();

    const scope = await waitFor(() => {
      const node = widgetScope('movimentacao-diaria');
      expect(
        node.getByRole('img', { name: 'Receitas e despesas por dia de competência em ago/2026' }),
      ).toBeTruthy();
      return node;
    });
    expect(scope.getByText('Competência · não é caixa')).toBeTruthy();
    expect(scope.getByText('Competência · não é caixa.')).toBeTruthy();
  });

  it('não há bloco de próximos vencimentos nem régua de dias', async () => {
    await renderReadyDashboard();

    expect(screen.queryByRole('heading', { name: 'Próximos vencimentos' })).toBeNull();
    expect(document.querySelector('[data-financial-section="proximos-vencimentos"]')).toBeNull();
    for (const chip of ['7 dias', '15 dias', '30 dias', '60 dias']) {
      expect(screen.queryByText(chip)).toBeNull();
    }
    expect(screen.queryByRole('columnheader')).toBeNull();
  });

  it('mês passado esconde fluxo previsto e fim do mês, mas mantém o comparativo', async () => {
    dashboardSearchParams = new URLSearchParams('month=2026-07');
    renderDashboard();

    await waitFor(() => {
      expect(getMonthlyRevenue).toHaveBeenCalledWith('2026-07');
      expect(getMonthlyRevenue).toHaveBeenCalledWith('2026-06');
    });
    expect(getMonthlyExpenses).toHaveBeenCalledWith('2026-06');
    expect(getMonthEnd).not.toHaveBeenCalled();
    expect(getForecast).not.toHaveBeenCalled();
    expect(document.querySelector('[data-financial-section="ate-fim-do-mes"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="fluxo-previsto"]')).toBeNull();
    expect(widget('comparativo-mensal')).toBeTruthy();
    expect(widgetScope('comparativo-mensal').getByText('JUL × JUN')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'JUL 2026' })).toBeTruthy();
  });
});
