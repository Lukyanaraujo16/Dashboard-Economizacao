import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import type { DashboardMonthEndCashPressureResponse } from '../src/services/dashboard/month-end-cash-pressure.types';
import { getDashboardCashFlowForecast } from '../src/services/dashboard/forecast';
import type { DashboardCashFlowForecastResponse } from '../src/services/dashboard/forecast.types';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import type { DashboardMonthlyCashFlowResponse } from '../src/services/dashboard/monthly-cash-flow.types';
import { getDashboardRevenueGoal } from '../src/services/dashboard/revenue-goal';
import type { RevenueGoalSnapshot } from '../src/services/dashboard/revenue-goal.types';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import { ThemeProvider } from '../src/theme';
import {
  cashFlowHomeFixture,
  emptyCashCategoryComposition,
  singleCashCategoryComposition,
} from './helpers/monthly-cash-flow-fixture';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

let dashboardSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/',
  useSearchParams: () => dashboardSearchParams,
}));

vi.mock('../src/services/dashboard/overview', () => ({ getDashboardOverview: vi.fn() }));
vi.mock('../src/services/dashboard/month-end-cash-pressure', () => ({
  getDashboardMonthEndCashPressure: vi.fn(),
}));
vi.mock('../src/services/dashboard/forecast', () => ({ getDashboardCashFlowForecast: vi.fn() }));
vi.mock('../src/services/dashboard/monthly-cash-flow', () => ({
  getDashboardMonthlyCashFlow: vi.fn(),
}));
vi.mock('../src/services/dashboard/revenue-goal', () => ({
  getDashboardRevenueGoal: vi.fn(),
  putDashboardRevenueGoal: vi.fn(),
}));
vi.mock('../src/services/dashboard/cost-centers', () => ({ getDashboardCostCenters: vi.fn() }));
vi.mock('../src/services/dashboard/categories', () => ({ getDashboardCategories: vi.fn() }));

const getOverview = vi.mocked(getDashboardOverview);
const getMonthEnd = vi.mocked(getDashboardMonthEndCashPressure);
const getForecast = vi.mocked(getDashboardCashFlowForecast);
const getMonthlyCashFlow = vi.mocked(getDashboardMonthlyCashFlow);
const getRevenueGoal = vi.mocked(getDashboardRevenueGoal);
const getCostCenters = vi.mocked(getDashboardCostCenters);
const getCategories = vi.mocked(getDashboardCategories);

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

