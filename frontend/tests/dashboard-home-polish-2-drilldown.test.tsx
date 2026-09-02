import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
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
import { getDashboardRevenueGoal } from '../src/services/dashboard/revenue-goal';
import type { RevenueGoalSnapshot } from '../src/services/dashboard/revenue-goal.types';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import { ThemeProvider } from '../src/theme';
import {
  cashFlowHomeFixture,
  emptyCashCategoryComposition,
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
  receivables: { open: '8.5', overdue: '0', upcoming: '8.5' },
  payables: { open: '20', overdue: '0', upcoming: '20' },
  delinquency: { overdueUnpaid: '0', openUnpaid: '8.5', rate: '0' },
  integration: {
    status: 'CONNECTED',
    lastSuccessfulSyncAt: '2026-08-10T09:00:00.000Z',
    lastErrorCode: null,
  },
};

const cashZeroOverdue: DashboardMonthlyCashFlowResponse = {
  ...cashFlowHomeFixture,
  overdue: {
    receivables: '0',
    payables: '0',
    ofMonth: { receivables: '0', payables: '0' },
  },
};

const previousMonthCashFlow: DashboardMonthlyCashFlowResponse = {
  ...cashFlowHomeFixture,
  monthKey: '2026-07',
  billing: '500000.00',
  realized: { inflows: '400000.00', outflows: '100000.00', result: '300000.00' },
  expected: { receivables: '0', payables: '0', result: '0' },
  overdue: {
    receivables: '0',
    payables: '0',
    ofMonth: { receivables: '0', payables: '0' },
  },
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

const forecast: DashboardCashFlowForecastResponse = {
  today: '2026-08-19',
  from: '2026-08-19',
  to: '2026-11-17',
  horizonDays: 90,
  buckets: [
    { key: '2026-08', inflows: '50000.00', outflows: '20000.00', net: '30000.00' },
    { key: '2026-09', inflows: '10000.00', outflows: '40000.00', net: '-30000.00' },
  ],
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

beforeEach(() => {
  dashboardSearchParams = new URLSearchParams();
  getOverview.mockResolvedValue(syncedOverview);
  getMonthEnd.mockResolvedValue(monthEnd);
  getForecast.mockResolvedValue(forecast);
  getMonthlyCashFlow.mockImplementation(async (month) =>
    month === '2026-07' ? previousMonthCashFlow : cashZeroOverdue,
  );
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

describe('PRE-F13-HOME-POLISH-2 — drill-down e cobertura', () => {
  it('P2-5/P2-6/P2-7 — Inadimplência zero com empty state honesto', async () => {
    const dialog = await openSectionExpand('inadimplencia');
    expect(within(dialog).getByRole('heading', { name: 'Inadimplência' })).toBeTruthy();
    expect(within(dialog).getByText('Vencido agora')).toBeTruthy();
    expect(within(dialog).getByText(/R\$\s*0,00/)).toBeTruthy();
    expect(
      within(dialog).getByText('Nenhum valor a receber vencido no momento.'),
    ).toBeTruthy();
    expect(within(dialog).queryByText(/Cliente/i)).toBeNull();
    expect(within(dialog).queryByText(/parcela/i)).toBeNull();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('P2-9 — A receber abre via KPI', async () => {
    const dialog = await openKpiExpand('A receber');
    expect(within(dialog).getByRole('heading', { name: 'A receber' })).toBeTruthy();
  });

  it('P2-10 — Despesas abre via KPI', async () => {
    const dialog = await openKpiExpand('Despesas');
    expect(within(dialog).getByRole('heading', { name: 'Despesas' })).toBeTruthy();
    expect(within(dialog).getByText('Pago')).toBeTruthy();
  });

  it('P2-11 — Contas a pagar abre via KPI', async () => {
    const dialog = await openKpiExpand('Contas a pagar');
    expect(within(dialog).getByRole('heading', { name: 'Contas a pagar' })).toBeTruthy();
    expect(within(dialog).getByText('Total a pagar')).toBeTruthy();
  });

  it('P2-12 — Resultado abre via KPI', async () => {
    const dialog = await openKpiExpand('Resultado');
    expect(within(dialog).getByRole('heading', { name: 'Resultado' })).toBeTruthy();
  });

  it('P2-13 — Faturamento abre via KPI', async () => {
    const dialog = await openKpiExpand('Faturamento');
    expect(within(dialog).getByRole('heading', { name: 'Faturamento' })).toBeTruthy();
  });

  it('P2-14/P2-15/P2-16 — Fluxo previsto abre forecast sem realized', async () => {
    const dialog = await openSectionExpand('fluxo-previsto');
    expect(within(dialog).getByRole('heading', { name: 'Fluxo previsto' })).toBeTruthy();
    expect(within(dialog).getByText(/Horizonte de 90 dias/i)).toBeTruthy();
    expect(within(dialog).getByText('Maior entrada prevista')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*50\.000,00/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
    expect(within(dialog).getByText(/não o saldo bancário/i)).toBeTruthy();
  });

  it('P2-17 — Comparativo mensal removido da Home (08-B.4)', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-cash-flow-state="ready"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-financial-section="comparativo-mensal"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Comparativo mensal' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Movimentação financeira' })).toBeTruthy();
  });

  it('P2-18 — Movimentação permanece funcionando com toggle', async () => {
    const dialog = await openSectionExpand('movimentacao-financeira');
    expect(within(dialog).getByRole('heading', { name: 'Movimentação financeira' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Realizado' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Previsto' })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Previsto' }));
    await waitFor(() => {
      expect(within(dialog).getAllByText(/vencimento/i).length).toBeGreaterThan(0);
    });
  });

  it('P2-19 — Meta permanece funcionando', async () => {
    const dialog = await openSectionExpand('meta-faturamento');
    expect(within(dialog).getByRole('heading', { name: 'Meta de faturamento' })).toBeTruthy();
  });

  it('P2-20/P2-21/P2-22 — barras A receber semânticas; sem modal Já recebido', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();
    });
    expect(screen.queryByRole('button', { name: 'Abrir detalhe de Já recebido' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Leitura executiva' })).toBeNull();

    fireEvent.click(kpiScope('A receber').getByRole('button', { name: 'Expandir' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getAllByText(/vencimento/i).length).toBeGreaterThan(0);
    // fixture tem um único dia de expected → uma barra é válida
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('P2-23/P2-24/P2-25 — competência fora; KPIs estáveis; transferências neutras', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();
    });
    expect(kpiScope('Contas a pagar').getByText(/R\$\s*22\.222,22/)).toBeTruthy();
    expect(kpiScope('Despesas').getByText(/R\$\s*133\.333,33/)).toBeTruthy();
    fireEvent.click(kpiScope('Faturamento').getByRole('button', { name: 'Expandir' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
    expect(within(dialog).queryByText(/transferência/i)).toBeNull();
  });

  it('P2-26/P2-27/P2-28 — Escape/close, keyboard e dialog mobile', async () => {
    const dialog = await openSectionExpand('inadimplencia');
    expect(dialog.className).toMatch(/dialog/i);
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    const expandBtn = within(section('inadimplencia')).getByRole('button', { name: 'Expandir' });
    const shell = expandBtn.closest('[data-financial-section="inadimplencia"]');
    expect(shell).toBeTruthy();
    (shell as HTMLElement).focus();
    fireEvent.keyDown(shell as HTMLElement, { key: 'Enter' });
    const reopened = await screen.findByRole('dialog');
    fireEvent.click(within(reopened).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });
});
