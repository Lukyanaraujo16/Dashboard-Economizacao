import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import RelatoriosPage from '../app/(authenticated)/relatorios/page';
import { ReportsPage } from '../src/components/reports/reports-page';
import { getDashboardCategories } from '../src/services/dashboard/categories';
import { getDashboardCostCenters } from '../src/services/dashboard/cost-centers';
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
      <ReportsPage />
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
  });

  afterEach(() => {
    cleanup();
  });

  it('expõe a rota e o estado inicial sem buscar o relatório', async () => {
    renderReports();
    expect(await screen.findByRole('heading', { name: 'Relatórios', level: 1 })).toBeTruthy();
    expect(RelatoriosPage).toBeTypeOf('function');
    expect(screen.getByLabelText('Tipo de relatório')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'De' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Até' })).toBeTruthy();
    expect(screen.getByLabelText('Situação')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Visualizar relatório' })).toBeTruthy();
    expect(screen.getByText('Selecione o intervalo e clique em Visualizar.')).toBeTruthy();
    expect(getReportsRevenue).not.toHaveBeenCalled();
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
    expect(replaceMock).toHaveBeenCalledWith(expect.stringMatching(/^\/relatorios\?type=revenue&from=/));
    expect(replaceMock.mock.calls[0]?.[0]).not.toContain('tenantId');
    expect(await screen.findByText('Serviços')).toBeTruthy();
    expect(screen.getByText('Receita por mês de competência')).toBeTruthy();
    expect(screen.getByRole('table')).toBeTruthy();
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
      await screen.findByText('Não há receita de competência no intervalo selecionado.'),
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
    expect(
      await screen.findByText(
        'Selecione uma empresa pelo modo suporte para visualizar este relatório.',
      ),
    ).toBeTruthy();

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

  it('empilha filtros no CSS mobile e usa tabela com overflow controlado', async () => {
    const { readFile } = await import('node:fs/promises');
    const { dirname, join } = await import('node:path');
    const { fileURLToPath } = await import('node:url');
    const here = dirname(fileURLToPath(import.meta.url));
    const css = await readFile(join(here, '../src/components/reports/reports-page.module.css'), 'utf8');
    expect(css).toMatch(/@media \(max-width: 767px\) \{[\s\S]*\.filtersRow/);
    expect(css).toMatch(/flex-direction:\s*column/);
    expect(css).toMatch(/\.tableWrap \{[\s\S]*overflow-x:\s*auto/);
    expect(css).toMatch(/\.resultActions \{[\s\S]*flex-wrap:\s*wrap/);
    expect(css).toMatch(/@media \(max-width: 767px\) \{[\s\S]*\.resultActions > button/);
  });

  it('filtra situação antes de visualizar', async () => {
    vi.mocked(getReportsRevenue).mockResolvedValue(readyBody);
    renderReports();
    const situation = await screen.findByLabelText('Situação');
    fireEvent.change(situation, { target: { value: 'overdue' } });
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar relatório' }));
    await waitFor(() => {
      expect(getReportsRevenue).toHaveBeenCalledWith(
        expect.objectContaining({ situation: 'overdue' }),
      );
    });
    expect(replaceMock.mock.calls.at(-1)?.[0]).toContain('situation=overdue');
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
      }),
    );
    expect(pdf.getAttribute('aria-busy')).toBe('true');
    expect(excel).toHaveProperty('disabled', true);
    releaseExport?.();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Exportar PDF' })).toHaveProperty('disabled', false);
    });

    fireEvent.change(screen.getByLabelText('Situação'), { target: { value: 'overdue' } });
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
        expect.objectContaining({ format: 'xlsx', situation: 'overdue' }),
      );
    });
  });
});
