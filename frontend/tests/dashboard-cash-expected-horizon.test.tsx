import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import { getDashboardCashMovementHistory } from '../src/services/dashboard/cash-movement-history';
import { getDashboardCashExpectedHorizon } from '../src/services/dashboard/cash-expected-horizon';
import type { DashboardCashExpectedHorizonResponse } from '../src/services/dashboard/cash-expected-horizon.types';
import { getDashboardCashBalanceHistory } from '../src/services/dashboard/cash-balance-history';
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
  today: '2026-09-15',
  receivables: { open: '8.5', overdue: '3', upcoming: '5.5' },
  payables: { open: '20', overdue: '4', upcoming: '16' },
  delinquency: { overdueUnpaid: '3', openUnpaid: '8.5', rate: '35.2941' },
  integration: {
    status: 'CONNECTED',
    lastSuccessfulSyncAt: '2026-09-10T09:00:00.000Z',
    lastErrorCode: null,
  },
};

const revenueGoal: RevenueGoalSnapshot = {
  monthKey: '2026-09',
  actual: '100',
  target: '200',
  remaining: '100',
  exceeded: '0',
  achievementRate: '50',
  status: 'IN_PROGRESS',
  history: [],
};

function section(id: string) {
  return document.querySelector(`[data-financial-section="${id}"]`) as HTMLElement;
}