const previousMonthCashFlow: DashboardMonthlyCashFlowResponse = {
  ...cashFlowHomeFixture,
  monthKey: '2026-07',
  billing: '500000.00',
  realized: { inflows: '400000.00', outflows: '100000.00', result: '300000.00' },
  expected: { receivables: '0', payables: '0', result: '0' },
  overdue: {
    receivables: '0',
    payables: '0',
    ofMonth: { receivables: '0', payables: '0' },
  },
  realizedByCategory: {
    inflows: emptyCashCategoryComposition('0'),
    outflows: emptyCashCategoryComposition('0'),
  },
  daily: {
    realized: [
      { date: '2026-07-10', inflows: '400000.00', outflows: '100000.00', result: '300000.00' },
    ],
    expected: [],
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
  buckets: [{ key: '2026-08', inflows: '0', outflows: '0', net: '0' }],
};

const goal: RevenueGoalSnapshot = {
  monthKey: '2026-08',
  target: '1000000',
  actual: '999999.99',
  achievementRate: '99.999999',
  remaining: '0.01',
  exceeded: null,
  status: 'IN_PROGRESS',
  history: [],
};

function section(id: string): HTMLElement {
  const node = document.querySelector(`[data-financial-section="${id}"]`);
  expect(node).toBeTruthy();
  return node as HTMLElement;
}

function kpiScope(title: string) {
  const heading = within(section('resumo-financeiro')).getByRole('heading', { name: title });
  const card = heading.closest('[data-tone]');
  expect(card).toBeTruthy();
  return within(card as HTMLElement);
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

async function openKpiExpand(title: string) {
  renderDashboard();
  const scope = await waitFor(() => {
    const card = kpiScope(title);
    expect(card.getByRole('button', { name: 'Expandir' })).toBeTruthy();
    return card;
  });
  fireEvent.click(scope.getByRole('button', { name: 'Expandir' }));
  return screen.findByRole('dialog');
}

async function openSectionExpand(sectionId: string) {
  renderDashboard();
  const scope = await waitFor(() => {
    const node = within(section(sectionId));
    expect(node.getByRole('button', { name: 'Expandir' })).toBeTruthy();
    return node;
  });
  fireEvent.click(scope.getByRole('button', { name: 'Expandir' }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  dashboardSearchParams = new URLSearchParams();
  getOverview.mockResolvedValue(syncedOverview);
  getMonthEnd.mockResolvedValue(monthEnd);
  getForecast.mockResolvedValue(forecast);
  getMonthlyCashFlow.mockImplementation(async (month) =>
    month === '2026-07' ? previousMonthCashFlow : cashFlowHomeFixture,
  );
  getRevenueGoal.mockResolvedValue(goal);
  getCostCenters.mockResolvedValue({ items: [] });
  getCategories.mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('PRE-F13-HOME-POLISH-1 — expansão Home caixa', () => {
  it('Z1/Z2/Z3 — Faturamento abre modal com billing CASH', async () => {
    const dialog = await openKpiExpand('Faturamento');
    expect(within(dialog).getByRole('heading', { name: 'Faturamento' })).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*999\.999,99/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Entradas realizadas')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*888\.888,88/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('A receber')).toBeTruthy();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z4/Z5 — Já recebido abre com daily.realized.inflows', async () => {
    const dialog = await openKpiExpand('Já recebido');
    expect(within(dialog).getByRole('heading', { name: 'Já recebido' })).toBeTruthy();
    expect(within(dialog).getByText('Total recebido')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*888\.888,88/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/dia de baixa/i)).toBeTruthy();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z6/Z7/Z8 — A receber abre com previsto; vencido fora', async () => {
    const dialog = await openKpiExpand('A receber');
    expect(within(dialog).getByRole('heading', { name: 'A receber' })).toBeTruthy();
    expect(within(dialog).getByText('Total a receber')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*111\.111,11/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText(/não entram neste total/i)).toBeTruthy();
    expect(within(dialog).queryByText(/R\$\s*1,00/)).toBeNull();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z9/Z10 — Despesas abre com Pago e A pagar', async () => {
    const dialog = await openKpiExpand('Despesas');
    expect(within(dialog).getByRole('heading', { name: 'Despesas' })).toBeTruthy();
    expect(within(dialog).getByText('Pago')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*111\.111,11/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('A pagar')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*22\.222,22/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z11/Z12 — Resultado abre com managerialResult', async () => {
    const dialog = await openKpiExpand('Resultado');
    expect(within(dialog).getByRole('heading', { name: 'Resultado' })).toBeTruthy();
    expect(within(dialog).getByText('Resultado projetado')).toBeTruthy();
    // billing 999999.99 − monthlyExpenses (111111.11+22222.22) = 866666.66
    expect(within(dialog).getAllByText(/R\$\s*866\.666,66/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Resultado realizado')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*777\.777,77/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z13/Z14 — Entradas × Saídas abre com realized', async () => {
    const dialog = await openSectionExpand('entradas-saidas');
    expect(within(dialog).getByRole('heading', { name: 'Entradas × Saídas' })).toBeTruthy();
    expect(within(dialog).getByText('Entradas realizadas')).toBeTruthy();
    expect(within(dialog).getByText('Saídas realizadas')).toBeTruthy();
    expect(within(dialog).getByText(/realizadas no mês/i)).toBeTruthy();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z15/Z16 — donut receitas abre e fecha com realized.inflows', async () => {
    const dialog = await openSectionExpand('receitas-categoria');
    expect(within(dialog).getByRole('heading', { name: 'Receitas por categoria' })).toBeTruthy();
    expect(within(dialog).getByText('Total realizado')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*888\.888,88/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Serviços').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z17/Z18 — donut despesas abre e fecha com realized.outflows', async () => {
    const dialog = await openSectionExpand('despesas-categoria');
    expect(within(dialog).getByRole('heading', { name: 'Despesas por categoria' })).toBeTruthy();
    expect(within(dialog).getByText('Total realizado')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*111\.111,11/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Salários').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z19/Z20 — transferências e competência ausentes nos modais CASH', async () => {
    const dialog = await openKpiExpand('Faturamento');
    expect(within(dialog).queryByText(/transferência/i)).toBeNull();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
    expect(within(dialog).queryByText(/monthly-revenue/i)).toBeNull();
  });

  it('Z21 — Meta continua abrindo', async () => {
    const dialog = await openSectionExpand('meta-faturamento');
    expect(within(dialog).getByRole('heading', { name: 'Meta de faturamento' })).toBeTruthy();
    expect(within(dialog).getByText('Realizado')).toBeTruthy();
  });

  it('Z22 — Comparativo continua abrindo', async () => {
    const dialog = await openSectionExpand('comparativo-mensal');
    expect(within(dialog).getByRole('heading', { name: 'Comparativo mensal' })).toBeTruthy();
    expect(within(dialog).getByText('Entradas realizadas')).toBeTruthy();
  });

  it('Z23 — Movimentação continua abrindo', async () => {
    const dialog = await openSectionExpand('movimentacao-diaria');
    expect(within(dialog).getByRole('heading', { name: 'Movimentação diária' })).toBeTruthy();
    expect(within(dialog).getAllByText(/dia de baixa/i).length).toBeGreaterThan(0);
  });

  it('Z24/Z25 — Escape e botão fechar encerram o modal', async () => {
    const dialog = await openKpiExpand('Faturamento');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.click(kpiScope('Faturamento').getByRole('button', { name: 'Expandir' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('Z26 — card expansível responde a teclado', async () => {
    renderDashboard();
    const expandBtn = await waitFor(() =>
      kpiScope('Faturamento').getByRole('button', { name: 'Expandir' }),
    );
    const card = expandBtn.closest('[data-tone]');
    expect(card).toBeTruthy();
    expect((card as HTMLElement).className).toMatch(/expandable/);
    (card as HTMLElement).focus();
    fireEvent.keyDown(card as HTMLElement, { key: 'Enter' });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('Z27 — modal mobile usa layout full-height (classe dialog presente)', async () => {
    const dialog = await openKpiExpand('Despesas');
    expect(dialog.className).toMatch(/dialog/i);
    expect(within(dialog).getByRole('button', { name: 'Fechar' })).toBeTruthy();
  });

  it('Z28 — modal renderiza sob ThemeProvider (light default)', async () => {
    const dialog = await openKpiExpand('Resultado');
    expect(within(dialog).getByText('Resultado projetado')).toBeTruthy();
  });

  it('Z29 — KPIs da Home permanecem iguais com modal fechado', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();
    });
    expect(kpiScope('Já recebido').getByText(/R\$\s*888\.888,88/)).toBeTruthy();
    expect(kpiScope('A receber').getByText(/R\$\s*111\.111,11/)).toBeTruthy();
    expect(kpiScope('Despesas').getByText(/R\$\s*133\.333,33/)).toBeTruthy();
    expect(kpiScope('Resultado').getByText(/R\$\s*866\.666,66/)).toBeTruthy();
  });

  it('Z30 — Home sem modal permanece com seções principais', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Entradas × Saídas' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Receitas por categoria' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Despesas por categoria' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('A receber vazio honesto quando não há previsto diário', async () => {
    getMonthlyCashFlow.mockImplementation(async (month) => {
      if (month === '2026-07') {
        return previousMonthCashFlow;
      }
      return {
        ...cashFlowHomeFixture,
        expected: { receivables: '0', payables: '22222.22', result: '-22222.22' },
        billing: '888888.88',
        overdue: {
          receivables: '50.00',
          payables: '0',
          ofMonth: { receivables: '0', payables: '0' },
        },
        daily: {
          realized: cashFlowHomeFixture.daily.realized,
          expected: [],
        },
        realizedByCategory: {
          inflows: singleCashCategoryComposition('Serviços', '888888.88'),
          outflows: singleCashCategoryComposition('Salários', '111111.11'),
        },
      };
    });
    const dialog = await openKpiExpand('A receber');
    expect(within(dialog).getByText(/Sem previsão a receber no prazo/i)).toBeTruthy();
    expect(within(dialog).queryByText(/R\$\s*50,00/)).toBeNull();
  });
});
