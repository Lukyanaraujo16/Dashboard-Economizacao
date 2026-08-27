import { cleanup, screen, waitFor, within } from '@testing-library/react';
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
import { getDashboardMonthlyRevenue } from '../src/services/dashboard/monthly-revenue';
import { getDashboardMonthlyExpenses } from '../src/services/dashboard/monthly-expenses';
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
import { singleCashCategoryComposition } from './helpers/monthly-cash-flow-fixture';

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
vi.mock('../src/services/dashboard/monthly-revenue', () => ({
  getDashboardMonthlyRevenue: vi.fn(),
}));
vi.mock('../src/services/dashboard/monthly-expenses', () => ({
  getDashboardMonthlyExpenses: vi.fn(),
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
const getMonthlyRevenue = vi.mocked(getDashboardMonthlyRevenue);
const getMonthlyExpenses = vi.mocked(getDashboardMonthlyExpenses);
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

const lifeCashFlow: DashboardMonthlyCashFlowResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  costCenterCashSplit: true,
  billing: '235301.50',
  realized: { inflows: '224790.30', outflows: '98941.52', result: '125848.78' },
  expected: { receivables: '10511.20', payables: '28289.80', result: '-17778.60' },
  overdue: {
    receivables: '4200.00',
    payables: '100.00',
    ofMonth: { receivables: '0', payables: '0' },
  },
  coverage: '0.95',
  realizedByCategory: {
    inflows: singleCashCategoryComposition('Consultas', '224790.30'),
    outflows: singleCashCategoryComposition('Operacional', '98941.52'),
  },
  daily: {
    realized: [
      {
        date: '2026-08-05',
        inflows: '224790.30',
        outflows: '98941.52',
        result: '125848.78',
      },
    ],
    expected: [
      { date: '2026-08-31', receivables: '10511.20', payables: '28289.80', result: '-17778.60' },
    ],
  },
};

const emptyGoal: RevenueGoalSnapshot = {
  monthKey: '2026-08',
  target: null,
  actual: '235301.50',
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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

beforeEach(() => {
  dashboardSearchParams = new URLSearchParams('month=2026-08');
  getOverview.mockResolvedValue(syncedOverview);
  getMonthEnd.mockResolvedValue(monthEnd);
  getForecast.mockResolvedValue(forecast);
  getMonthlyCashFlow.mockResolvedValue(lifeCashFlow);
  getRevenueGoal.mockResolvedValue(emptyGoal);
  getCostCenters.mockResolvedValue({ items: [] });
  getCategories.mockResolvedValue({ items: [] });
});

describe('CASH-4C-CAT — donuts de caixa na Home', () => {
  it('CAT15/CAT16/CAT17/CAT22 — donuts cash; sem competência nos subtítulos; totais realizados', async () => {
    renderDashboard();

    await waitFor(() => {
      expect(document.querySelector('[data-cash-flow-state="ready"]')).toBeTruthy();
      expect(screen.getByText('Consultas')).toBeTruthy();
      expect(screen.getByText('Operacional')).toBeTruthy();
    });

    expect(screen.getByRole('heading', { name: 'Despesas por categoria' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Receitas por categoria' })).toBeTruthy();
    expect(screen.getByText(/Pagamentos realizados em/i)).toBeTruthy();
    expect(screen.getByText(/Recebimentos realizados em/i)).toBeTruthy();
    expect(screen.queryByText(/Competência de/i)).toBeNull();

    expect(getMonthlyRevenue).not.toHaveBeenCalled();
    expect(getMonthlyExpenses).not.toHaveBeenCalled();

    const revenueCard = document.querySelector(
      '[data-financial-section="receitas-categoria"]',
    ) as HTMLElement;
    const expenseCard = document.querySelector(
      '[data-financial-section="despesas-categoria"]',
    ) as HTMLElement;
    expect(within(revenueCard).getByText('Consultas')).toBeTruthy();
    expect(within(expenseCard).getByText('Operacional')).toBeTruthy();

    expect(screen.getByRole('heading', { name: 'Entradas × Saídas' })).toBeTruthy();
    expect(screen.getByText('R$ 235.301,50')).toBeTruthy();
  });

  it('CAT14 — unavailable não vira zero nos donuts', async () => {
    getMonthlyCashFlow.mockResolvedValue({
      ...lifeCashFlow,
      costCenterCashSplit: false,
      billing: null,
      realized: { inflows: null, outflows: null, result: null },
      realizedByCategory: { inflows: null, outflows: null },
      expected: { receivables: null, payables: null, result: null },
      coverage: null,
    });

    renderDashboard();

    await waitFor(() => {
      expect(screen.getAllByText(/Composição por categoria indisponível/i).length).toBeGreaterThan(
        0,
      );
    });
    const revenueCard = document.querySelector(
      '[data-financial-section="receitas-categoria"]',
    ) as HTMLElement;
    expect(within(revenueCard).queryByText('R$ 0,00')).toBeNull();
  });
});