function buildHorizon(horizon: 3 | 6 | 12): DashboardCashExpectedHorizonResponse {
  const months = Array.from({ length: horizon }, (_, index) => {
    const date = new Date(Date.UTC(2026, 8 + index, 1));
    const key = `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
    return {
      monthKey: key,
      expected: {
        receivables: index === 0 ? '100' : '10',
        payables: index === 0 ? '40' : '5',
        result: index === 0 ? '60' : '5',
      },
    };
  });
  const receivables = months.reduce(
    (acc, month) => acc + Number(month.expected.receivables),
    0,
  );
  const payables = months.reduce((acc, month) => acc + Number(month.expected.payables), 0);
  return {
    today: '2026-09-15',
    startMonth: months[0]!.monthKey,
    endMonth: months[months.length - 1]!.monthKey,
    horizon,
    costCenterCashSplit: true,
    totals: {
      receivables: String(receivables),
      payables: String(payables),
      result: String(receivables - payables),
    },
    months,
  };
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

describe('Movimentação financeira — horizonte Previsto', () => {
  beforeEach(() => {
    dashboardSearchParams = new URLSearchParams('month=2026-09');
    getOverview.mockResolvedValue(syncedOverview);
    getMonthEnd.mockRejectedValue(new Error('not used'));
    getMonthlyCashFlow.mockResolvedValue({
      ...cashFlowHomeFixture,
      monthKey: '2026-09',
      today: '2026-09-15',
    });
    getHistory.mockResolvedValue({
      today: '2026-09-15',
      startMonth: '2025-10',
      endMonth: '2026-09',
      costCenterCashSplit: true,
      months: Array.from({ length: 12 }, (_, i) => {
        const date = new Date(Date.UTC(2025, 9 + i, 1));
        return {
          monthKey: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
          realized: { inflows: '10', outflows: '5', result: '5' },
        };
      }),
    });
    getHorizon.mockImplementation(async (options) => buildHorizon(options.horizon));
    getBalance.mockResolvedValue({
      today: '2026-09-15',
      availableFrom: null,
      availableTo: null,
      pointCount: 0,
      accountsIncluded: 0,
      coverage: 'none',
      daily: [],
      monthly: [],
    });
    getRevenueGoal.mockResolvedValue(revenueGoal);
    getCostCenters.mockResolvedValue({ items: [] });
    getCategories.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  async function openMonthlyExpected(scope: ReturnType<typeof within>) {
    fireEvent.click(scope.getByRole('button', { name: 'Mensal' }));
    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    expect(scope.getByRole('button', { name: 'Realizado' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    fireEvent.click(scope.getByRole('button', { name: 'Previsto' }));
  }

  it('Diária não mostra Realizado|Previsto nem horizonte; renderiza realizado', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    expect(await scope.findByRole('button', { name: 'Diária' })).toBeTruthy();
    expect(scope.queryByRole('button', { name: 'Realizado' })).toBeNull();
    expect(scope.queryByRole('button', { name: 'Previsto' })).toBeNull();
    expect(scope.queryByText(/Horizonte da previsão/i)).toBeNull();
    expect(scope.queryByRole('button', { name: 'Mês atual' })).toBeNull();
    expect(scope.getByText('Entradas e saídas por dia de baixa')).toBeTruthy();
    expect(getHorizon).not.toHaveBeenCalled();
  });

  it('controle de horizonte só em Mensal + Previsto; default 3 meses', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    expect(scope.queryByText(/Horizonte da previsão/i)).toBeNull();

    await openMonthlyExpected(scope);
    expect(scope.getByText(/Horizonte da previsão/i)).toBeTruthy();
    const horizonGroup = scope.getByRole('group', { name: /Horizonte da previsão/i });
    expect(within(horizonGroup).queryByRole('button', { name: 'Mês atual' })).toBeNull();
    expect(
      within(horizonGroup).getByRole('button', { name: '3 meses' }).getAttribute('aria-pressed'),
    ).toBe('true');
    await waitFor(() =>
      expect(getHorizon).toHaveBeenCalledWith(expect.objectContaining({ horizon: 3 })),
    );

    fireEvent.click(scope.getByRole('button', { name: 'Realizado' }));
    expect(scope.queryByText(/Horizonte da previsão/i)).toBeNull();
  });

  it('3/6/12 meses chamam novo endpoint com horizon e âncora; cruza o ano', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    await openMonthlyExpected(scope);

    await waitFor(() =>
      expect(getHorizon).toHaveBeenCalledWith(
        expect.objectContaining({
          monthKey: null,
          horizon: 3,
          costCenterId: null,
          categoryId: null,
        }),
      ),
    );
    expect(await scope.findByText('Saldo previsto')).toBeTruthy();
    expect(scope.getByText('A receber e a pagar por mês de vencimento')).toBeTruthy();
    expect(scope.getByText('SET/26')).toBeTruthy();
    expect(scope.queryByText('Saldo bancário')).toBeNull();

    fireEvent.click(scope.getByRole('button', { name: '6 meses' }));
    await waitFor(() =>
      expect(getHorizon).toHaveBeenCalledWith(expect.objectContaining({ horizon: 6 })),
    );
    expect(await scope.findByText('FEV/27')).toBeTruthy();

    fireEvent.click(scope.getByRole('button', { name: '12 meses' }));
    await waitFor(() =>
      expect(getHorizon).toHaveBeenCalledWith(expect.objectContaining({ horizon: 12 })),
    );
    expect(await scope.findByText('AGO/27')).toBeTruthy();
  });

  it('Previsto → Diária volta ao realizado; Diária → Mensal reabre Realizado', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    await openMonthlyExpected(scope);
    await waitFor(() => expect(getHorizon).toHaveBeenCalled());

    fireEvent.click(scope.getByRole('button', { name: 'Diária' }));
    expect(scope.getByRole('button', { name: 'Diária' }).getAttribute('aria-pressed')).toBe('true');
    expect(scope.queryByRole('button', { name: 'Previsto' })).toBeNull();
    expect(scope.getByText('Entradas e saídas por dia de baixa')).toBeTruthy();

    fireEvent.click(scope.getByRole('button', { name: 'Mensal' }));
    expect(scope.getByRole('button', { name: 'Realizado' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(scope.queryByText(/Horizonte da previsão/i)).toBeNull();
    expect(await scope.findByText(/12 meses até/i)).toBeTruthy();
  });

  it('card e expand compartilham a navegação Mensal → Previsto', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    fireEvent.click(scope.getByRole('button', { name: 'Mensal' }));
    await waitFor(() => expect(getHistory).toHaveBeenCalled());
    fireEvent.click(scope.getByRole('button', { name: 'Expandir' }));
    const dialog = await screen.findByRole('dialog');
    const dialogScope = within(dialog);
    expect(dialogScope.queryByRole('button', { name: 'Previsto' })).toBeTruthy();
    fireEvent.click(dialogScope.getByRole('button', { name: 'Previsto' }));
    expect(dialogScope.getByText(/Horizonte da previsão/i)).toBeTruthy();
    expect(dialogScope.queryByRole('button', { name: 'Mês atual' })).toBeNull();
    expect(
      dialogScope.getByRole('button', { name: '3 meses' }).getAttribute('aria-pressed'),
    ).toBe('true');
  });

  it('envia costCenter/category no horizonte', async () => {
    dashboardSearchParams = new URLSearchParams(
      'month=2026-07&costCenter=11111111-1111-4111-8111-111111111111&category=22222222-2222-4222-8222-222222222222',
    );
    getCostCenters.mockResolvedValue({
      items: [
        {
          id: '11111111-1111-4111-8111-111111111111',
          name: 'CC',
          code: null,
          active: true,
        },
      ],
    });
    getCategories.mockResolvedValue({
      items: [
        {
          id: '22222222-2222-4222-8222-222222222222',
          name: 'Cat',
          type: 'REVENUE',
        },
      ],
    });
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    await openMonthlyExpected(scope);
    await waitFor(() =>
      expect(getHorizon).toHaveBeenCalledWith(
        expect.objectContaining({
          horizon: 3,
          monthKey: '2026-07',
          costCenterId: '11111111-1111-4111-8111-111111111111',
          categoryId: '22222222-2222-4222-8222-222222222222',
        }),
      ),
    );
  });

  it('troca de tenant não reutiliza cache de previsão do tenant anterior', async () => {
    renderDashboard();
    const scope = within(section('movimentacao-financeira'));
    await scope.findByRole('button', { name: 'Mensal' });
    await openMonthlyExpected(scope);
    await waitFor(() => expect(getHorizon).toHaveBeenCalledTimes(1));
    cleanup();
    getHorizon.mockClear();
    renderWithAuth(
      <ThemeProvider>
        <DashboardPage />
      </ThemeProvider>,
      {
        getCurrentUserAction: createAuthenticatedGetCurrentUser({
          ...mockAuthenticatedUser,
          id: 'user-2',
          tenantId: 'tenant-2',
        }),
        hydrateOnMount: true,
      },
    );
    const next = within(section('movimentacao-financeira'));
    await next.findByRole('button', { name: 'Mensal' });
    fireEvent.click(next.getByRole('button', { name: 'Mensal' }));
    fireEvent.click(next.getByRole('button', { name: 'Previsto' }));
    await waitFor(() => expect(getHorizon).toHaveBeenCalledTimes(1));
  });
});
