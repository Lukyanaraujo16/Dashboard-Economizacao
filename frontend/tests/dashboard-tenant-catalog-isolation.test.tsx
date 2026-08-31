/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  act,
} from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../src/theme';
import { DashboardPage } from '../src/components/dashboard/dashboard-page';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import { getDashboardCashFlowForecast } from '../src/services/dashboard/forecast';
import { getDashboardMonthlyExpenses } from '../src/services/dashboard/monthly-expenses';
import { getDashboardMonthlyRevenue } from '../src/services/dashboard/monthly-revenue';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import { getDashboardRevenueGoal } from '../src/services/dashboard/revenue-goal';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import type { DashboardMonthEndCashPressureResponse } from '../src/services/dashboard/month-end-cash-pressure.types';
import type { DashboardMonthlyExpenseResponse } from '../src/services/dashboard/monthly-expenses.types';
import type { DashboardMonthlyRevenueResponse } from '../src/services/dashboard/monthly-revenue.types';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';
import { cashFlowHomeFixture } from './helpers/monthly-cash-flow-fixture';

const TENANT_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const TENANT_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const CAT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const CAT_B = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

let paramsStore = new URLSearchParams();
let paramsEpoch = 0;
const paramsListeners = new Set<() => void>();

function emitParams() {
  paramsEpoch += 1;
  for (const listener of paramsListeners) {
    listener();
  }
}

function setSearchParams(next: URLSearchParams) {
  paramsStore = next;
  emitParams();
}

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn((href: string) => {
      const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
      setSearchParams(new URLSearchParams(qs));
    }),
    push: vi.fn((href: string) => {
      const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
      setSearchParams(new URLSearchParams(qs));
    }),
  }),
  usePathname: () => '/',
  useSearchParams: () =>
    useSyncExternalStore(
      (onStoreChange) => {
        paramsListeners.add(onStoreChange);
        return () => paramsListeners.delete(onStoreChange);
      },
      () => {
        void paramsEpoch;
        return paramsStore;
      },
      () => paramsStore,
    ),
}));

vi.mock('../src/services/dashboard/overview', () => ({ getDashboardOverview: vi.fn() }));
vi.mock('../src/services/dashboard/month-end-cash-pressure', () => ({
  getDashboardMonthEndCashPressure: vi.fn(),
}));
vi.mock('../src/services/dashboard/forecast', () => ({ getDashboardCashFlowForecast: vi.fn() }));
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
vi.mock('../src/services/dashboard/cost-centers', () => ({ getDashboardCostCenters: vi.fn() }));
vi.mock('../src/services/dashboard/categories', () => ({ getDashboardCategories: vi.fn() }));

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
  integration: {
    status: 'CONNECTED',
    lastSuccessfulSyncAt: '2026-08-19T12:00:00.000Z',
    lastErrorCode: null,
  },
  receivables: { open: '0', overdue: '0', upcoming: '0' },
  payables: { open: '0', overdue: '0', upcoming: '0' },
  delinquency: { rate: null, openUnpaid: '0', overdueUnpaid: '0' },
};

const emptyMonthEnd: DashboardMonthEndCashPressureResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-19',
  to: '2026-08-31',
  summary: { receivable: '0', payable: '0', net: '0' },
};

const emptyExpenses: DashboardMonthlyExpenseResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  payables: {
    total: '0',
    paid: '0',
    outstanding: '0',
    overdue: '0',
    classified: '0',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: null,
    items: [],
    daily: [],
  },
};

const emptyRevenue: DashboardMonthlyRevenueResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  receivables: {
    total: '0',
    received: '0',
    outstanding: '0',
    overdue: '0',
    classified: '0',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: null,
    items: [],
    daily: [],
  },
};

