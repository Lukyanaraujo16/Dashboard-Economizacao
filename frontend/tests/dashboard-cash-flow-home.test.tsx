import { cleanup, screen, waitFor, within } from '@testing-library/react';
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
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import { DashboardMonthlyCashFlowRequestError } from '../src/services/dashboard/monthly-cash-flow.types';
import { getDashboardMonthlyExpenses } from '../src/services/dashboard/monthly-expenses';
import type { DashboardMonthlyExpenseResponse } from '../src/services/dashboard/monthly-expenses.types';
import { getDashboardRevenueGoal } from '../src/services/dashboard/revenue-goal';
import type { RevenueGoalSnapshot } from '../src/services/dashboard/revenue-goal.types';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';
import { cashFlowHomeFixture } from './helpers/monthly-cash-flow-fixture';

const CENTER = '11111111-1111-4111-8111-111111111111';
const CATEGORY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';

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

const loadedRevenue: DashboardMonthlyRevenueResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  receivables: {
    total: '10000',
    received: '4000',
    outstanding: '6000',
    overdue: '0',
    classified: '10000',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: '100',
    items: [
      {
        kind: 'category',
        name: 'Serviços',
        amount: '10000',
        received: '4000',
        outstanding: '6000',
        percentage: '100',
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
        amount: '100',
        paid: '20',
        outstanding: '80',
        percentage: '100',
      },
    ],
    daily: [{ date: '2026-08-10', amount: '100', received: '20', outstanding: '80' }],
  },
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

const monthEnd: DashboardMonthEndCashPressureResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-19',
  to: '2026-08-31',
  summary: { receivable: '0', payable: '0', net: '0' },
};

const forecast: DashboardCashFlowForecastResponse = {
  today: '2026-08-19',
  from: '2026-08-19',
  to: '2026-11-17',
  horizonDays: 90,
  buckets: [{ key: '2026-08', inflows: '0', outflows: '0', net: '0' }],
};

function kpiScope(title: string) {
  const heading = within(
    document.querySelector('[data-financial-section="resumo-financeiro"]') as HTMLElement,
  ).getByRole('heading', { name: title });
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

async function renderReadyDashboard() {
  renderDashboard();
  await waitFor(() => {
    expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
  });
}

beforeEach(() => {
  dashboardSearchParams = new URLSearchParams();
  getOverview.mockResolvedValue(syncedOverview);
  getMonthEnd.mockResolvedValue(monthEnd);
  getForecast.mockResolvedValue(forecast);
  getMonthlyExpenses.mockResolvedValue(loadedExpenses);
  getMonthlyRevenue.mockResolvedValue(loadedRevenue);
  getMonthlyCashFlow.mockResolvedValue(cashFlowHomeFixture);
  getRevenueGoal.mockResolvedValue(emptyGoal);
  getCostCenters.mockResolvedValue({
    items: [{ id: CENTER, name: 'Operações', code: 'OP', active: true }],
  });
  getCategories.mockResolvedValue({
    items: [{ id: CATEGORY, name: 'Serviços', type: 'REVENUE' }],
  });
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

describe('CASH-4A/4B — Home carrega MonthlyCashFlow e exibe KPIs de caixa', () => {
  it('chama monthly-cash-flow do mês corrente sem month, tenantId ou situation', async () => {
    await renderReadyDashboard();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalled();
    });
    expect(getMonthlyCashFlow).toHaveBeenCalledWith(null, null, null);
    for (const args of getMonthlyCashFlow.mock.calls) {
      expect(args).toHaveLength(3);
      expect(args.join('|')).not.toContain('tenant-1');
      expect(args).not.toContain('open');
      expect(args).not.toContain('settled');
    }
    expect(getMonthlyRevenue).not.toHaveBeenCalled();
    expect(getMonthlyExpenses).not.toHaveBeenCalled();
  });

  it('envia month, costCenter e category quando presentes', async () => {
    dashboardSearchParams = new URLSearchParams(
      `month=2026-07&costCenter=${CENTER}&category=${CATEGORY}`,
    );
    renderDashboard();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalledWith('2026-07', CENTER, CATEGORY);
    });
    expect(getMonthlyRevenue).not.toHaveBeenCalled();
    expect(getMonthlyExpenses).not.toHaveBeenCalled();
  });

  it('não envia situation ao cash-flow; Home não chama endpoints de competência', async () => {
    dashboardSearchParams = new URLSearchParams('situation=open');
    await renderReadyDashboard();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalledWith(null, null, null);
    });
    expect(getMonthlyRevenue).not.toHaveBeenCalled();
    expect(getMonthlyExpenses).not.toHaveBeenCalled();
    for (const args of getMonthlyCashFlow.mock.calls) {
      expect(args).not.toContain('open');
    }
  });

  it('renderiza os KPIs de caixa (billing), não a competência', async () => {
    await renderReadyDashboard();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalled();
      expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();
    });
    expect(kpiScope('Já recebido').getByText(/R\$\s*888\.888,88/)).toBeTruthy();
    expect(kpiScope('A receber').getByText(/R\$\s*111\.111,11/)).toBeTruthy();
    expect(kpiScope('Faturamento').queryByText(/R\$\s*10\.000,00/)).toBeNull();
    await waitFor(() => {
      expect(document.querySelector('[data-cash-flow-state="ready"]')).toBeTruthy();
    });
  });

  it('falha do cash-flow mostra erro nos KPIs sem fallback para competência', async () => {
    getMonthlyCashFlow.mockRejectedValue(
      new DashboardMonthlyCashFlowRequestError(
        'unavailable',
        'Não foi possível carregar o fluxo de caixa do mês.',
      ),
    );
    await renderReadyDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-cash-flow-state="error"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    expect(kpiScope('Faturamento').queryByText(/R\$\s*10\.000,00/)).toBeNull();
    expect(
      screen.getAllByText('Não foi possível carregar o fluxo de caixa do mês.').length,
    ).toBeGreaterThan(0);
  });
});
