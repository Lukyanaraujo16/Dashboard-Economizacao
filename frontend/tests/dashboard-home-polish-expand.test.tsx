import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '../src/components/dashboard';
import { getDashboardOverview } from '../src/services/dashboard/overview';
import type { DashboardOverviewResponse } from '../src/services/dashboard/overview.types';
import { getDashboardMonthEndCashPressure } from '../src/services/dashboard/month-end-cash-pressure';
import type { DashboardMonthEndCashPressureResponse } from '../src/services/dashboard/month-end-cash-pressure.types';
import { getDashboardMonthlyCashFlow } from '../src/services/dashboard/monthly-cash-flow';
import type { DashboardMonthlyCashFlowResponse } from '../src/services/dashboard/monthly-cash-flow.types';
import { getDashboardCashMovementHistory } from '../src/services/dashboard/cash-movement-history';
import { getDashboardReceivableStockDetails } from '../src/services/dashboard/receivable-stock-details';
import { getDashboardPayableStockDetails } from '../src/services/dashboard/payable-stock-details';
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
vi.mock('../src/services/dashboard/cash-movement-history', () => ({
  getDashboardCashMovementHistory: vi.fn(),
}));
vi.mock('../src/services/dashboard/receivable-stock-details', () => ({
  getDashboardReceivableStockDetails: vi.fn(),
}));
vi.mock('../src/services/dashboard/payable-stock-details', () => ({
  getDashboardPayableStockDetails: vi.fn(),
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
const getHistory = vi.mocked(getDashboardCashMovementHistory);
const getReceivableStockDetails = vi.mocked(getDashboardReceivableStockDetails);
const getPayableStockDetails = vi.mocked(getDashboardPayableStockDetails);
const getExpectedReceivableDetails = vi.mocked(getDashboardExpectedReceivableDetails);
const getExpectedPayableDetails = vi.mocked(getDashboardExpectedPayableDetails);
const getRevenueGoal = vi.mocked(getDashboardRevenueGoal);

const CENTER = '11111111-1111-4111-8111-111111111111';
const CATEGORY = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
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

const futureMonthCashFlow: DashboardMonthlyCashFlowResponse = {
  ...cashFlowHomeFixture,
  monthKey: '2026-10',
  from: '2026-10-01',
  to: '2026-10-31',
  billing: '50000.00',
  realized: { inflows: '0', outflows: '0', result: '0' },
  expected: { receivables: '50000.00', payables: '166188.45', result: '-116188.45' },
  overdue: {
    receivables: '0',
    payables: '0',
    ofMonth: { receivables: '0', payables: '0' },
  },
  stock: {
    receivables: { open: '50000.00', overdue: '0', dueToday: '0', upcoming: '50000.00' },
    payables: { open: '166188.45', overdue: '0', dueToday: '0', upcoming: '166188.45' },
  },
  coverage: null,
  realizedByCategory: {
    inflows: emptyCashCategoryComposition('0'),
    outflows: emptyCashCategoryComposition('0'),
  },
  daily: {
    realized: [{ date: '2026-10-01', inflows: '0', outflows: '0', result: '0' }],
    expected: [
      { date: '2026-10-15', receivables: '50000.00', payables: '166188.45', result: '-116188.45' },
    ],
  },
};

const currentExpectedReceivableDetails = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  available: true,
  total: '111111.11',
  items: [
    {
      id: 'exp-ar-1',
      externalId: 'ext-exp-ar-1',
      dueDate: '2026-08-28',
      amount: '111111.11',
      description: 'Mensalidade prevista',
      customerName: 'Cliente Previsto',
      categoryNames: ['Serviços'],
    },
  ],
};

const currentExpectedPayableDetails = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-01',
  to: '2026-08-31',
  available: true,
  total: '22222.22',
  items: [
    {
      id: 'exp-ap-1',
      externalId: 'ext-exp-ap-1',
      dueDate: '2026-08-28',
      amount: '22222.22',
      description: 'Honorários previstos',
      supplierName: 'Fornecedor Previsto',
      categoryNames: ['Contabilidade'],
    },
  ],
};

const pastExpectedReceivableDetails = {
  ...currentExpectedReceivableDetails,
  monthKey: '2026-07',
  from: '2026-07-01',
  to: '2026-07-31',
  total: '0',
  items: [],
};

const pastExpectedPayableDetails = {
  ...currentExpectedPayableDetails,
  monthKey: '2026-07',
  from: '2026-07-01',
  to: '2026-07-31',
  total: '0',
  items: [],
};

const futureExpectedReceivableDetails = {
  today: '2026-08-19',
  monthKey: '2026-10',
  from: '2026-10-01',
  to: '2026-10-31',
  available: true,
  total: '50000.00',
  items: [
    {
      id: 'fut-ar-1',
      externalId: 'ext-fut-ar-1',
      dueDate: '2026-10-20',
      amount: '50000.00',
      description: 'Parcela outubro',
      customerName: 'Cliente Outubro',
      categoryNames: ['Serviços'],
    },
  ],
};

const futureExpectedPayableDetails = {
  today: '2026-08-19',
  monthKey: '2026-10',
  from: '2026-10-01',
  to: '2026-10-31',
  available: true,
  total: '166188.45',
  items: [
    {
      id: 'fut-ap-1',
      externalId: 'ext-fut-ap-1',
      dueDate: '2026-10-15',
      amount: '166188.45',
      description: 'Despesa outubro',
      supplierName: 'Fornecedor Outubro',
      categoryNames: ['Aluguel'],
    },
  ],
};

const monthEnd: DashboardMonthEndCashPressureResponse = {
  today: '2026-08-19',
  monthKey: '2026-08',
  from: '2026-08-19',
  to: '2026-08-31',
  summary: { receivable: '8.5', payable: '4', net: '4.5' },
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
  getMonthlyCashFlow.mockImplementation(async (month) => {
    if (month === '2026-07') {
      return previousMonthCashFlow;
    }
    if (month === '2026-10') {
      return futureMonthCashFlow;
    }
    return cashFlowHomeFixture;
  });
  getExpectedReceivableDetails.mockImplementation(async (month) =>
    month === '2026-07'
      ? pastExpectedReceivableDetails
      : month === '2026-10'
        ? futureExpectedReceivableDetails
        : currentExpectedReceivableDetails,
  );
  getExpectedPayableDetails.mockImplementation(async (month) =>
    month === '2026-07'
      ? pastExpectedPayableDetails
      : month === '2026-10'
        ? futureExpectedPayableDetails
        : currentExpectedPayableDetails,
  );
  getHistory.mockResolvedValue({
    today: '2026-08-19',
    startMonth: '2025-09',
    endMonth: '2026-08',
    costCenterCashSplit: true,
    months: Array.from({ length: 12 }, (_, i) => {
      const date = new Date(Date.UTC(2025, 8 + i, 1));
      return {
        monthKey: `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
        realized: { inflows: '10', outflows: '5', result: '5' },
      };
    }),
  });
  getReceivableStockDetails.mockResolvedValue({
    today: '2026-08-19',
    available: true,
    total: '111111.11',
    overdue: '1.00',
    dueToday: '0',
    upcoming: '111110.11',
    items: [
      {
        id: 'item-1',
        externalId: 'ext-1',
        dueDate: '2026-08-28',
        amount: '111111.11',
        description: 'Mensalidade',
        customerName: 'Cliente Teste',
        categoryNames: ['Serviços'],
        situation: 'UPCOMING',
        overdueDays: null,
      },
    ],
  });
  getPayableStockDetails.mockResolvedValue({
    today: '2026-08-19',
    available: true,
    total: '22222.22',
    overdue: '2.00',
    dueToday: '0',
    upcoming: '22020.22',
    items: [
      {
        id: 'ap-1',
        externalId: 'ext-ap-1',
        dueDate: '2026-08-28',
        amount: '22222.22',
        description: 'Honorários contábeis',
        supplierName: 'Fornecedor XYZ',
        categoryNames: ['Contabilidade'],
        situation: 'UPCOMING',
        overdueDays: null,
      },
    ],
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

describe('PRE-F13-HOME-POLISH-1 — expansão Home caixa', () => {
  it('Z1/Z2/Z3 — Faturamento abre modal com billing CASH', async () => {
    const dialog = await openKpiExpand('Faturamento');
    expect(within(dialog).getByRole('heading', { name: 'Faturamento' })).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*999\.999,99/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Entradas realizadas')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*888\.888,88/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('A receber')).toBeTruthy();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
    await waitFor(() => {
      expect(getExpectedReceivableDetails).toHaveBeenCalledWith(null, null, null);
    });
    expect(getReceivableStockDetails).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Títulos a receber no prazo')).toBeTruthy();
    expect(within(dialog).getByText('Cliente Previsto')).toBeTruthy();
  });

  it('Z4 — Já recebido não aparece como card principal; Faturamento mantém Recebido', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();
    });
    expect(kpiScope('Faturamento').getByText('Recebido')).toBeTruthy();
    expect(kpiScope('Faturamento').getByText('A receber')).toBeTruthy();
    expect(
      within(document.querySelector('[data-financial-section="resumo-financeiro"]')!).queryByRole(
        'heading',
        { name: 'Já recebido' },
      ),
    ).toBeNull();
  });

  it('Z6/Z7/Z8 — A receber abre estoque com vencidos e detalhes lazy', async () => {
    const dialog = await openKpiExpand('A receber');
    expect(within(dialog).getByRole('heading', { name: 'A receber' })).toBeTruthy();
    expect(within(dialog).getByText('Total em aberto')).toBeTruthy();
    expect(within(dialog).getByText('Estoque financeiro em aberto')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*111\.111,11/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Vencidos')).toBeTruthy();
    expect(within(dialog).queryByText(/não entram neste total/i)).toBeNull();
    expect(within(dialog).queryByText(/Dias com vencimento/i)).toBeNull();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
    await waitFor(() => {
      expect(getReceivableStockDetails).toHaveBeenCalled();
    });
    expect(getExpectedReceivableDetails).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Títulos em aberto')).toBeTruthy();
    expect(within(dialog).getByText('Cliente Teste')).toBeTruthy();
    expect(
      within(dialog).queryByText(/Composição por categoria do previsto não disponível/i),
    ).toBeNull();
  });

  it('Z8b — Contas a pagar abre estoque com detalhes lazy', async () => {
    const dialog = await openKpiExpand('Contas a pagar');
    expect(within(dialog).getByRole('heading', { name: 'Contas a pagar' })).toBeTruthy();
    expect(within(dialog).getByText('Total em aberto')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*22\.222,22/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Vencidos')).toBeTruthy();
    expect(within(dialog).queryByText(/não entram neste total/i)).toBeNull();
    expect(within(dialog).queryByText(/Dias com vencimento/i)).toBeNull();
    await waitFor(() => {
      expect(getPayableStockDetails).toHaveBeenCalled();
    });
    expect(getExpectedPayableDetails).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Títulos em aberto')).toBeTruthy();
    expect(within(dialog).getByText('Fornecedor XYZ')).toBeTruthy();
  });

  it('Z9/Z10 — Despesas abre com Pago, acumulado e A pagar', async () => {
    const dialog = await openKpiExpand('Despesas');
    expect(within(dialog).getByRole('heading', { name: 'Despesas' })).toBeTruthy();
    expect(within(dialog).getByText('Pago')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*111\.111,11/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('A pagar')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*22\.222,22/).length).toBeGreaterThan(0);

    const paidDaily = within(dialog).getByText('Pago por dia de baixa');
    const paidAccumulated = within(dialog).getByText(
      'Saídas realizadas acumuladas (dia de baixa)',
    );
    const payableDue = within(dialog).getByText('A pagar por vencimento (no prazo)');
    expect(
      paidDaily.compareDocumentPosition(paidAccumulated) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(
      paidAccumulated.compareDocumentPosition(payableDue) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    expect(within(dialog).getByText('Maiores categorias das saídas realizadas')).toBeTruthy();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
    await waitFor(() => {
      expect(getExpectedPayableDetails).toHaveBeenCalledWith(null, null, null);
    });
    expect(getPayableStockDetails).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Títulos a pagar no prazo')).toBeTruthy();
    expect(within(dialog).getByText('Fornecedor Previsto')).toBeTruthy();
  });

  it('Z11/Z12 — Resultado abre com managerialResult', async () => {
    const dialog = await openKpiExpand('Resultado');
    expect(within(dialog).getByRole('heading', { name: 'Resultado' })).toBeTruthy();
    expect(within(dialog).getByText('Resultado projetado')).toBeTruthy();
    // billing 999999.99 − monthlyExpenses (111111.11+22222.22) = 866666.66
    expect(within(dialog).getAllByText(/R\$\s*866\.666,66/).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('Resultado realizado')).toBeNull();
    expect(within(dialog).queryByText('Previsto restante')).toBeNull();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z13/Z14 — Movimentação financeira abre com barras diárias; Realizado|Previsto só em Mensal', async () => {
    const dialog = await openSectionExpand('movimentacao-financeira');
    expect(within(dialog).getByRole('heading', { name: 'Movimentação financeira' })).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: 'Realizado' })).toBeNull();
    expect(within(dialog).queryByRole('button', { name: 'Previsto' })).toBeNull();
    expect(within(dialog).getAllByText(/dia de baixa/i).length).toBeGreaterThan(0);
    fireEvent.click(within(dialog).getByRole('button', { name: 'Mensal' }));
    expect(within(dialog).getByRole('button', { name: 'Realizado' })).toBeTruthy();
    expect(within(dialog).getByRole('button', { name: 'Previsto' })).toBeTruthy();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
    expect(within(dialog).queryByText(/Saldo bancário/i)).toBeNull();
    expect(within(dialog).queryByText(/Principais entradas por categoria/i)).toBeNull();
  });

  it('Z15/Z16 — donut receitas abre e fecha com realized.inflows', async () => {
    const dialog = await openSectionExpand('receitas-categoria');
    expect(within(dialog).getByRole('heading', { name: 'Receitas por categoria' })).toBeTruthy();
    expect(within(dialog).getByText('Total realizado')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*888\.888,88/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Serviços').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z17/Z18 — donut despesas abre e fecha com realized.outflows', async () => {
    const dialog = await openSectionExpand('despesas-categoria');
    expect(within(dialog).getByRole('heading', { name: 'Despesas por categoria' })).toBeTruthy();
    expect(within(dialog).getByText('Total realizado')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*111\.111,11/).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Salários').length).toBeGreaterThan(0);
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
  });

  it('Z19/Z20 — transferências e competência ausentes nos modais CASH', async () => {
    const dialog = await openKpiExpand('Faturamento');
    expect(within(dialog).queryByText(/transferência/i)).toBeNull();
    expect(within(dialog).queryByText(/competência/i)).toBeNull();
    expect(within(dialog).queryByText(/monthly-revenue/i)).toBeNull();
  });

  it('Z21 — Meta continua abrindo', async () => {
    const dialog = await openSectionExpand('meta-faturamento');
    expect(within(dialog).getByRole('heading', { name: 'Meta de faturamento' })).toBeTruthy();
    expect(within(dialog).getByText('Realizado')).toBeTruthy();
  });

  it('Z22 — Comparativo mensal removido da Home (08-B.4)', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(document.querySelector('[data-cash-flow-state="ready"]')).toBeTruthy();
    });
    expect(document.querySelector('[data-financial-section="comparativo-mensal"]')).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Comparativo mensal' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Movimentação financeira' })).toBeTruthy();
  });

  it('Z23 — Movimentação continua abrindo a partir do gráfico principal', async () => {
    const dialog = await openSectionExpand('movimentacao-financeira');
    expect(within(dialog).getByRole('heading', { name: 'Movimentação financeira' })).toBeTruthy();
    expect(within(dialog).getAllByText(/dia de baixa/i).length).toBeGreaterThan(0);
  });

  it('Z24/Z25 — Escape e botão fechar encerram o modal', async () => {
    const dialog = await openKpiExpand('Faturamento');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.click(kpiScope('Faturamento').getByRole('button', { name: 'Expandir' }));
    expect(await screen.findByRole('dialog')).toBeTruthy();
    fireEvent.keyDown(document, { key: 'Escape' });
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });
  });

  it('Z26 — card expansível responde a teclado', async () => {
    renderDashboard();
    const expandBtn = await waitFor(() =>
      kpiScope('Faturamento').getByRole('button', { name: 'Expandir' }),
    );
    const card = expandBtn.closest('[data-tone]');
    expect(card).toBeTruthy();
    expect((card as HTMLElement).className).toMatch(/expandable/);
    (card as HTMLElement).focus();
    fireEvent.keyDown(card as HTMLElement, { key: 'Enter' });
    expect(await screen.findByRole('dialog')).toBeTruthy();
  });

  it('Z27 — modal mobile usa layout full-height (classe dialog presente)', async () => {
    const dialog = await openKpiExpand('Despesas');
    expect(dialog.className).toMatch(/dialog/i);
    expect(within(dialog).getByRole('button', { name: 'Fechar' })).toBeTruthy();
  });

  it('Z28 — modal renderiza sob ThemeProvider (light default)', async () => {
    const dialog = await openKpiExpand('Resultado');
    expect(within(dialog).getByText('Resultado projetado')).toBeTruthy();
  });

  it('Z29 — KPIs da Home permanecem iguais com modal fechado', async () => {
    renderDashboard();
    await waitFor(() => {
      expect(kpiScope('Faturamento').getByText(/R\$\s*999\.999,99/)).toBeTruthy();
    });
    expect(kpiScope('Contas a pagar').getByText(/R\$\s*22\.222,22/)).toBeTruthy();
    expect(kpiScope('A receber').getByText(/R\$\s*111\.111,11/)).toBeTruthy();
    expect(kpiScope('Despesas').getByText(/R\$\s*133\.333,33/)).toBeTruthy();
    expect(kpiScope('Resultado').getByText(/R\$\s*866\.666,66/)).toBeTruthy();
  });

  it('Z30 — Home sem modal permanece com seções principais', async () => {
    renderDashboard();
    expect(await screen.findByRole('heading', { name: 'Movimentação financeira' })).toBeTruthy();
    expect(screen.queryByRole('heading', { name: 'Entradas × Saídas' })).toBeNull();
    expect(screen.queryByRole('heading', { name: 'Movimentação diária' })).toBeNull();
    expect(screen.getByRole('heading', { name: 'Receitas por categoria' })).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Despesas por categoria' })).toBeTruthy();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('A receber mantém estoque vencido mesmo sem previsto diário', async () => {
    getMonthlyCashFlow.mockImplementation(async (month) => {
      if (month === '2026-07') {
        return previousMonthCashFlow;
      }
      return {
        ...cashFlowHomeFixture,
        expected: { receivables: '0', payables: '22222.22', result: '-22222.22' },
        billing: '888888.88',
        overdue: {
          receivables: '50.00',
          payables: '0',
          ofMonth: { receivables: '0', payables: '0' },
        },
        stock: {
          receivables: { open: '50.00', overdue: '50.00', dueToday: '0', upcoming: '0' },
          payables: cashFlowHomeFixture.stock!.payables,
        },
        daily: {
          realized: cashFlowHomeFixture.daily.realized,
          expected: [],
        },
        realizedByCategory: {
          inflows: singleCashCategoryComposition('Serviços', '888888.88'),
          outflows: singleCashCategoryComposition('Salários', '111111.11'),
        },
      };
    });
    const dialog = await openKpiExpand('A receber');
    expect(within(dialog).getByText('Total em aberto')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*50,00/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Vencidos')).toBeTruthy();
    expect(within(dialog).queryByText(/Sem previsão a receber no prazo/i)).toBeNull();
  });
});

describe('Home — detalhe previsto de Faturamento e Despesas', () => {
  it('Despesas em mês futuro lista títulos de expected-details e mantém baixa vazia', async () => {
    dashboardSearchParams = new URLSearchParams('month=2026-10');
    const dialog = await openKpiExpand('Despesas');
    expect(within(dialog).getByRole('heading', { name: 'Despesas' })).toBeTruthy();
    expect(within(dialog).getByText('A pagar')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*166\.188,45/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('A pagar por vencimento (no prazo)')).toBeTruthy();
    await waitFor(() => {
      expect(getExpectedPayableDetails).toHaveBeenCalledWith('2026-10', null, null);
    });
    expect(getPayableStockDetails).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Títulos a pagar no prazo')).toBeTruthy();
    expect(within(dialog).getByText('Fornecedor Outubro')).toBeTruthy();
    expect(within(dialog).getByText(/15\/10\/2026/)).toBeTruthy();
    expect(within(dialog).queryByText('Maiores categorias das saídas realizadas')).toBeNull();
    expect(within(dialog).getAllByText('Sem movimento').length).toBeGreaterThan(0);
  });

  it('Faturamento em mês futuro lista títulos de expected-details e mantém baixa vazia', async () => {
    dashboardSearchParams = new URLSearchParams('month=2026-10');
    const dialog = await openKpiExpand('Faturamento previsto');
    expect(within(dialog).getByText('A receber')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*50\.000,00/).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(getExpectedReceivableDetails).toHaveBeenCalledWith('2026-10', null, null);
    });
    expect(getReceivableStockDetails).not.toHaveBeenCalled();
    expect(within(dialog).getByText('Títulos a receber no prazo')).toBeTruthy();
    expect(within(dialog).getByText('Cliente Outubro')).toBeTruthy();
    expect(within(dialog).getByText(/20\/10\/2026/)).toBeTruthy();
    expect(within(dialog).queryByText('Categorias das entradas realizadas')).toBeNull();
    expect(within(dialog).getAllByText('Sem movimento').length).toBeGreaterThan(0);
  });

  it('mês atual lista somente títulos no prazo do expected, sem virar vencido em previsto', async () => {
    const dialog = await openKpiExpand('Despesas');
    await waitFor(() => {
      expect(getExpectedPayableDetails).toHaveBeenCalledWith(null, null, null);
    });
    expect(within(dialog).getByText('Fornecedor Previsto')).toBeTruthy();
    expect(within(dialog).getByText(/28\/08\/2026/)).toBeTruthy();
    expect(within(dialog).queryByText('Fornecedor XYZ')).toBeNull();
    expect(within(dialog).queryByText(/vencido/i)).toBeNull();
    expect(getPayableStockDetails).not.toHaveBeenCalled();
  });

  it('mês passado mantém realizado e expected pode ficar vazio', async () => {
    dashboardSearchParams = new URLSearchParams('month=2026-07');
    const dialog = await openKpiExpand('Despesas');
    expect(within(dialog).getByText('Pago')).toBeTruthy();
    expect(within(dialog).getAllByText(/R\$\s*100\.000,00/).length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Pago por dia de baixa')).toBeTruthy();
    expect(within(dialog).getByText('Saídas realizadas acumuladas (dia de baixa)')).toBeTruthy();
    await waitFor(() => {
      expect(getExpectedPayableDetails).toHaveBeenCalledWith('2026-07', null, null);
    });
    expect(within(dialog).getByText('Nenhum pagamento previsto no prazo neste período.')).toBeTruthy();
    expect(within(dialog).queryByText('Fornecedor Outubro')).toBeNull();
    expect(within(dialog).queryByText('Fornecedor Previsto')).toBeNull();
  });

  it('envia centro de custo e categoria ao expected-details de Despesas', async () => {
    dashboardSearchParams = new URLSearchParams(
      `month=2026-10&costCenter=${CENTER}&category=${CATEGORY}`,
    );
    getCostCenters.mockResolvedValue({
      items: [{ id: CENTER, name: 'Centro A', code: null, active: true }],
    });
    getCategories.mockResolvedValue({
      items: [{ id: CATEGORY, name: 'Categoria A', type: 'EXPENSE' }],
    });
    await openKpiExpand('Despesas');
    await waitFor(() => {
      expect(getExpectedPayableDetails).toHaveBeenCalledWith('2026-10', CENTER, CATEGORY);
    });
    expect(getMonthlyCashFlow).toHaveBeenCalledWith('2026-10', CENTER, CATEGORY);
  });

  it('envia centro de custo e categoria ao expected-details de Faturamento', async () => {
    dashboardSearchParams = new URLSearchParams(`costCenter=${CENTER}&category=${CATEGORY}`);
    getCostCenters.mockResolvedValue({
      items: [{ id: CENTER, name: 'Centro A', code: null, active: true }],
    });
    getCategories.mockResolvedValue({
      items: [{ id: CATEGORY, name: 'Categoria A', type: 'REVENUE' }],
    });
    await openKpiExpand('Faturamento');
    await waitFor(() => {
      expect(getExpectedReceivableDetails).toHaveBeenCalledWith(null, CENTER, CATEGORY);
    });
    expect(getMonthlyCashFlow).toHaveBeenCalledWith(null, CENTER, CATEGORY);
  });

  it('A receber e Contas a pagar continuam no stock-details', async () => {
    const receivable = await openKpiExpand('A receber');
    await waitFor(() => {
      expect(getReceivableStockDetails).toHaveBeenCalled();
    });
    expect(getExpectedReceivableDetails).not.toHaveBeenCalled();
    expect(within(receivable).getByText('Títulos em aberto')).toBeTruthy();
    fireEvent.click(within(receivable).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull();
    });

    fireEvent.click(kpiScope('Contas a pagar').getByRole('button', { name: 'Expandir' }));
    const payable = await screen.findByRole('dialog');
    await waitFor(() => {
      expect(getPayableStockDetails).toHaveBeenCalled();
    });
    expect(getExpectedPayableDetails).not.toHaveBeenCalled();
    expect(within(payable).getByText('Títulos em aberto')).toBeTruthy();
  });
});
