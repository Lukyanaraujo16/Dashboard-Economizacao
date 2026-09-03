/** @vitest-environment jsdom */
import {
  cleanup,
  fireEvent,
  screen,
  waitFor,
  within,
  act,
} from '@testing-library/react';
import { useSyncExternalStore } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ThemeProvider } from '../src/theme';
import { DashboardPage } from '../src/components/dashboard/dashboard-page';
import {
  createDashboardFilterCache,
  dashboardCashFlowCacheKey,
  dashboardFilterCacheKey,
} from '../src/lib/dashboard-filter-cache';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import { getDashboardMonthlyExpenses } from '../src/services/dashboard/monthly-expenses';
import { getDashboardMonthlyRevenue } from '../src/services/dashboard/monthly-revenue';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import { getDashboardRevenueGoal } from '../src/services/dashboard/revenue-goal';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import type { DashboardMonthlyRevenueResponse } from '../src/services/dashboard/monthly-revenue.types';
import type { DashboardMonthlyExpenseResponse } from '../src/services/dashboard/monthly-expenses.types';
import type { DashboardMonthEndCashPressureResponse } from '../src/services/dashboard/month-end-cash-pressure.types';
import type { RevenueGoalSnapshot } from '../src/services/dashboard/revenue-goal.types';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';
import { cashFlowHomeFixture } from './helpers/monthly-cash-flow-fixture';

const CENTER_A = '11111111-1111-4111-8111-111111111111';
const CENTER_B = '22222222-2222-4222-8222-222222222222';

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

const pushMock = vi.fn((href: string) => {
  const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
  setSearchParams(new URLSearchParams(qs));
});

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: vi.fn((href: string) => {
      const qs = href.includes('?') ? href.slice(href.indexOf('?') + 1) : '';
      setSearchParams(new URLSearchParams(qs));
    }),
    push: (href: string) => pushMock(href),
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
const getMonthlyExpenses = vi.mocked(getDashboardMonthlyExpenses);
const getMonthlyRevenue = vi.mocked(getDashboardMonthlyRevenue);
const getMonthlyCashFlow = vi.mocked(getDashboardMonthlyCashFlow);
const getRevenueGoal = vi.mocked(getDashboardRevenueGoal);
const getCostCenters = vi.mocked(getDashboardCostCenters);
const getCategories = vi.mocked(getDashboardCategories);

const syncedOverview: DashboardOverviewResponse = {
  today: '2026-08-21',
  receivables: { open: '8.5', overdue: '3', upcoming: '5.5' },
  payables: { open: '20', overdue: '4', upcoming: '16' },
  delinquency: { overdueUnpaid: '3', openUnpaid: '8.5', rate: '35.2941' },
  integration: {
    status: 'CONNECTED',
    lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
    lastErrorCode: null,
  },
};

function revenueWithTotal(total: string): DashboardMonthlyRevenueResponse {
  return {
    today: '2026-08-21',
    monthKey: '2026-08',
    from: '2026-08-01',
    to: '2026-08-31',
    receivables: {
      total,
      received: total,
      outstanding: '0',
      overdue: '0',
      classified: total,
      uncategorized: '0',
      imprecise: '0',
      coverageRate: '100',
      items: [
        {
          kind: 'category',
          name: 'Serviços',
          amount: total,
          received: total,
          outstanding: '0',
          percentage: '100',
        },
      ],
      daily: [],
    },
  };
}

