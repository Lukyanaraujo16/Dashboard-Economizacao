import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RelatoriosPage from '../app/(authenticated)/relatorios/page';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
import { getReportsExpenses, downloadReportsExpensesExport } from '../src/services/reports/expenses';
import { type ReportsExpensesResponse } from '../src/services/reports/expenses.types';
import {
  getReportsExpensesDetails,
  getReportsRevenueDetails,
} from '../src/services/reports/details';
import type { ReportCashDetailSituation, ReportCashDetailsResponse } from '../src/services/reports/details.types';
import { getReportsRevenue, downloadReportsRevenueExport } from '../src/services/reports/revenue';
import {
  ReportsRevenueRequestError,
  type ReportsRevenueResponse,
} from '../src/services/reports/revenue.types';
import { ThemeProvider } from '../src/theme';
import {
  createAuthenticatedGetCurrentUser,
  mockAuthenticatedUser,
  renderWithAuth,
} from './helpers/render-with-auth';

const replaceMock = vi.fn();
let reportsSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: replaceMock,
    push: vi.fn(),
  }),
  usePathname: () => '/relatorios',
  useSearchParams: () => reportsSearchParams,
}));

vi.mock('../src/services/reports/revenue', () => ({
  getReportsRevenue: vi.fn(),
  downloadReportsRevenueExport: vi.fn(),
}));

vi.mock('../src/services/reports/expenses', () => ({
  getReportsExpenses: vi.fn(),
  downloadReportsExpensesExport: vi.fn(),
}));

vi.mock('../src/services/reports/details', () => ({
  getReportsRevenueDetails: vi.fn(),
  getReportsExpensesDetails: vi.fn(),
  ReportsCashDetailsRequestError: class ReportsCashDetailsRequestError extends Error {
    readonly kind: string;
    constructor(kind: string, message: string) {
      super(message);
      this.kind = kind;
      this.name = 'ReportsCashDetailsRequestError';
    }
  },
}));

vi.mock('../src/services/dashboard/categories', () => ({
  getDashboardCategories: vi.fn(),
}));

vi.mock('../src/services/dashboard/cost-centers', () => ({
  getDashboardCostCenters: vi.fn(),
}));

const readyBody: ReportsRevenueResponse = {
  today: '2026-08-19',
  from: '2026-01',
  to: '2026-02',
  receivables: {
    total: '15000',
    received: '9000',
    outstanding: '6000',
    overdue: '0',
    classified: '15000',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: '100',
    items: [
      {
        kind: 'category',
        name: 'Serviços',
        amount: '15000',
        received: '9000',
        outstanding: '6000',
        percentage: '100',
      },
    ],
  },
  months: [
    {
      monthKey: '2026-01',
      receivables: {
        total: '10000',
        received: '4000',
        outstanding: '6000',
        overdue: '0',
        classified: '10000',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: '100',
        items: [
          {
            kind: 'category',
            name: 'Serviços',
            amount: '10000',
            received: '4000',
            outstanding: '6000',
            percentage: '100',
          },
        ],
        daily: [{ date: '2026-01-01', amount: '10000', received: '4000', outstanding: '6000' }],
      },
    },
    {
      monthKey: '2026-02',
      receivables: {
        total: '5000',
        received: '5000',
        outstanding: '0',
        overdue: '0',
        classified: '5000',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: '100',
        items: [
          {
            kind: 'category',
            name: 'Serviços',
            amount: '5000',
            received: '5000',
            outstanding: '0',
            percentage: '100',
          },
        ],
        daily: [{ date: '2026-02-01', amount: '5000', received: '5000', outstanding: '0' }],
      },
    },
  ],
};

