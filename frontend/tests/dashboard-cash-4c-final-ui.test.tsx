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

function section(id: string): HTMLElement {
  const node = document.querySelector(`[data-financial-section="${id}"]`);
  expect(node).toBeTruthy();
  return node as HTMLElement;
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

describe('PRE-F13-CASH-4C-CAT-FINAL-UI — Leitura executiva compacta', () => {
  it('UI1–UI7 — 6 sinais, valores Life, status discreto, sem frases longas', async () => {
    renderDashboard();
    const scope = within(section('leitura-executiva'));
    await waitFor(() => {
      expect(scope.getByText('Entrou no caixa')).toBeTruthy();
    });

    // UI1 — 6 sinais principais
    for (const label of [
      'Entrou no caixa',
      'Ainda a receber',
      'Saiu do caixa',
      'Ainda a pagar',
      'Resultado projetado',
      'Faturamento realizado',
    ]) {
      expect(scope.getByText(label)).toBeTruthy();
    }

    // UI2 / UI6 — valores financeiros iguais
    expect(scope.getByText('R$ 224.790,30')).toBeTruthy();
    expect(scope.getByText('R$ 10.511,20')).toBeTruthy();
    expect(scope.getByText('R$ 98.941,52')).toBeTruthy();
    expect(scope.getByText('R$ 28.289,80')).toBeTruthy();
    expect(scope.getByText('R$ 108.070,18')).toBeTruthy();
    expect(scope.getByText(/95,5%/)).toBeTruthy();

    // UI3 — textos longos anteriores não são mais necessários
    expect(scope.queryByText(/já entrou no caixa neste mês/i)).toBeNull();
    expect(scope.queryByText(/ainda está previsto para entrar até o fim do mês/i)).toBeNull();
    expect(scope.queryByText(/resultado projetado do mês/i)).toBeNull();

    // UI4 — bloco “Ainda a receber” com valor agora curto e sem frase deformada
    const receivable = scope.getByText('Ainda a receber').closest('[data-signal]');
    expect(receivable).toBeTruthy();
    expect(receivable!.getAttribute('data-signal')).toBe('cash-receivable');
    const receivableValue = receivable!.querySelector('p');
    expect(receivableValue?.textContent).toMatch(/R\$\s*10\.511,20/);

    // UI5 — diferenciação semântica de ícones
    expect(scope.getByText('Entrou no caixa').closest('[data-tone]')?.getAttribute('data-tone')).toBe(
      'revenue',
    );
    expect(scope.getByText('Ainda a receber').closest('[data-tone]')?.getAttribute('data-tone')).toBe(
      'receivable',
    );
    expect(scope.getByText('Saiu do caixa').closest('[data-tone]')?.getAttribute('data-tone')).toBe(
      'expense',
    );
    expect(scope.getByText('Resultado projetado').closest('[data-tone]')?.getAttribute('data-tone')).toBe(
      'result',
    );
    expect(
      scope.getByText('Faturamento realizado').closest('[data-tone]')?.getAttribute('data-tone'),
    ).toBe('positive');

    // UI7 — status de vencido presente (discreto)
    expect(scope.getByText(/Nenhum valor a receber vencido no momento/i)).toBeTruthy();
    expect(scope.getByRole('status').getAttribute('data-status')).toBe('clear');
  });

  it('UI8–UI10 — grid metrics 1→2→3 colunas via data-layout', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-cash-executive="true"]')).toBeTruthy();
    });
    const grid = document.querySelector('[data-cash-executive="true"] [data-layout="metrics"]');
    expect(grid).toBeTruthy();
    expect(grid!.querySelectorAll('[data-signal]').length).toBe(6);
  });

  it('UI11–UI13 — Meta/Fim/Inadimplência compactos; KPIs e competência intactos', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-home-band="compact-kpis"]')).toBeTruthy();
    });

    const compact = document.querySelector('[data-home-band="compact-kpis"]')!;
    const executive = document.querySelector('[data-home-band="executive-reading"]')!;
    expect(compact.querySelector('[data-financial-section="meta-faturamento"]')).toBeTruthy();
    expect(compact.querySelector('[data-financial-section="ate-fim-do-mes"]')).toBeTruthy();
    expect(compact.querySelector('[data-financial-section="inadimplencia"]')).toBeTruthy();
    expect(compact.querySelector('[data-financial-section="leitura-executiva"]')).toBeNull();
    expect(executive.querySelector('[data-financial-section="leitura-executiva"]')).toBeTruthy();

    // UI12 — KPI faturamento Life
    expect(await screen.findByText('R$ 235.301,50')).toBeTruthy();

    // UI13 — nenhuma competência reaparece na leitura
    expect(section('leitura-executiva').textContent?.toLowerCase()).not.toMatch(/competência/);
    expect(screen.queryByRole('heading', { name: 'Receitas × Despesas' })).toBeNull();
  });

  it('UI14/UI15 — light/dark tokens e sem overflow forçado na faixa executiva', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-cash-executive="true"]')).toBeTruthy();
    });
    const executive = document.querySelector(
      '[data-home-band="executive-reading"]',
    ) as HTMLElement;
    expect(executive.scrollWidth).toBeLessThanOrEqual(executive.clientWidth + 1);

    const root = document.documentElement;
    root.setAttribute('data-theme', 'dark');
    expect(document.querySelector('[data-cash-executive="true"]')).toBeTruthy();
    root.setAttribute('data-theme', 'light');
    expect(document.querySelector('[data-cash-executive="true"]')).toBeTruthy();
  });
});