const emptyExpenses: DashboardMonthlyExpenseResponse = {
  today: '2026-08-21',
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

const emptyMonthEnd: DashboardMonthEndCashPressureResponse = {
  today: '2026-08-21',
  monthKey: '2026-08',
  from: '2026-08-21',
  to: '2026-08-31',
  summary: { receivable: '0', payable: '0', net: '0' },
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

function renderDashboard() {
  return renderWithAuth(
    <ThemeProvider>
      <DashboardPage />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(mockAuthenticatedUser, {
        active: false,
      }),
      hydrateOnMount: true,
    },
  );
}

describe('dashboardFilterCache', () => {
  it('chave e get/set', () => {
    const TENANT = 'tenant-1';
    expect(dashboardFilterCacheKey(TENANT, '2026-08', null)).toBe(`${TENANT}|2026-08|||`);
    expect(dashboardFilterCacheKey(TENANT, '2026-08', CENTER_A)).toBe(
      `${TENANT}|2026-08|${CENTER_A}||`,
    );
    expect(dashboardCashFlowCacheKey(TENANT, '2026-08', CENTER_A, null)).toBe(
      `${TENANT}|2026-08|${CENTER_A}|`,
    );
    expect(dashboardCashFlowCacheKey(TENANT, '2026-08', CENTER_A, null)).not.toContain('open');
    const cache = createDashboardFilterCache<string>();
    cache.set('k', 'v');
    expect(cache.get('k')).toBe('v');
  });
});

describe('CC1.3.1 soft filter refresh', () => {
  beforeEach(() => {
    setSearchParams(new URLSearchParams());
    pushMock.mockClear();
    getOverview.mockResolvedValue(syncedOverview);
    getMonthEnd.mockResolvedValue(emptyMonthEnd);
    getMonthlyExpenses.mockResolvedValue(emptyExpenses);
    getMonthlyRevenue.mockResolvedValue(revenueWithTotal('1000'));
    getMonthlyCashFlow.mockResolvedValue(cashFlowHomeFixture);
    getRevenueGoal.mockResolvedValue(emptyGoal);
    getCostCenters.mockResolvedValue({
      items: [
        { id: CENTER_A, name: 'Jacaraípe', code: null, active: true },
        { id: CENTER_B, name: 'Laranjeiras', code: null, active: true },
      ],
    });
    getCategories.mockResolvedValue({ items: [] });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it('clique na tab atualiza URL e tab ativa sem loading global', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-filter-stable="true"]')).toBeTruthy();

    let resolveCenter: ((value: DashboardMonthlyRevenueResponse) => void) | null = null;
    getMonthlyRevenue.mockImplementation((_month, costCenterId) => {
      if (costCenterId === CENTER_A) {
        return new Promise((resolve) => {
          resolveCenter = resolve;
        });
      }
      return Promise.resolve(revenueWithTotal('1000'));
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Jacaraípe' }));
    expect(pushMock).toHaveBeenCalled();
    expect(String(pushMock.mock.calls.at(-1)?.[0])).toContain(`costCenter=${CENTER_A}`);

    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Jacaraípe' }).getAttribute('aria-selected')).toBe(
        'true',
      );
    });

    // Durante o fetch soft: Home permanece ready; tablist presente
    expect(document.querySelector('[data-overview-state="loading"]')).toBeNull();
    expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Centros de custo' })).toBeTruthy();

    await act(async () => {
      resolveCenter?.(revenueWithTotal('4000'));
    });
    await waitFor(() => {
      expect(getOverview).toHaveBeenCalledWith(CENTER_A);
    });
  });

  it('empresa sem centros não exibe seletor', async () => {
    getCostCenters.mockResolvedValue({ items: [] });
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-cost-center-selector]')).toBeNull();
  });

  it('troca rápida A→B: tab final é B e overview não cai em loading', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    });

    const resolvers: Array<(value: DashboardMonthlyRevenueResponse) => void> = [];
    getMonthlyRevenue.mockImplementation(() => {
      return new Promise((resolve) => {
        resolvers.push(resolve);
      });
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Jacaraípe' }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Jacaraípe' }).getAttribute('aria-selected')).toBe(
        'true',
      );
    });
    fireEvent.click(screen.getByRole('tab', { name: 'Laranjeiras' }));
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Laranjeiras' }).getAttribute('aria-selected')).toBe(
        'true',
      );
    });

    expect(document.querySelector('[data-overview-state="loading"]')).toBeNull();

    // Resolve todas as promises pendentes (incl. abortadas)
    await act(async () => {
      for (const resolve of resolvers) {
        resolve(revenueWithTotal('999'));
      }
    });

    await waitFor(() => {
      expect(getOverview.mock.calls.some((call) => call[0] === CENTER_B)).toBe(true);
    });
    expect(screen.getByRole('tab', { name: 'Laranjeiras' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(within(screen.getByRole('tablist')).getByRole('tab', { name: 'Todos' })).toBeTruthy();
  });

  it('Todos → centro → Todos: URL limpa costCenter e tab Todos ativa', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(screen.getByRole('tab', { name: 'Todos' })).toBeTruthy();
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Jacaraípe' }));
    await waitFor(() => {
      expect(paramsStore.get('costCenter')).toBe(CENTER_A);
    });

    fireEvent.click(screen.getByRole('tab', { name: 'Todos' }));
    await waitFor(() => {
      expect(paramsStore.get('costCenter')).toBeNull();
      expect(screen.getByRole('tab', { name: 'Todos' }).getAttribute('aria-selected')).toBe('true');
    });
    expect(document.querySelector('[data-overview-state="loading"]')).toBeNull();
  });

  it('troca de categoria atualiza URL sem reload e propaga aos fetches', async () => {
    const categoryId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    getCategories.mockResolvedValue({
      items: [{ id: categoryId, name: 'Serviços', type: 'REVENUE' }],
    });
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-overview-state="ready"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-situation-selector]')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: /Categoria:/ }));
    fireEvent.click(screen.getByRole('option', { name: 'Serviços' }));
    await waitFor(() => {
      expect(paramsStore.get('category')).toBe(categoryId);
    });

    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalledWith(null, null, categoryId);
      expect(getMonthEnd).not.toHaveBeenCalled();
    });
    expect(getMonthlyRevenue).not.toHaveBeenCalled();
    expect(getMonthlyExpenses).not.toHaveBeenCalled();
    expect(getRevenueGoal.mock.calls.every((call) => call.length === 1)).toBe(true);
  });
});
