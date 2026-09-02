import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import { getDashboardCashFlowForecast } from '../src/services/dashboard/forecast';
import type { DashboardCashFlowForecastResponse } from '../src/services/dashboard/forecast.types';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import type { DashboardMonthlyCashFlowResponse } from '../src/services/dashboard/monthly-cash-flow.types';
import { getDashboardCashMovementHistory } from '../src/services/dashboard/cash-movement-history';
import type { DashboardCashMovementHistoryResponse } from '../src/services/dashboard/cash-movement-history.types';
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
vi.mock('../src/services/dashboard/cash-movement-history', () => ({
  getDashboardCashMovementHistory: vi.fn(),
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
const getHistory = vi.mocked(getDashboardCashMovementHistory);
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
    realized: [
      { date: '2026-07-10', inflows: '400000.00', outflows: '100000.00', result: '300000.00' },
    ],
    expected: [],
  },
};

function buildHistory(endMonth: string): DashboardCashMovementHistoryResponse {
  const [year, month] = endMonth.split('-').map(Number) as [number, number];
  const months = Array.from({ length: 12 }, (_, index) => {
    const offset = 11 - index;
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    const isEnd = key === endMonth;
    return {
      monthKey: key,
      realized: {
        inflows: isEnd ? '888888.88' : '0',
        outflows: isEnd ? '111111.11' : '0',
        result: isEnd ? '777777.77' : '0',
      },
    };
  });
  return {
    today: '2026-08-19',
    startMonth: months[0]!.monthKey,
    endMonth,
    costCenterCashSplit: true,
    months,
  };
}

const forecast: DashboardCashFlowForecastResponse = {
  today: '2026-08-19',
  from: '2026-08-19',
  to: '2026-11-17',
  horizonDays: 90,
  buckets: [
    { key: '2026-08', inflows: '100', outflows: '50', net: '50' },
    { key: '2026-09', inflows: '200', outflows: '80', net: '120' },
    { key: '2026-10', inflows: '0', outflows: '0', net: '0' },
  ],
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

function section(id: string) {
  return document.querySelector(`[data-financial-section="${id}"]`) as HTMLElement;
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
  getMonthEnd.mockRejectedValue(new Error('not used'));
  getForecast.mockResolvedValue(forecast);
  getMonthlyCashFlow.mockImplementation(async (month) => {
    if (month === '2026-07') {
      return previousMonthCashFlow;
    }
    return cashFlowHomeFixture;
  });
  getHistory.mockImplementation(async (month) => buildHistory(month ?? '2026-08'));
  getRevenueGoal.mockResolvedValue(emptyGoal);
  getCostCenters.mockResolvedValue({ items: [] });
  getCategories.mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('Correção 08-B — Movimentação financeira Mensal', () => {
  it('Diária é default; history não busca no boot; Realizado|Previsto presentes', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    expect(await scope.findByRole('button', { name: 'Diária' })).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Mensal' })).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Diária' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(scope.getByRole('button', { name: 'Realizado' })).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Previsto' })).toBeTruthy();
    expect(scope.getByText('Entradas e saídas por dia de baixa')).toBeTruthy();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalled();
    });
    expect(getHistory).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: /Saldo bancário/i })).toBeNull();
  });

  it('Mensal carrega UMA history, esconde Realizado|Previsto e renderiza 12 meses', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    fireEvent.click(scope.getByRole('button', { name: 'Mensal' }));
    await waitFor(() => {
      expect(getHistory).toHaveBeenCalledTimes(1);
    });
    expect(getHistory).toHaveBeenCalledWith(null, null, null);
    expect(scope.queryByRole('button', { name: 'Realizado' })).toBeNull();
    expect(scope.queryByRole('button', { name: 'Previsto' })).toBeNull();
    expect(await scope.findByText(/12 meses até/i)).toBeTruthy();
    expect(scope.getByText('SET/25')).toBeTruthy();
    expect(scope.getByText('AGO/26')).toBeTruthy();
    expect(scope.getByText('Entradas e saídas realizadas por mês de baixa')).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Comparativo mensal' })).toBeNull();
    expect(document.querySelector('[data-financial-section="comparativo-mensal"]')).toBeNull();
    expect(document.querySelector('[class*="tertiaryGrid"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: /Saldo bancário/i })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Meta de faturamento' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Inadimplência' })).toBeTruthy();
  });

  it('troca de mês com Mensal ativo recarrega a janela', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    fireEvent.click(scope.getByRole('button', { name: 'Mensal' }));
    await waitFor(() => expect(getHistory).toHaveBeenCalledTimes(1));
    expect(getHistory).toHaveBeenCalledWith(null, null, null);

    cleanup();
    getHistory.mockClear();
    dashboardSearchParams = new URLSearchParams('month=2026-07');
    renderDashboard();
    const next = within(section('movimentacao-financeira'));
    await next.findByRole('button', { name: 'Mensal' });
    fireEvent.click(next.getByRole('button', { name: 'Mensal' }));
    await waitFor(() => {
      expect(getHistory).toHaveBeenCalledWith('2026-07', null, null);
    });
  });

  it('expand Mensal abre sem Realizado|Previsto', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    fireEvent.click(scope.getByRole('button', { name: 'Mensal' }));
    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    fireEvent.click(scope.getByRole('button', { name: 'Expandir' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByRole('heading', { name: 'Movimentação financeira' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Realizado' })).toBeNull();
    expect(within(dialog).getByRole('button', { name: 'Mensal' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(within(dialog).getByText('AGO/26')).toBeTruthy();
  });

  it('tooltip mensal no card: mês, Entradas, Saídas, Resultado em BRL', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    fireEvent.click(scope.getByRole('button', { name: 'Mensal' }));
    await scope.findByText('AGO/26');
    const plot = scope.getByRole('img', {
      name: /Entradas e saídas realizadas por mês de baixa/,
    });
    expect(plot.getAttribute('data-tooltip-lane')).toBeNull();
    Object.defineProperty(plot, 'clientWidth', { configurable: true, value: 480 });
    Object.defineProperty(plot, 'clientHeight', { configurable: true, value: 120 });
    plot.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 480,
        bottom: 120,
        width: 480,
        height: 120,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.mouseMove(plot, { clientX: 460, clientY: 40 });
    const tip = (await within(
      scope.getByRole('img', {
        name: /Entradas e saídas realizadas por mês de baixa/,
      }),
    ).findByRole('tooltip', { hidden: true })) as HTMLElement;
    expect(tip.getAttribute('data-vertical-mode')).toBe('floating-top');
    expect(tip.getAttribute('data-vertical-placement')).toBe('above');
    expect(tip.textContent).toMatch(/AGO\/26/);
    expect(tip.textContent).toMatch(/Entradas/);
    expect(tip.textContent).toMatch(/Saídas/);
    expect(tip.textContent).toMatch(/Resultado/);
    expect(tip.textContent).toMatch(/R\$\s*888\.888,88/);
    expect(tip.textContent).toMatch(/R\$\s*111\.111,11/);
    expect(tip.textContent).toMatch(/R\$\s*777\.777,77/);
    expect(tip.style.transform).not.toBe('translateX(-50%)');
    expect(tip.style.bottom).toMatch(/calc\(100%/);
    expect(tip.style.top).toBe('auto');
  });

  it('tooltip mensal no expand e Diária permanece funcional', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    fireEvent.click(scope.getByRole('button', { name: 'Mensal' }));
    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    fireEvent.click(scope.getByRole('button', { name: 'Expandir' }));
    const dialog = await screen.findByRole('dialog');
    const expandPlot = within(dialog).getByRole('img', {
      name: /Entradas e saídas realizadas por mês de baixa/,
    });
    expect(expandPlot.getAttribute('data-tooltip-lane')).toBeNull();
    Object.defineProperty(expandPlot, 'clientWidth', { configurable: true, value: 640 });
    Object.defineProperty(expandPlot, 'clientHeight', { configurable: true, value: 140 });
    expandPlot.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 640,
        bottom: 140,
        width: 640,
        height: 140,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.mouseMove(expandPlot, { clientX: 20, clientY: 40 });
    const tip = within(expandPlot).getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(tip.textContent).toMatch(/SET\/25/);
    expect(tip.textContent).toMatch(/Entradas/);
    expect(tip.getAttribute('data-vertical-mode')).toBe('floating-top');
    expect(tip.style.bottom).toMatch(/calc\(100%/);
    expect(tip.style.top).toBe('auto');
    fireEvent.click(within(dialog).getByRole('button', { name: /Fechar|Close/i }));
    fireEvent.click(scope.getByRole('button', { name: 'Diária' }));
    expect(scope.getByRole('button', { name: 'Diária' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(scope.getByRole('button', { name: 'Realizado' })).toBeTruthy();
    expect(scope.getByRole('button', { name: 'Previsto' })).toBeTruthy();
    expect(scope.getByText('Entradas e saídas por dia de baixa')).toBeTruthy();

    const dailyPlot = scope.getByRole('img', {
      name: /Entradas e saídas de caixa por dia de baixa/,
    });
    Object.defineProperty(dailyPlot, 'clientWidth', { configurable: true, value: 480 });
    Object.defineProperty(dailyPlot, 'clientHeight', { configurable: true, value: 108 });
    dailyPlot.getBoundingClientRect = () =>
      ({
        left: 0,
        top: 0,
        right: 480,
        bottom: 108,
        width: 480,
        height: 108,
        x: 0,
        y: 0,
        toJSON: () => ({}),
      }) as DOMRect;
    fireEvent.mouseMove(dailyPlot, { clientX: 40, clientY: 40 });
    const dailyTip = within(dailyPlot).getByRole('tooltip', { hidden: true }) as HTMLElement;
    expect(dailyTip.getAttribute('data-vertical-mode')).toBe('floating-top');
    expect(dailyTip.style.bottom).toMatch(/calc\(100%/);
  });
});
