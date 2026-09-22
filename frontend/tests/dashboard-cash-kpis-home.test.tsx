import { cleanup, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import type { DashboardMonthEndCashPressureResponse } from '../src/services/dashboard/month-end-cash-pressure.types';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import { DashboardMonthlyCashFlowRequestError } from '../src/services/dashboard/monthly-cash-flow.types';
import type { DashboardMonthlyCashFlowResponse } from '../src/services/dashboard/monthly-cash-flow.types';
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
    inflows: {
      total: '224790.30', classified: '224790.30', uncategorized: '0', imprecise: '0', coverageRate: '100',
      items: [{ kind: 'category', key: 'cat-fixture', name: 'Consultas', amount: '224790.30', percentage: '100' }],
    },
    outflows: {
      total: '98941.52', classified: '98941.52', uncategorized: '0', imprecise: '0', coverageRate: '100',
      items: [{ kind: 'category', key: 'cat-fixture', name: 'Operacional', amount: '98941.52', percentage: '100' }],
    },
  },
  daily: {
    realized: [{ date: '2026-08-05', inflows: '224790.30', outflows: '0', result: '224790.30' }],
    expected: [
      { date: '2026-08-31', receivables: '10511.20', payables: '28289.80', result: '-17778.60' },
    ],
  },
};

const billingGoal: RevenueGoalSnapshot = {
  monthKey: '2026-08',
  target: '300000',
  actual: '235301.50',
  achievementRate: '78.433833',
  remaining: '64698.50',
  exceeded: '0',
  status: 'IN_PROGRESS',
  history: [],
};

const monthEnd: DashboardMonthEndCashPressureResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-19',
  to: '2026-08-31',
  summary: { receivable: '0', payable: '0', net: '0' },
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
  getMonthlyCashFlow.mockResolvedValue(lifeCashFlow);
  getRevenueGoal.mockResolvedValue(billingGoal);
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

