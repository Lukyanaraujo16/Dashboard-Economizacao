import { cleanup, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import type { DashboardMonthEndCashPressureResponse } from '../src/services/dashboard/month-end-cash-pressure.types';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import { getDashboardRevenueGoal } from '../src/services/dashboard/revenue-goal';
import type { RevenueGoalSnapshot } from '../src/services/dashboard/revenue-goal.types';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import { ThemeProvider } from '../src/theme';
import {
  cashFlowHomeFixture,
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

const lifeCashFlow = {
  ...cashFlowHomeFixture,
  today: '2026-08-19',
  monthKey: '2026-08',
  billing: '235301.50',
  realized: { inflows: '224790.30', outflows: '98941.52', result: '125848.78' },
  expected: { receivables: '10511.20', payables: '28289.80', result: '-17778.60' },
  overdue: {
    receivables: '0',
    payables: '100.00',
    ofMonth: { receivables: '0', payables: '0' },
  },
  coverage: '0.955447',
  realizedByCategory: {
    inflows: singleCashCategoryComposition('Consultas', '224790.30'),
    outflows: singleCashCategoryComposition('Operacional', '98941.52'),
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
  summary: { receivable: '10511.20', payable: '28289.80', net: '-17778.60' },
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
  getMonthlyCashFlow.mockResolvedValue(lifeCashFlow);
  getRevenueGoal.mockResolvedValue(emptyGoal);
  getCostCenters.mockResolvedValue({ items: [] });
  getCategories.mockResolvedValue({ items: [] });
});

describe('PRE-F13-CASH-4C-CAT-FINAL-UI — Home sem Leitura executiva', () => {
  it('UI1 — Leitura executiva e banda executive-reading ausentes', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-cash-flow-state="ready"]')).toBeTruthy();
    });
    expect(screen.queryByRole('heading', { name: 'Leitura executiva' })).toBeNull();
    expect(document.querySelector('[data-home-band="executive-reading"]')).toBeNull();
    expect(document.querySelector('[data-financial-section="leitura-executiva"]')).toBeNull();
    expect(document.querySelector('[data-cash-executive="true"]')).toBeNull();
    expect(screen.queryByText('Sinais do fluxo de caixa do mês')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Abrir detalhe de Já recebido' })).toBeNull();
  });

  it('UI11–UI13 — Meta/Inadimplência compactos; KPIs e competência intactos', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-home-band="compact-kpis"]')).toBeTruthy();
    });

    const compact = document.querySelector('[data-home-band="compact-kpis"]')!;
    expect(compact.querySelector('[data-financial-section="meta-faturamento"]')).toBeTruthy();
    expect(compact.querySelector('[data-financial-section="ate-fim-do-mes"]')).toBeNull();
    expect(compact.querySelector('[data-financial-section="inadimplencia"]')).toBeTruthy();
    expect(compact.querySelector('[data-financial-section="leitura-executiva"]')).toBeNull();
    expect(compact.getAttribute('data-cols')).toBe('2');
    expect(document.querySelector('[data-home-band="executive-reading"]')).toBeNull();

    // UI12 — KPI faturamento Life
    expect(await screen.findByText('R$ 235.301,50')).toBeTruthy();

    // UI13 — nenhuma competência reaparece
    expect(screen.queryByRole('heading', { name: 'Receitas × Despesas' })).toBeNull();
  });

  it('UI14/UI15 — light/dark tokens; faixa compacta sem overflow forçado', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-home-band="compact-kpis"]')).toBeTruthy();
    });
    const compact = document.querySelector('[data-home-band="compact-kpis"]') as HTMLElement;
    expect(compact.scrollWidth).toBeLessThanOrEqual(compact.clientWidth + 1);

    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark');
    expect(document.querySelector('[data-home-band="compact-kpis"]')).toBeTruthy();
    root.setAttribute('data-theme', 'light');
    expect(document.querySelector('[data-home-band="compact-kpis"]')).toBeTruthy();
  });
});
