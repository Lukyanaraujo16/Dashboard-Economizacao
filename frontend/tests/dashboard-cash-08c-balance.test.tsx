/** @vitest-environment jsdom */
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import { getDashboardCashMovementHistory } from '../src/services/dashboard/cash-movement-history';
import type { DashboardCashMovementHistoryResponse } from '../src/services/dashboard/cash-movement-history.types';
import { getDashboardCashExpectedHorizon } from '../src/services/dashboard/cash-expected-horizon';
import { getDashboardCashBalanceHistory } from '../src/services/dashboard/cash-balance-history';
import type { DashboardCashBalanceHistoryResponse } from '../src/services/dashboard/cash-balance-history.types';
import { DashboardCashBalanceHistoryRequestError } from '../src/services/dashboard/cash-balance-history.types';
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
vi.mock('../src/services/dashboard/monthly-cash-flow', () => ({
  getDashboardMonthlyCashFlow: vi.fn(),
}));
vi.mock('../src/services/dashboard/cash-movement-history', () => ({
  getDashboardCashMovementHistory: vi.fn(),
}));
vi.mock('../src/services/dashboard/cash-expected-horizon', () => ({
  getDashboardCashExpectedHorizon: vi.fn(),
}));
vi.mock('../src/services/dashboard/cash-balance-history', () => ({
  getDashboardCashBalanceHistory: vi.fn(),
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
const getHistory = vi.mocked(getDashboardCashMovementHistory);
const getHorizon = vi.mocked(getDashboardCashExpectedHorizon);
const getBalance = vi.mocked(getDashboardCashBalanceHistory);
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

function buildHistory(endMonth: string): DashboardCashMovementHistoryResponse {
  const [year, month] = endMonth.split('-').map(Number) as [number, number];
  const months = Array.from({ length: 12 }, (_, index) => {
    const offset = 11 - index;
    const date = new Date(Date.UTC(year, month - 1 - offset, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return {
      monthKey: key,
      realized: { inflows: '10', outflows: '5', result: '5' },
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

function balanceFixture(
  overrides: Partial<DashboardCashBalanceHistoryResponse> = {},
): DashboardCashBalanceHistoryResponse {
  return {
    today: '2026-08-19',
    availableFrom: '2026-08-10',
    availableTo: '2026-08-19',
    pointCount: 3,
    accountsIncluded: 1,
    coverage: 'partial',
    daily: [
      { date: '2026-08-05', balance: '1000.50' },
      { date: '2026-08-10', balance: '1100.00' },
      { date: '2026-08-19', balance: '1500.25' },
    ],
    monthly: [
      { monthKey: '2026-07', balance: '900.00' },
      { monthKey: '2026-08', balance: '1500.25' },
    ],
    ...overrides,
  };
}

const CAT_ID = '22222222-2222-4222-8222-222222222222';
const CC_ID = '11111111-1111-4111-8111-111111111111';

function section(id: string) {
  return document.querySelector(`[data-financial-section="${id}"]`) as HTMLElement;
}

function mockPlotRect(element: Element, width: number, height = 120) {
  Object.defineProperty(element, 'clientWidth', { configurable: true, value: width });
  Object.defineProperty(element, 'clientHeight', { configurable: true, value: height });
  element.getBoundingClientRect = () =>
    ({
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    }) as DOMRect;
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
  dashboardSearchParams = new URLSearchParams('month=2026-08');
  getOverview.mockResolvedValue(syncedOverview);
  getMonthEnd.mockRejectedValue(new Error('not used'));
  getMonthlyCashFlow.mockResolvedValue(cashFlowHomeFixture);
  getHistory.mockResolvedValue(buildHistory('2026-08'));
  getHorizon.mockResolvedValue({
    today: '2026-08-19',
    startMonth: '2026-08',
    endMonth: '2026-10',
    horizon: 3,
    costCenterCashSplit: true,
    totals: { receivables: '100', payables: '40', result: '60' },
    months: [
      {
        monthKey: '2026-08',
        expected: { receivables: '100', payables: '40', result: '60' },
      },
      {
        monthKey: '2026-09',
        expected: { receivables: '10', payables: '5', result: '5' },
      },
      {
        monthKey: '2026-10',
        expected: { receivables: '10', payables: '5', result: '5' },
      },
    ],
  });
  getBalance.mockResolvedValue(balanceFixture());
  getRevenueGoal.mockResolvedValue(emptyGoal);
  getCostCenters.mockResolvedValue({
    items: [{ id: CC_ID, name: 'Ops', code: 'OPS', active: true }],
  });
  getCategories.mockResolvedValue({
    items: [{ id: CAT_ID, name: 'Receitas', type: 'REVENUE' }],
  });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('08-C3/C4 — linha de saldo bancário na Movimentação', () => {
  it('Daily Realizado mostra Saldo bancário; Mensal Previsto não', async () => {
    renderDashboard();
    const card = await waitFor(() => section('movimentacao-financeira'));
    await waitFor(() => expect(getBalance).toHaveBeenCalled());
    expect(within(card).getAllByText('Saldo bancário').length).toBeGreaterThan(0);
    expect(within(card).getByText(/disponível a partir de 10\/08\/2026/)).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: 'Mensal' }));
    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    expect(within(card).getByText('Saldo bancário')).toBeTruthy();

    fireEvent.click(within(card).getByRole('button', { name: 'Previsto' }));
    await waitFor(() => expect(within(card).queryByText('Saldo bancário')).toBeNull());
  });

  it('category e costCenter ocultam saldo sem alterar query do endpoint', async () => {
    getBalance.mockClear();
    dashboardSearchParams = new URLSearchParams(`month=2026-08&category=${CAT_ID}`);
    const { unmount } = renderDashboard();
    const card = await waitFor(() => section('movimentacao-financeira'));
    await waitFor(() => expect(getBalance).toHaveBeenCalled());
    // Mês corrente → null; mês explícito ≠ today → "2026-08".
    expect([null, '2026-08']).toContain(getBalance.mock.calls[0]?.[0] ?? null);
    await waitFor(() => expect(within(card).queryByText('Saldo bancário')).toBeNull());
    unmount();

    getBalance.mockClear();
    dashboardSearchParams = new URLSearchParams(`month=2026-08&costCenter=${CC_ID}`);
    renderDashboard();
    const cardCc = await waitFor(() => section('movimentacao-financeira'));
    await waitFor(() => expect(getBalance).toHaveBeenCalled());
    await waitFor(() => expect(within(cardCc).queryByText('Saldo bancário')).toBeNull());
  });

  it('coverage none não renderiza linha; barras seguem', async () => {
    getBalance.mockResolvedValue(
      balanceFixture({
        coverage: 'none',
        availableFrom: null,
        availableTo: null,
        pointCount: 0,
        daily: [],
        monthly: [],
      }),
    );
    renderDashboard();
    const card = await waitFor(() => section('movimentacao-financeira'));
    await waitFor(() => expect(getBalance).toHaveBeenCalled());
    expect(within(card).queryByText('Saldo bancário')).toBeNull();
    expect(within(card).getByText('Entradas')).toBeTruthy();
    expect(within(card).getByText('Saídas')).toBeTruthy();
  });

  it('um único ponto diário ainda exibe legenda de saldo', async () => {
    getBalance.mockResolvedValue(
      balanceFixture({
        coverage: 'partial',
        availableFrom: '2026-08-19',
        pointCount: 1,
        daily: [{ date: '2026-08-19', balance: '42.00' }],
        monthly: [{ monthKey: '2026-08', balance: '42.00' }],
      }),
    );
    renderDashboard();
    const card = await waitFor(() => section('movimentacao-financeira'));
    await waitFor(() => expect(within(card).getAllByText('Saldo bancário').length).toBeGreaterThan(0));
  });

  it('erro do balance não quebra barras diárias', async () => {
    getBalance.mockRejectedValue(
      new DashboardCashBalanceHistoryRequestError('unavailable', 'falha saldo'),
    );
    renderDashboard();
    const card = await waitFor(() => section('movimentacao-financeira'));
    await waitFor(() => expect(getBalance).toHaveBeenCalled());
    expect(within(card).getByText('Entradas')).toBeTruthy();
    expect(within(card).queryByText('Saldo bancário')).toBeNull();
    expect(within(card).queryByText('falha saldo')).toBeNull();
  });

  it('Mensal usa monthly[] e tooltip inclui Saldo final', async () => {
    renderDashboard();
    const card = await waitFor(() => section('movimentacao-financeira'));
    fireEvent.click(within(card).getByRole('button', { name: 'Mensal' }));
    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    await waitFor(() => expect(within(card).getByText('Saldo bancário')).toBeTruthy());
    expect(within(card).getAllByText(/\/2[5-6]/).length).toBeGreaterThanOrEqual(12);

    const plot = within(card).getByRole('img');
    mockPlotRect(plot, 480, 120);
    fireEvent.mouseMove(plot, { clientX: 400, clientY: 40 });
    const tooltip = await waitFor(() => screen.getByRole('tooltip', { hidden: true }));
    expect(within(tooltip).getByText('Saldo final')).toBeTruthy();
    expect(within(tooltip).getByText('Resultado')).toBeTruthy();
  });

  it('Mensal: category oculta saldo; barras e resultado permanecem', async () => {
    dashboardSearchParams = new URLSearchParams(`month=2026-08&category=${CAT_ID}`);
    renderDashboard();
    const card = await waitFor(() => section('movimentacao-financeira'));
    fireEvent.click(within(card).getByRole('button', { name: 'Mensal' }));
    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    await waitFor(() => expect(within(card).queryByText('Saldo bancário')).toBeNull());
    expect(within(card).getByText('Entradas')).toBeTruthy();
  });

  it('cache tenant-aware: troca de mês refaz fetch com monthKey', async () => {
    renderDashboard();
    await waitFor(() => expect(getBalance).toHaveBeenCalled());
    expect([null, '2026-08']).toContain(getBalance.mock.calls[0]?.[0] ?? null);
    getBalance.mockClear();
    dashboardSearchParams = new URLSearchParams('month=2026-07');
    cleanup();
    renderDashboard();
    await waitFor(() => expect(getBalance).toHaveBeenCalledWith('2026-07'));
  });
});
