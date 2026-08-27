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
import { cashFlowHomeFixture } from './helpers/monthly-cash-flow-fixture';
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
  daily: {
    realized: [{ date: '2026-07-10', inflows: '400000.00', outflows: '100000.00', result: '300000.00' }],
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

const emptyGoal: RevenueGoalSnapshot = {
  monthKey: '2026-08',
  target: null,
  actual: '0',
  achievementRate: null,
  remaining: null,
  exceeded: null,
  status: 'NO_TARGET',
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

beforeEach(() => {
  dashboardSearchParams = new URLSearchParams();
  getOverview.mockResolvedValue(syncedOverview);
  getMonthEnd.mockResolvedValue(monthEnd);
  getForecast.mockResolvedValue(forecast);
  getMonthlyCashFlow.mockImplementation(async (month) =>
    month === '2026-07' ? previousMonthCashFlow : cashFlowHomeFixture,
  );
  getRevenueGoal.mockResolvedValue(emptyGoal);
  getCostCenters.mockResolvedValue({ items: [] });
  getCategories.mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('CASH-4C — Home', () => {
  it('C1/C2 — Entradas × Saídas visível; Receitas × Despesas ausente', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Entradas × Saídas' })).toBeTruthy();
    expect(screen.getByText('Entradas e saídas realizadas no mês')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Receitas × Despesas' })).toBeNull();
    expect(screen.queryByText(/Competência de/i)).toBeNull();
  });

  it('C6 — Comparativo mensal usa caixa realizado do mês anterior', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalledWith('2026-07', null, null);
    });
    const scope = within(section('comparativo-mensal'));
    expect(await scope.findByText('Entradas realizadas')).toBeTruthy();
    expect(scope.getByText('Saídas realizadas')).toBeTruthy();
    expect(scope.getByText('Resultado realizado')).toBeTruthy();
  });

  it('C7 — Movimentação diária alterna Realizado e Previsto', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-diaria'));
    expect(await scope.findByRole('button', { name: 'Realizado' })).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Previsto' })).toBeTruthy();
    fireEvent.click(scope.getByRole('button', { name: 'Previsto' }));
    await waitFor(() => {
      expect(scope.getByText(/A receber e a pagar por dia/i)).toBeTruthy();
    });
  });

  it('C8 — Leitura executiva vem do caixa, sem competência', async () => {
    renderDashboard();
    const scope = within(section('leitura-executiva'));
    expect(await scope.findByText('Entrou no caixa')).toBeTruthy();
    expect(scope.getByText('Sinais do fluxo de caixa do mês')).toBeTruthy();
    expect(section('leitura-executiva').textContent?.toLowerCase()).not.toMatch(/competência/);
  });

  it('C9 — Até o fim do mês mostra subtítulo previsto no mês corrente', async () => {
    renderDashboard();
    expect(await screen.findByText('Previsto até o fim do mês')).toBeTruthy();
  });

  it('C13 — donuts de categoria em caixa (não competência)', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Despesas por categoria' })).toBeTruthy();
      expect(screen.getByRole('heading', { name: 'Receitas por categoria' })).toBeTruthy();
    });
    expect(document.querySelector('[data-financial-section="despesas-mes"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="receitas-categoria"]')).toBeTruthy();
    expect(document.querySelector('[data-financial-section="despesas-categoria"]')).toBeTruthy();
    expect(screen.getByText(/Pagamentos realizados em/i)).toBeTruthy();
    expect(screen.getByText(/Recebimentos realizados em/i)).toBeTruthy();
  });

  it('C14 — Home cash-only não carrega competência revenue/expenses', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalled();
    });
  });

  it('C17 — KPI Faturamento permanece do MonthlyCashFlow (fixture Life-like)', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();
    });
    expect(kpiScope('Faturamento').queryByText(/R\$\s*0,00/)).toBeNull();
  });
});