const expensesReadyBody: ReportsExpensesResponse = {
  today: '2026-08-19',
  from: '2026-01',
  to: '2026-02',
  payables: {
    total: '8000',
    paid: '5000',
    outstanding: '3000',
    overdue: '0',
    classified: '8000',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: '100',
    items: [
      {
        kind: 'category',
        name: 'Aluguel',
        amount: '8000',
        paid: '5000',
        outstanding: '3000',
        percentage: '100',
      },
    ],
  },
  months: [
    {
      monthKey: '2026-01',
      payables: {
        total: '5000',
        paid: '2000',
        outstanding: '3000',
        overdue: '0',
        classified: '5000',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: '100',
        items: [
          {
            kind: 'category',
            name: 'Aluguel',
            amount: '5000',
            paid: '2000',
            outstanding: '3000',
            percentage: '100',
          },
        ],
        daily: [{ date: '2026-01-01', amount: '5000', received: '2000', outstanding: '3000' }],
      },
    },
    {
      monthKey: '2026-02',
      payables: {
        total: '3000',
        paid: '3000',
        outstanding: '0',
        overdue: '0',
        classified: '3000',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: '100',
        items: [
          {
            kind: 'category',
            name: 'Aluguel',
            amount: '3000',
            paid: '3000',
            outstanding: '0',
            percentage: '100',
          },
        ],
        daily: [{ date: '2026-02-01', amount: '3000', received: '3000', outstanding: '0' }],
      },
    },
  ],
};

function emptyDetails(situation: ReportCashDetailSituation): ReportCashDetailsResponse {
  return {
    today: '2026-08-19',
    from: '2026-01',
    to: '2026-02',
    situation,
    available: true,
    unavailableReason: null,
    totalAmount: '0',
    itemCount: 0,
    limit: 25,
    offset: 0,
    items: [],
  };
}

function mockEmptyDetails() {
  vi.mocked(getReportsRevenueDetails).mockImplementation(async (options) =>
    emptyDetails(options.situation),
  );
  vi.mocked(getReportsExpensesDetails).mockImplementation(async (options) =>
    emptyDetails(options.situation),
  );
}

function renderReports(options?: {
  readonly role?: 'USER' | 'ADMIN' | 'SUPER_ADMIN';
  readonly support?: { readonly active: true; readonly tenantId: string; readonly tenantDisplayName: string };
}) {
  const user =
    options?.role === 'ADMIN' || options?.role === 'SUPER_ADMIN'
      ? { ...mockAuthenticatedUser, role: options.role, tenantId: null }
      : mockAuthenticatedUser;
  const support = options?.support
    ? {
        active: true as const,
        tenantId: options.support.tenantId,
        tenantDisplayName: options.support.tenantDisplayName,
        startedAt: '2026-08-17T12:00:00.000Z',
        supportSessionId: 'support-1',
      }
    : { active: false as const };
  return renderWithAuth(
    <ThemeProvider>
      <RelatoriosPage />
    </ThemeProvider>,
    {
      getCurrentUserAction: createAuthenticatedGetCurrentUser(user, support),
      hydrateOnMount: true,
    },
  );
}

