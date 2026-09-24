import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import type { DashboardMonthEndCashPressureResponse } from '../src/services/dashboard/month-end-cash-pressure.types';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import type { DashboardMonthlyCashFlowResponse } from '../src/services/dashboard/monthly-cash-flow.types';
import { getDashboardReceivableStockDetails } from '../src/services/dashboard/receivable-stock-details';
import { getDashboardExpectedReceivableDetails } from '../src/services/dashboard/expected-receivable-details';
import { getDashboardExpectedPayableDetails } from '../src/services/dashboard/expected-payable-details';
import { getDashboardRevenueGoal } from '../src/services/dashboard/revenue-goal';
import type { RevenueGoalSnapshot } from '../src/services/dashboard/revenue-goal.types';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import { ThemeProvider } from '../src/theme';
import {
  cashFlowHomeFixture,
  emptyCashCategoryComposition,
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
vi.mock('../src/services/dashboard/receivable-stock-details', () => ({
  getDashboardReceivableStockDetails: vi.fn(),
}));
vi.mock('../src/services/dashboard/expected-receivable-details', () => ({
  getDashboardExpectedReceivableDetails: vi.fn(),
}));
vi.mock('../src/services/dashboard/expected-payable-details', () => ({
  getDashboardExpectedPayableDetails: vi.fn(),
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
const getReceivableStockDetails = vi.mocked(getDashboardReceivableStockDetails);
const getExpectedReceivableDetails = vi.mocked(getDashboardExpectedReceivableDetails);
const getExpectedPayableDetails = vi.mocked(getDashboardExpectedPayableDetails);
const getRevenueGoal = vi.mocked(getDashboardRevenueGoal);
const getCostCenters = vi.mocked(getDashboardCostCenters);
const getCategories = vi.mocked(getDashboardCategories);

const syncedOverview: DashboardOverviewResponse = {
  today: '2026-08-19',
  receivables: { open: '8.5', overdue: '0', upcoming: '8.5' },
  payables: { open: '20', overdue: '0', upcoming: '20' },
  delinquency: { overdueUnpaid: '0', openUnpaid: '8.5', rate: '0' },
  integration: {
    status: 'CONNECTED',
    lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
    lastErrorCode: null,
  },
};

const cashWithCategories: DashboardMonthlyCashFlowResponse = {
  ...cashFlowHomeFixture,
  billing: '999999.99',
  realized: { inflows: '888888.88', outflows: '111111.11', result: '777777.77' },
  expected: { receivables: '111111.11', payables: '22222.22', result: '88888.89' },
  overdue: {
    receivables: '0',
    payables: '0',
    ofMonth: { receivables: '0', payables: '0' },
  },
  realizedByCategory: {
    inflows: singleCashCategoryComposition('Serviços', '888888.88'),
    outflows: singleCashCategoryComposition('Salários', '111111.11'),
  },
};

const previousMonthCashFlow: DashboardMonthlyCashFlowResponse = {
  ...cashWithCategories,
  monthKey: '2026-07',
  billing: '500000.00',
  realized: { inflows: '400000.00', outflows: '100000.00', result: '300000.00' },
  expected: { receivables: '0', payables: '0', result: '0' },
  realizedByCategory: {
    inflows: emptyCashCategoryComposition('0'),
    outflows: emptyCashCategoryComposition('0'),
  },
  daily: {
    realized: [
      { date: '2026-07-10', inflows: '400000.00', outflows: '100000.00', result: '300000.00' },
    ],
    expected: [],
  },
};

const monthEnd: DashboardMonthEndCashPressureResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-19',
  to: '2026-08-31',
  summary: { receivable: '111111.11', payable: '22222.22', net: '88888.89' },
};

const goal: RevenueGoalSnapshot = {
  monthKey: '2026-08',
  target: '1000000',
  actual: '999999.99',
  achievementRate: '99.999999',
  remaining: '0.01',
  exceeded: null,
  status: 'IN_PROGRESS',
  history: [],
};

function section(id: string): HTMLElement {
  const node = document.querySelector(`[data-financial-section="${id}"]`);
  expect(node).toBeTruthy();
  return node as HTMLElement;
}

function kpiScope(title: string) {
  const heading = within(section('resumo-financeiro')).getByRole('heading', { name: title });
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

async function openKpiExpand(title: string) {
  renderDashboard();
  const scope = await waitFor(() => {
    const card = kpiScope(title);
    expect(card.getByRole('button', { name: 'Expandir' })).toBeTruthy();
    return card;
  });
  fireEvent.click(scope.getByRole('button', { name: 'Expandir' }));
  return screen.findByRole('dialog');
}

async function openSectionExpand(sectionId: string) {
  renderDashboard();
  const scope = await waitFor(() => {
    const node = within(section(sectionId));
    expect(node.getByRole('button', { name: 'Expandir' })).toBeTruthy();
    return node;
  });
  fireEvent.click(scope.getByRole('button', { name: 'Expandir' }));
  return screen.findByRole('dialog');
}

beforeEach(() => {
  dashboardSearchParams = new URLSearchParams();
  getOverview.mockResolvedValue(syncedOverview);
  getMonthEnd.mockResolvedValue(monthEnd);
  getMonthlyCashFlow.mockImplementation(async (month) =>
    month === '2026-07' ? previousMonthCashFlow : cashWithCategories,
  );
  getReceivableStockDetails.mockResolvedValue({
    today: '2026-08-19',
    available: true,
    total: '111111.11',
    overdue: '1.00',
    dueToday: '0',
    upcoming: '111110.11',
    items: [],
  });
  getExpectedReceivableDetails.mockResolvedValue({
    today: '2026-08-19',
    monthKey: '2026-08',
    from: '2026-08-01',
    to: '2026-08-31',
    available: true,
    total: '0',
    items: [],
  });
  getExpectedPayableDetails.mockResolvedValue({
    today: '2026-08-19',
    monthKey: '2026-08',
    from: '2026-08-01',
    to: '2026-08-31',
    available: true,
    total: '0',
    items: [],
  });
  getRevenueGoal.mockResolvedValue(goal);
  getCostCenters.mockResolvedValue({ items: [] });
  getCategories.mockResolvedValue({ items: [] });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('PRE-F13-HOME-POLISH-3 — detalhamento analítico', () => {
  it('P3-1/P3-2/P3-3/P3-4 — Faturamento ranking realized inflows, título explícito', async () => {
    const dialog = await openKpiExpand('Faturamento');
    expect(within(dialog).getByText('Categorias das entradas realizadas')).toBeTruthy();
    expect(within(dialog).queryByText(/Maiores categorias do faturamento/i)).toBeNull();
    expect(within(dialog).queryByText(/A receber restante por vencimento/i)).toBeNull();
    expect(within(dialog).getByText('Entradas realizadas')).toBeTruthy();
    expect(within(dialog).getByText('Serviços')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*888\.888,88/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/111\.111,11.*Serviços|Serviços.*111\.111,11/)).toBeNull();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('P3-6 — A receber lista estoque em aberto sem composição categórica agregada', async () => {
    const dialog = await openKpiExpand('A receber');
    expect(within(dialog).getByText('Títulos em aberto')).toBeTruthy();
    expect(
      within(dialog).queryByText(/Composição por categoria do previsto não disponível/i),
    ).toBeNull();
    expect(within(dialog).queryByText('Dias com vencimento')).toBeNull();
    expect(within(dialog).queryByText(/não entram neste total/i)).toBeNull();
  });

  it('P3-7/P3-8/P3-9 — Despesas ranking realized outflows', async () => {
    const dialog = await openKpiExpand('Despesas');
    expect(within(dialog).getByText('Maiores categorias das saídas realizadas')).toBeTruthy();
    expect(within(dialog).getByText('Salários')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*111\.111,11/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/222\.222,22.*Salários/)).toBeNull();
  });

  it('P3-10/P3-11/P3-12 — Resultado explica billing − despesas e quadro superior', async () => {
    const dialog = await openKpiExpand('Resultado');
    expect(within(dialog).getByText('Faturamento')).toBeTruthy();
    expect(within(dialog).getByText('(−) Despesas')).toBeTruthy();
    expect(within(dialog).getByText('Resultado projetado')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*999\.999,99/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/R\$\s*133\.333,33/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText(/R\$\s*866\.666,66/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('Realizado')).toBeNull();
    expect(within(dialog).queryByText('Previsto restante')).toBeNull();
    expect(within(dialog).queryByText('Resultado realizado')).toBeNull();
  });

  it('P3-13/P3-14/P3-15 — Movimentação financeira no principal; rankings ficam nos donuts', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Movimentação financeira' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Entradas × Saídas' })).toBeNull();
    const dialog = await openSectionExpand('movimentacao-financeira');
    expect(within(dialog).getByRole('heading', { name: 'Movimentação financeira' })).toBeTruthy();
    expect(within(dialog).queryByText('Principais entradas por categoria')).toBeNull();
    expect(within(dialog).queryByText('Principais saídas por categoria')).toBeNull();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const revenueDialog = await openSectionExpand('receitas-categoria');
    expect(within(revenueDialog).getAllByText('Serviços').length).toBeGreaterThan(0);
    fireEvent.click(within(revenueDialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
    const expenseDialog = await openSectionExpand('despesas-categoria');
    expect(within(expenseDialog).getAllByText('Salários').length).toBeGreaterThan(0);
  });

  it('P3-16/P3-17/P3-18 — transferências e competência fora; KPIs estáveis', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();
    });
    expect(kpiScope('Contas a pagar').getByText(/R\$\s*22\.222,22/)).toBeTruthy();
    expect(kpiScope('Despesas').getByText(/R\$\s*133\.333,33/)).toBeTruthy();
    fireEvent.click(kpiScope('Faturamento').getByRole('button', { name: 'Expandir' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/transferência/i)).toBeNull();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('P3-19 — donuts na Home permanecem', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Receitas por categoria' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Despesas por categoria' })).toBeTruthy();
    await waitFor(() => {
      expect(within(section('receitas-categoria')).getByText('Serviços')).toBeTruthy();
    });
  });

  it('P3-21/P3-22 — modal responsivo e tema', async () => {
    const dialog = await openKpiExpand('Despesas');
    expect(dialog.className).toMatch(/dialog/i);
    expect(within(dialog).getByRole('button', { name: 'Fechar' })).toBeTruthy();
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });
});