describe('CASH-4B — KPIs de caixa na Home', () => {
  it('H1–H3 — Faturamento / Despesas / Resultado de caixa', async () => {
    await renderReadyDashboard();
    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/R\$\s*235\.301,50/)).toBeTruthy();
    });
    expect(kpiScope('Faturamento').getByText('Recebido')).toBeTruthy();
    expect(kpiScope('Faturamento').getByText(/R\$\s*224\.790,30/)).toBeTruthy();
    expect(kpiScope('A receber').getByText(/R\$\s*10\.511,20/)).toBeTruthy();
    expect(kpiScope('Despesas').getByText(/R\$\s*127\.231,32/)).toBeTruthy();
    expect(kpiScope('Contas a pagar').getByText(/R\$\s*28\.289,80/)).toBeTruthy();
    expect(kpiScope('Despesas').getByText(/^Pago$/)).toBeTruthy();
    expect(kpiScope('Despesas').getByText(/R\$\s*98\.941,52/)).toBeTruthy();
    expect(kpiScope('Despesas').getByText(/^A pagar$/)).toBeTruthy();
    expect(kpiScope('Despesas').getByText(/R\$\s*28\.289,80/)).toBeTruthy();
    expect(kpiScope('Resultado').getByText(/R\$\s*108\.070,18/)).toBeTruthy();
    expect(kpiScope('Faturamento').queryByText(/R\$\s*10\.000,00/)).toBeNull();
  });

  it('H11/H12 — Meta actual = billing (não competência)', async () => {
    await renderReadyDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-revenue-goal="behind"]')).toBeTruthy();
    });
    const goal = document.querySelector('[data-revenue-goal="behind"]') as HTMLElement;
    expect(within(goal).getByText(/R\$\s*235\.301,50/)).toBeTruthy();
    expect(getRevenueGoal).toHaveBeenCalled();
  });

  it('H13 — erro de cash-flow não faz fallback para monthly-revenue', async () => {
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
    expect(kpiScope('Faturamento').queryByText(/R\$\s*10\.000,00/)).toBeNull();
    expect(
      screen.getAllByText('Não foi possível carregar o fluxo de caixa do mês.').length,
    ).toBeGreaterThan(0);
  });

  it('H14 — Home cash-only carrega apenas MonthlyCashFlow', async () => {
    await renderReadyDashboard();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalled();
    });
  });

  it('H15 — situation não é enviada nem exibida como filtro', async () => {
    dashboardSearchParams = new URLSearchParams('situation=open');
    await renderReadyDashboard();
    await waitFor(() => {
      expect(getMonthlyCashFlow).toHaveBeenCalled();
    });
    expect(document.querySelector('[data-situation-selector]')).toBeNull();
    expect(getMonthlyCashFlow).toHaveBeenCalledWith(null, null, null);
    for (const args of getMonthlyCashFlow.mock.calls) {
      expect(args).not.toContain('open');
    }
  });

  it('H16 — inadimplência D1 (vencido agora + taxa global)', async () => {
    await renderReadyDashboard();
    const scope = within(
      document.querySelector('[data-financial-section="inadimplencia"]') as HTMLElement,
    );
    await waitFor(() => {
      expect(scope.getByText('Vencido agora')).toBeTruthy();
    });
    expect(scope.getByText('Taxa global (D1)')).toBeTruthy();
    expect(scope.getByText(/R\$\s*4\.200,00/)).toBeTruthy();
    expect(screen.queryByText('Taxa da competência')).toBeNull();
  });

  it('H10 — null CC mostra traço nos KPIs', async () => {
    getMonthlyCashFlow.mockResolvedValue({
      ...lifeCashFlow,
      costCenterCashSplit: false,
      billing: null,
      realized: { inflows: null, outflows: null, result: null },
      expected: { receivables: null, payables: null, result: null },
      overdue: {
        receivables: null,
        payables: null,
        ofMonth: { receivables: null, payables: null },
      },
    });
    dashboardSearchParams = new URLSearchParams(`costCenter=${CENTER}`);
    await renderReadyDashboard();
    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText('—')).toBeTruthy();
    });
    expect(kpiScope('Contas a pagar').getByText('—')).toBeTruthy();
    expect(kpiScope('Despesas').getByText('—')).toBeTruthy();
    expect(kpiScope('Resultado').getByText('—')).toBeTruthy();
    expect(kpiScope('Faturamento').queryByText(/R\$\s*0,00/)).toBeNull();
  });

  it('CORREÇÃO 05.1 — Contas a pagar sem rodapé de dias com vencimento', async () => {
    await renderReadyDashboard();
    const payableCard = kpiScope('Contas a pagar');
    await waitFor(() => {
      expect(payableCard.getByText(/R\$\s*28\.289,80/)).toBeTruthy();
    });
    expect(payableCard.queryByText(/dias? com vencimento/i)).toBeNull();
    expect(payableCard.queryByText('Sem vencimentos previstos')).toBeNull();
    expect(payableCard.queryByText(/% do faturamento/i)).toBeNull();
    expect(kpiScope('Faturamento').getByText('Recebido')).toBeTruthy();
    expect(kpiScope('Faturamento').getByText('A receber')).toBeTruthy();
  });

  it('CORREÇÃO 05.1 — Contas a pagar sem rodapé mesmo com vários dias na série', async () => {
    getMonthlyCashFlow.mockResolvedValue({
      ...lifeCashFlow,
      expected: { receivables: '10511.20', payables: '300.00', result: '10211.20' },
      daily: {
        realized: lifeCashFlow.daily.realized,
        expected: [
          { date: '2026-08-10', receivables: '0', payables: '100.00', result: '-100.00' },
          { date: '2026-08-15', receivables: '0', payables: '100.00', result: '-100.00' },
          { date: '2026-08-20', receivables: '10511.20', payables: '100.00', result: '10411.20' },
        ],
      },
    });
    await renderReadyDashboard();
    const payableCard = kpiScope('Contas a pagar');
    await waitFor(() => {
      expect(payableCard.getByText(/R\$\s*300,00/)).toBeTruthy();
    });
    expect(payableCard.queryByText(/dias? com vencimento/i)).toBeNull();
    expect(payableCard.queryByText(/% do faturamento/i)).toBeNull();
  });

  it('CORREÇÃO 05.1 — Contas a pagar sem rodapé quando série sem vencimentos', async () => {
    getMonthlyCashFlow.mockResolvedValue({
      ...lifeCashFlow,
      expected: { receivables: '10511.20', payables: '100.00', result: '10411.20' },
      daily: {
        realized: lifeCashFlow.daily.realized,
        expected: [
          { date: '2026-08-31', receivables: '10511.20', payables: '0', result: '10511.20' },
        ],
      },
    });
    await renderReadyDashboard();
    const payableCard = kpiScope('Contas a pagar');
    await waitFor(() => {
      expect(payableCard.getByText(/R\$\s*100,00/)).toBeTruthy();
    });
    expect(payableCard.queryByText('Sem vencimentos previstos')).toBeNull();
    expect(payableCard.queryByText(/dias? com vencimento/i)).toBeNull();
    expect(payableCard.queryByText(/% do faturamento/i)).toBeNull();
  });
});