function stubDashboardApis() {
  getOverview.mockResolvedValue(syncedOverview);
  getMonthEnd.mockResolvedValue(emptyMonthEnd);
  getForecast.mockResolvedValue({
    today: '2026-08-19',
    from: '2026-08-19',
    to: '2026-11-17',
    horizonDays: 90,
    buckets: [{ key: '2026-08', inflows: '0', outflows: '0', net: '0' }],
  });
  getMonthlyExpenses.mockResolvedValue(emptyExpenses);
  getMonthlyRevenue.mockResolvedValue(emptyRevenue);
  getMonthlyCashFlow.mockResolvedValue(cashFlowHomeFixture);
  getRevenueGoal.mockResolvedValue({
    monthKey: '2026-08',
    target: null,
    actual: '0',
    achievementRate: null,
    remaining: null,
    exceeded: null,
    status: 'NO_TARGET',
    history: [],
  });
  getCostCenters.mockResolvedValue({ items: [] });
}

function renderDashboardWithSupport(tenantId: string, tenantDisplayName: string) {
  return renderWithAuth(
    <ThemeProvider>
      <DashboardPage />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(
        { ...mockAuthenticatedUser, role: 'SUPER_ADMIN', tenantId: null },
        {
          active: true,
          tenantId,
          tenantDisplayName,
          startedAt: '2026-01-01T00:00:00.000Z',
          supportSessionId: 'ss-1',
        },
      ),
      hydrateOnMount: true,
    },
  );
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  paramsStore = new URLSearchParams();
  paramsEpoch = 0;
});

describe('Dashboard tenant catalog isolation', () => {
  beforeEach(() => {
    stubDashboardApis();
    getCategories.mockClear();
  });

  it('troca de tenant recarrega catálogo e remove seleção incompatível', async () => {
    getCategories
      .mockResolvedValueOnce({
        items: [{ id: CAT_A, name: 'Receita A', type: 'REVENUE' }],
      })
      .mockResolvedValueOnce({
        items: [{ id: CAT_B, name: 'Despesa B', type: 'EXPENSE' }],
      });

    const first = renderDashboardWithSupport(TENANT_A, 'Empresa A');
    await waitFor(() => expect(getCategories).toHaveBeenCalledTimes(1));
    first.unmount();

    setSearchParams(new URLSearchParams(`category=${CAT_A}`));
    renderDashboardWithSupport(TENANT_B, 'Empresa B');
    await waitFor(() => expect(getCategories).toHaveBeenCalledTimes(2));

    await waitFor(() => {
      expect(paramsStore.get('category')).toBeNull();
    });
  });

  it('request atrasado de categorias do tenant A não sobrescreve tenant B', async () => {
    let resolveSlow: ((value: { items: { id: string; name: string; type: 'REVENUE' }[] }) => void) | null =
      null;
    const slowPromise = new Promise<{ items: { id: string; name: string; type: 'REVENUE' }[] }>(
      (resolve) => {
        resolveSlow = resolve;
      },
    );

    getCategories
      .mockImplementationOnce(() => slowPromise)
      .mockResolvedValueOnce({
        items: [{ id: CAT_B, name: 'Despesa B', type: 'EXPENSE' }],
      });

    const first = renderDashboardWithSupport(TENANT_A, 'Empresa A');
    await waitFor(() => expect(getCategories).toHaveBeenCalledTimes(1));
    first.unmount();

    renderDashboardWithSupport(TENANT_B, 'Empresa B');
    await waitFor(() => expect(getCategories).toHaveBeenCalledTimes(2));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Categoria:/ })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('button', { name: /Categoria:/ }));
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Despesa B' })).toBeTruthy();
    });
    expect(screen.queryByRole('option', { name: 'Receita A' })).toBeNull();

    await act(async () => {
      resolveSlow?.({
        items: [{ id: CAT_A, name: 'Receita A', type: 'REVENUE' }],
      });
    });

    expect(screen.queryByText('Receita A')).toBeNull();
    const trigger = screen.getByRole('button', { name: /Categoria:/ });
    if (trigger.getAttribute('aria-expanded') === 'true') {
      fireEvent.click(trigger);
    }
    fireEvent.click(trigger);
    await waitFor(() => {
      expect(screen.getByRole('option', { name: 'Despesa B' })).toBeTruthy();
    });
    expect(screen.queryByRole('option', { name: 'Receita A' })).toBeNull();
  });
});