describe('página /relatorios', () => {
  beforeEach(() => {
    reportsSearchParams = new URLSearchParams();
    replaceMock.mockReset();
    vi.mocked(getDashboardCategories).mockResolvedValue({ items: [] });
    vi.mocked(getDashboardCostCenters).mockResolvedValue({ items: [] });
    vi.mocked(getReportsRevenue).mockReset();
    vi.mocked(downloadReportsRevenueExport).mockReset();
    vi.mocked(downloadReportsRevenueExport).mockResolvedValue(undefined);
    vi.mocked(getReportsExpenses).mockReset();
    vi.mocked(downloadReportsExpensesExport).mockReset();
    vi.mocked(downloadReportsExpensesExport).mockResolvedValue(undefined);
    vi.mocked(getReportsRevenueDetails).mockReset();
    vi.mocked(getReportsExpensesDetails).mockReset();
    mockEmptyDetails();
  });

  afterEach(() => {
    cleanup();
  });

  it('expõe a rota e o estado inicial sem buscar o relatório', async () => {
    renderReports();
    expect(await screen.findByRole('heading', { name: 'Relatórios', level: 1 })).toBeTruthy();
    expect(RelatoriosPage).toBeTypeOf('function');
    expect(screen.getByLabelText('Tipo de relatório')).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Entradas' })).toBeTruthy();
    expect(screen.getByRole('option', { name: 'Saídas' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'De' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Até' })).toBeTruthy();
    expect(screen.queryByLabelText('Situação')).toBeNull();
    expect(screen.getByRole('button', { name: 'Visualizar relatório' })).toBeTruthy();
    expect(screen.getByText('Selecione o intervalo e clique em Visualizar.')).toBeTruthy();
    expect(screen.getByText('Entradas de caixa no intervalo de meses.')).toBeTruthy();
    expect(screen.queryByText(/competência/i)).toBeNull();
    expect(getReportsRevenue).not.toHaveBeenCalled();
    expect(getReportsExpenses).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /pdf|excel/i })).toBeNull();
  });

  it('visualiza, grava a URL e mostra o resultado', async () => {
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    renderReports();
    await screen.findByRole('heading', { name: 'Relatórios', level: 1 });
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar relatório' }));
    await waitFor(() => {
      expect(getReportsRevenue).toHaveBeenCalled();
    });
    expect(getReportsRevenue).toHaveBeenCalledWith(
      expect.objectContaining({ situation: null }),
    );
    expect(replaceMock).toHaveBeenCalledWith(expect.stringMatching(/^\/relatorios\?type=revenue&from=/));
    expect(replaceMock.mock.calls[0]?.[0]).not.toContain('tenantId');
    expect(replaceMock.mock.calls[0]?.[0]).not.toContain('situation=');
    expect(await screen.findByText('Serviços')).toBeTruthy();
    expect(screen.getByText('Entradas por mês civil (caixa)')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Faturamento' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Entradas realizadas' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Entradas por mês civil (caixa)').closest('table')).toBeTruthy();
    expect(screen.queryByText(/competência/i)).toBeNull();
    expect(screen.queryByText(/Snapshot atual/i)).toBeNull();
  });

  it('consulta a partir da URL, mostra vazio, erro com retry e Support Mode', async () => {
    reportsSearchParams = new URLSearchParams('from=2026-01&to=2026-01');
    vi.mocked(getReportsRevenue).mockResolvedValue({
      ...readyBody,
      from: '2026-01',
      to: '2026-01',
      receivables: {
        ...readyBody.receivables,
        total: '0',
        received: '0',
        outstanding: '0',
        classified: '0',
        coverageRate: null,
        items: [],
      },
      months: [
        {
          monthKey: '2026-01',
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
        },
      ],
    });
    renderReports();
    expect(
      await screen.findByText('Não há entradas de caixa no intervalo selecionado.'),
    ).toBeTruthy();

    cleanup();
    reportsSearchParams = new URLSearchParams();
    vi.mocked(getReportsRevenue).mockReset();
    vi.mocked(getReportsRevenue).mockRejectedValue(
      new ReportsRevenueRequestError('unavailable', 'Não foi possível carregar o relatório de receita.'),
    );
    renderReports();
    fireEvent.click(await screen.findByRole('button', { name: 'Visualizar relatório' }));
    expect(await screen.findByText('Não foi possível carregar o relatório de receita.')).toBeTruthy();
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Serviços')).toBeTruthy();

    cleanup();
    reportsSearchParams = new URLSearchParams();
    vi.mocked(getReportsRevenue).mockReset();
    renderReports({ role: 'ADMIN' });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/empresas');
    });
    expect(screen.queryByRole('heading', { name: 'Relatórios', level: 1 })).toBeNull();
    expect(vi.mocked(getReportsRevenue)).not.toHaveBeenCalled();

    cleanup();
    vi.mocked(getReportsRevenue).mockReset();
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    reportsSearchParams = new URLSearchParams('from=2026-01&to=2026-02');
    renderReports({
      role: 'SUPER_ADMIN',
      support: { active: true, tenantId: 'tenant-a', tenantDisplayName: 'Empresa A' },
    });
    await waitFor(() => {
      expect(getReportsRevenue).toHaveBeenCalled();
    });
    expect(await screen.findByText('Serviços')).toBeTruthy();
  });

  it('SUPER_ADMIN sem Support Mode em /relatorios redireciona /empresas', async () => {
    renderReports({ role: 'SUPER_ADMIN' });
    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/empresas');
    });
    expect(vi.mocked(getReportsRevenue)).not.toHaveBeenCalled();
  });

  it('Support Mode ativo em /relatorios não redireciona', async () => {
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    renderReports({
      role: 'ADMIN',
      support: { active: true, tenantId: 'tenant-a', tenantDisplayName: 'Empresa A' },
    });
    expect(await screen.findByRole('heading', { name: 'Relatórios', level: 1 })).toBeTruthy();
    expect(replaceMock).not.toHaveBeenCalledWith('/empresas');
  });

  it('empilha filtros no CSS mobile e usa tabela com overflow controlado', async () => {
    const { readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const css = await readFile(join(here, '../src/components/reports/reports-page.module.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 767px\) \{[\s\S]*\.filtersRow/);
    expect(css).toMatch(/flex-direction:\s*column/);
    expect(css).toMatch(
      /@media \(max-width: 767px\) \{[\s\S]*\.filtersRow > \* \{[\s\S]*flex:\s*0 0 auto/,
    );
    expect(css).not.toMatch(/\.filtersRow \{[\s\S]*justify-content:\s*space-between/);
    expect(css).not.toMatch(/grid-template-rows:\s*1fr/);
    expect(css).toMatch(/\.idle \{[\s\S]*margin:\s*0/);
    expect(css).not.toMatch(/\.idle \{[\s\S]*min-height/);
    expect(css).not.toMatch(/\.result \{[\s\S]*min-height:\s*100/);
    expect(css).not.toMatch(/\.root \{[\s\S]*min-height:\s*100vh/);
    expect(css).toMatch(/\.costCenterField \{/);
    expect(css).toMatch(/\.actions \{/);
    expect(css).toMatch(/\.tableWrap \{[\s\S]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.resultActions \{[\s\S]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/@media \(max-width: 767px\) \{[\s\S]*\.resultActions > button/);
  });

  it('ignora situation na URL e sempre consulta com situation null', async () => {
    reportsSearchParams = new URLSearchParams('from=2026-01&to=2026-02&situation=overdue');
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    renderReports();
    await waitFor(() => {
      expect(getReportsRevenue).toHaveBeenCalledWith(
        expect.objectContaining({ situation: null }),
      );
    });
    expect(screen.queryByLabelText('Situação')).toBeNull();
  });

  it('exporta o snapshot visualizado, invalida ao mudar filtro e protege clique duplo', async () => {
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    let releaseExport: (() => void) | undefined;
    vi.mocked(downloadReportsRevenueExport).mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseExport = () => resolve();
        }),
    );
    renderReports();
    fireEvent.click(await screen.findByRole('button', { name: 'Visualizar relatório' }));
    const pdf = await screen.findByRole('button', { name: 'Exportar PDF' });
    const excel = screen.getByRole('button', { name: 'Exportar Excel' });
    expect(pdf).toHaveProperty('disabled', false);
    expect(excel).toHaveProperty('disabled', false);

    fireEvent.click(pdf);
    fireEvent.click(pdf);
    fireEvent.click(excel);
    await waitFor(() => {
      expect(downloadReportsRevenueExport).toHaveBeenCalledTimes(1);
    });
    expect(downloadReportsRevenueExport).toHaveBeenCalledWith(
      expect.objectContaining({
        from: expect.stringMatching(/^\d{4}-\d{2}$/),
        to: expect.stringMatching(/^\d{4}-\d{2}$/),
        format: 'pdf',
        situation: null,
      }),
    );
    expect(pdf.getAttribute('aria-busy')).toBe('true');
    expect(excel).toHaveProperty('disabled', true);
    releaseExport?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveProperty('disabled', false);
    });

    const fromRegion = screen.getByRole('region', { name: 'De' });
    fireEvent.click(within(fromRegion).getByRole('button', { name: 'Mês anterior' }));
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveProperty('disabled', true);
    expect(
      screen.getByText(/Filtros alterados — clique em Visualizar/),
    ).toBeTruthy();
    expect(downloadReportsRevenueExport).toHaveBeenCalledTimes(1);

    vi.mocked(downloadReportsRevenueExport).mockRejectedValueOnce(
      new ReportsRevenueRequestError('unavailable', 'Não foi possível exportar o relatório de receita.'),
    );
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar relatório' }));
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Exportar Excel' })).toHaveProperty('disabled', false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    vi.mocked(downloadReportsRevenueExport).mockResolvedValue(undefined);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => {
      expect(downloadReportsRevenueExport).toHaveBeenLastCalledWith(
        expect.objectContaining({ format: 'xlsx', situation: null }),
      );
    });
  });

  it('visualiza despesas, grava type=expenses e exporta o snapshot', async () => {
    vi.mocked(getReportsExpenses).mockResolvedValue(expensesReadyBody);
    renderReports();
    await screen.findByRole('heading', { name: 'Relatórios', level: 1 });
    fireEvent.change(screen.getByLabelText('Tipo de relatório'), { target: { value: 'expenses' } });
    expect(screen.getByText('Saídas de caixa no intervalo de meses.')).toBeTruthy();
    expect(getReportsExpenses).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar relatório' }));
    await waitFor(() => {
      expect(getReportsExpenses).toHaveBeenCalled();
    });
    expect(getReportsRevenue).not.toHaveBeenCalled();
    expect(replaceMock).toHaveBeenCalledWith(expect.stringMatching(/^\/relatorios\?type=expenses&from=/));
    expect(replaceMock.mock.calls.at(-1)?.[0]).not.toContain('situation=');
    expect(await screen.findByText('Aluguel')).toBeTruthy();
    expect(screen.getByText('Saídas por mês civil (caixa)')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Despesas' })).toBeTruthy();
    expect(screen.getAllByRole('heading', { name: 'Saídas realizadas' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('heading', { name: 'A pagar' }).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText(/competência/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Exportar PDF' }));
    await waitFor(() => {
      expect(downloadReportsExpensesExport).toHaveBeenCalledWith(
        expect.objectContaining({ format: 'pdf', situation: null }),
      );
    });
    expect(downloadReportsRevenueExport).not.toHaveBeenCalled();
  });

  it('trocar o tipo invalida a exportação sem buscar de novo', async () => {
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    renderReports();
    fireEvent.click(await screen.findByRole('button', { name: 'Visualizar relatório' }));
    const pdf = await screen.findByRole('button', { name: 'Exportar PDF' });
    expect(pdf).toHaveProperty('disabled', false);

    fireEvent.change(screen.getByLabelText('Tipo de relatório'), { target: { value: 'expenses' } });
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveProperty('disabled', true);
    expect(
      screen.getByText(/Filtros alterados — clique em Visualizar/),
    ).toBeTruthy();
    expect(getReportsExpenses).not.toHaveBeenCalled();
    expect(getReportsRevenue).toHaveBeenCalledTimes(1);
  });

  it('URL com costCenter ausente do catálogo ativo volta para Todos', async () => {
    const INACTIVE = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const ACTIVE = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    reportsSearchParams = new URLSearchParams(
      `from=2026-01&to=2026-02&costCenter=${INACTIVE}`,
    );
    vi.mocked(getDashboardCostCenters).mockResolvedValue({
      items: [{ id: ACTIVE, name: 'Centro Ativo', code: null, active: true }],
    });
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    renderReports();

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith(
        expect.stringMatching(/^\/relatorios\?type=revenue&from=2026-01&to=2026-02$/),
      );
    });
    expect(
      replaceMock.mock.calls.some((call) => String(call[0]).includes(`costCenter=${INACTIVE}`)),
    ).toBe(false);
    expect(await screen.findByRole('tab', { name: 'Todos' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Centro Ativo' })).toBeTruthy();
    expect(screen.queryByRole('tab', { name: 'Desenvolvedor' })).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
    expect(getDashboardCostCenters).toHaveBeenCalledWith({
      fromKey: '2026-01',
      toKey: '2026-02',
    });
  });

  it('troca de tenant em Support Mode recarrega catálogos de filtros', async () => {
    const CAT_A = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    vi.mocked(getDashboardCategories).mockClear();
    vi.mocked(getDashboardCategories)
      .mockResolvedValueOnce({
        items: [{ id: CAT_A, name: 'Receita A', type: 'REVENUE' }],
      })
      .mockResolvedValueOnce({
        items: [{ id: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd', name: 'Despesa B', type: 'EXPENSE' }],
      });

    const first = renderReports({
      role: 'SUPER_ADMIN',
      support: { active: true, tenantId: 'tenant-a', tenantDisplayName: 'Empresa A' },
    });
    await waitFor(() => expect(getDashboardCategories).toHaveBeenCalledTimes(1));
    first.unmount();

    cleanup();
    renderReports({
      role: 'SUPER_ADMIN',
      support: { active: true, tenantId: 'tenant-b', tenantDisplayName: 'Empresa B' },
    });
    await waitFor(() => expect(getDashboardCategories).toHaveBeenCalledTimes(2));
  });

  it('detalhes usam filtros aplicados e ignoram draft até Visualizar', async () => {
    const CATEGORY = '22222222-2222-4222-8222-222222222222';
    const CENTER = '11111111-1111-4111-8111-111111111111';
    vi.mocked(getDashboardCategories).mockResolvedValue({
      items: [{ id: CATEGORY, name: 'Serviços', type: 'REVENUE' }],
    });
    vi.mocked(getDashboardCostCenters).mockResolvedValue({
      items: [{ id: CENTER, name: 'Operações', code: null, active: true }],
    });
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    renderReports();
    fireEvent.click(await screen.findByRole('tab', { name: 'Operações' }));
    fireEvent.click(screen.getByLabelText(/Categoria:/));
    fireEvent.click(await screen.findByRole('option', { name: 'Serviços' }));
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar relatório' }));
    await waitFor(() => {
      expect(getReportsRevenueDetails).toHaveBeenCalled();
    });
    const applied = vi.mocked(getReportsRevenue).mock.calls[0]?.[0];
    expect(getReportsRevenueDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        from: applied?.from,
        to: applied?.to,
        situation: 'REALIZED',
        categoryId: CATEGORY,
        costCenterId: CENTER,
      }),
    );
    expect(getReportsRevenueDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        situation: 'EXPECTED',
        from: applied?.from,
        to: applied?.to,
        categoryId: CATEGORY,
        costCenterId: CENTER,
      }),
    );
    expect(getReportsRevenueDetails).toHaveBeenCalledWith(
      expect.objectContaining({
        situation: 'OVERDUE',
        from: applied?.from,
        to: applied?.to,
        categoryId: CATEGORY,
        costCenterId: CENTER,
      }),
    );
    expect(await screen.findByRole('heading', { name: 'Lançamentos do período' })).toBeTruthy();
    expect(screen.getByText('Entradas por mês civil (caixa)')).toBeTruthy();

    const callsAfterApply = vi.mocked(getReportsRevenueDetails).mock.calls.length;
    const fromRegion = screen.getByRole('region', { name: 'De' });
    fireEvent.click(within(fromRegion).getByRole('button', { name: 'Mês anterior' }));
    fireEvent.change(screen.getByLabelText('Tipo de relatório'), { target: { value: 'expenses' } });
    expect(getReportsRevenueDetails).toHaveBeenCalledTimes(callsAfterApply);
    expect(getReportsExpensesDetails).not.toHaveBeenCalled();
    expect(getReportsExpenses).not.toHaveBeenCalled();
    expect(screen.getByText('Entradas por mês civil (caixa)')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Lançamentos do período' })).toBeTruthy();
    expect(screen.getByText(/Filtros alterados — clique em Visualizar/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveProperty('disabled', true);
  });

  it('erro nos detalhes não apaga o consolidado', async () => {
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    vi.mocked(getReportsRevenueDetails).mockImplementation(async (options) => {
      if (options.situation === 'EXPECTED') {
        throw new Error('boom');
      }
      return emptyDetails(options.situation);
    });
    renderReports();
    fireEvent.click(await screen.findByRole('button', { name: 'Visualizar relatório' }));
    expect(await screen.findByText('Serviços')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Faturamento' })).toBeTruthy();
    expect(screen.getByText('Entradas por mês civil (caixa)')).toBeTruthy();
    expect(await screen.findByText('Não foi possível carregar os lançamentos de receita.')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exportar PDF' })).toBeTruthy();
  });

  it('erro no consolidado não monta a seção de lançamentos', async () => {
    vi.mocked(getReportsRevenue).mockRejectedValue(
      new ReportsRevenueRequestError('unavailable', 'Não foi possível carregar o relatório de receita.'),
    );
    renderReports();
    fireEvent.click(await screen.findByRole('button', { name: 'Visualizar relatório' }));
    expect(await screen.findByText('Não foi possível carregar o relatório de receita.')).toBeTruthy();
    expect(getReportsRevenueDetails).not.toHaveBeenCalled();
    expect(screen.queryByRole('heading', { name: 'Lançamentos do período' })).toBeNull();
  });
});
