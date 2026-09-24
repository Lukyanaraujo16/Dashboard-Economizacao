import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ReportTransactionsSection } from '../src/components/reports/report-transactions-section';
import { REPORT_TRANSACTIONS_PAGE_SIZE } from '../src/components/reports/report-transactions-view';
import { formatMoneyBrl } from '../src/lib/format-money-brl';
import { REPORT_TYPE_EXPENSES, REPORT_TYPE_REVENUE } from '../src/lib/reports-query';
import {
  getReportsExpensesDetails,
  getReportsRevenueDetails,
} from '../src/services/reports/details';
import type {
  ReportCashDetailItem,
  ReportCashDetailSituation,
  ReportCashDetailsResponse,
} from '../src/services/reports/details.types';
import { ThemeProvider } from '../src/theme';

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

function emptyPage(situation: ReportCashDetailSituation): ReportCashDetailsResponse {
  return {
    today: '2026-09-24',
    from: '2026-09',
    to: '2026-09',
    situation,
    available: true,
    unavailableReason: null,
    totalAmount: '0',
    itemCount: 0,
    limit: REPORT_TRANSACTIONS_PAGE_SIZE,
    offset: 0,
    items: [],
  };
}

function item(
  situation: ReportCashDetailSituation,
  overrides: Partial<ReportCashDetailItem> = {},
): ReportCashDetailItem {
  return {
    date: '2026-09-15',
    description: 'Honorários',
    partyName: situation === 'REALIZED' ? 'Cliente Alpha' : 'Cliente Beta',
    categoryNames: ['Serviços', 'Consultoria'],
    costCenterNames: ['Operações', 'Comercial'],
    situation,
    amount: '400.00',
    installmentKind: 'RECEIVABLE',
    installmentExternalId: `inst-${situation}`,
    ...(situation === 'REALIZED' ? { settlementExternalId: `set-${situation}` } : {}),
    ...overrides,
  };
}

function page(
  situation: ReportCashDetailSituation,
  overrides: Partial<ReportCashDetailsResponse> = {},
): ReportCashDetailsResponse {
  return {
    ...emptyPage(situation),
    totalAmount: '231733.56',
    itemCount: 1,
    items: [item(situation)],
    ...overrides,
  };
}

function renderSection(type: typeof REPORT_TYPE_REVENUE | typeof REPORT_TYPE_EXPENSES = REPORT_TYPE_REVENUE) {
  return render(
    <ThemeProvider>
      <ReportTransactionsSection
        filters={{
          type,
          from: '2026-09',
          to: '2026-09',
          costCenterId: null,
          categoryId: null,
        }}
      />
    </ThemeProvider>,
  );
}

function blockMeta(region: HTMLElement): { readonly total: string; readonly count: string } {
  return {
    total: region.querySelector('[data-report-transactions-total]')?.textContent ?? '',
    count: region.querySelector('[data-report-transactions-count]')?.textContent ?? '',
  };
}

function mockBySituation(
  fn: typeof getReportsRevenueDetails,
  pages: Partial<Record<ReportCashDetailSituation, ReportCashDetailsResponse | Error>>,
) {
  vi.mocked(fn).mockImplementation(async (options) => {
    const next = pages[options.situation];
    if (next instanceof Error) {
      throw next;
    }
    if (next) {
      return next;
    }
    return emptyPage(options.situation);
  });
}

describe('ReportTransactionsSection', () => {
  beforeEach(() => {
    vi.mocked(getReportsRevenueDetails).mockReset();
    vi.mocked(getReportsExpensesDetails).mockReset();
    mockBySituation(getReportsRevenueDetails, {});
    mockBySituation(getReportsExpensesDetails, {});
  });

  afterEach(() => {
    cleanup();
  });

  it('renderiza os três blocos de entradas com totalAmount e itemCount do backend', async () => {
    mockBySituation(getReportsRevenueDetails, {
      REALIZED: page('REALIZED', { totalAmount: '231733.56', itemCount: 47 }),
      EXPECTED: page('EXPECTED', { totalAmount: '1200.00', itemCount: 2 }),
      OVERDUE: page('OVERDUE', { totalAmount: '300.00', itemCount: 1 }),
    });
    renderSection(REPORT_TYPE_REVENUE);
    expect(await screen.findByRole('heading', { name: 'Lançamentos do período' })).toBeTruthy();
    const realized = await screen.findByRole('region', { name: 'Entradas realizadas' });
    const expected = screen.getByRole('region', { name: 'A receber' });
    const overdue = screen.getByRole('region', { name: 'Vencido' });
    expect(blockMeta(realized)).toEqual({
      total: formatMoneyBrl('231733.56'),
      count: '47 lançamentos',
    });
    expect(blockMeta(expected)).toEqual({
      total: formatMoneyBrl('1200.00'),
      count: '2 lançamentos',
    });
    expect(blockMeta(overdue)).toEqual({
      total: formatMoneyBrl('300.00'),
      count: '1 lançamento',
    });
    expect(within(overdue).getByText(/400,00/)).toBeTruthy();
    expect(blockMeta(realized).total).not.toBe(formatMoneyBrl('400.00'));
    expect(screen.getAllByText('Cliente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('15/09/2026').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Honorários').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Serviços · Consultoria').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Operações · Comercial').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Realizado').length).toBeGreaterThan(0);
  });

  it('renderiza blocos de saídas com Fornecedor e A pagar', async () => {
    mockBySituation(getReportsExpensesDetails, {
      REALIZED: page('REALIZED', {
        items: [item('REALIZED', { partyName: 'Fornecedor Z', installmentKind: 'PAYABLE' })],
      }),
      EXPECTED: page('EXPECTED', {
        items: [item('EXPECTED', { partyName: 'Fornecedor Z', installmentKind: 'PAYABLE' })],
      }),
      OVERDUE: emptyPage('OVERDUE'),
    });
    renderSection(REPORT_TYPE_EXPENSES);
    expect(await screen.findByRole('region', { name: 'Saídas realizadas' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'A pagar' })).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Vencido' })).toBeTruthy();
    expect(screen.getAllByText('Fornecedor').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Fornecedor Z').length).toBeGreaterThan(0);
    expect(screen.getAllByText('A pagar').length).toBeGreaterThan(0);
    expect(getReportsRevenueDetails).not.toHaveBeenCalled();
  });

  it('mostra empty states sem esconder o bloco', async () => {
    renderSection();
    expect(await screen.findByText('Nenhuma entrada realizada no período.')).toBeTruthy();
    expect(screen.getByText('Nenhum valor a receber no período.')).toBeTruthy();
    expect(screen.getByText('Nenhum título vencido no período.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'Entradas realizadas' })).toBeTruthy();
  });

  it('split unavailable não aparece como zero', async () => {
    mockBySituation(getReportsRevenueDetails, {
      REALIZED: {
        ...emptyPage('REALIZED'),
        available: false,
        unavailableReason: 'COST_CENTER_SPLIT',
        totalAmount: null,
        itemCount: 0,
      },
    });
    renderSection();
    const realized = await screen.findByRole('region', { name: 'Entradas realizadas' });
    expect(within(realized).getByText(/rateio por centro de custo/i)).toBeTruthy();
    expect(within(realized).queryByText(formatMoneyBrl('0'))).toBeNull();
    expect(within(realized).queryByText('0 lançamentos')).toBeNull();
  });

  it('erro em REALIZED preserva EXPECTED e OVERDUE', async () => {
    mockBySituation(getReportsRevenueDetails, {
      REALIZED: new Error('boom'),
      EXPECTED: page('EXPECTED'),
      OVERDUE: page('OVERDUE'),
    });
    renderSection();
    expect(
      await screen.findByText('Não foi possível carregar os lançamentos de receita.'),
    ).toBeTruthy();
    expect(screen.getByRole('region', { name: 'A receber' }).getAttribute('data-report-transactions-state')).toBe(
      'ready',
    );
    expect(screen.getByRole('region', { name: 'Vencido' }).getAttribute('data-report-transactions-state')).toBe(
      'ready',
    );
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeTruthy();
  });

  it('exibe loading acessível enquanto os blocos carregam', async () => {
    let releaseGate: (() => void) | undefined;
    const gate = new Promise<void>((resolve) => {
      releaseGate = resolve;
    });
    vi.mocked(getReportsRevenueDetails).mockImplementation(async (options) => {
      await gate;
      return emptyPage(options.situation);
    });
    renderSection();
    expect(await screen.findAllByText('Carregando lançamentos')).toHaveLength(3);
    releaseGate?.();
    expect(await screen.findByText('Nenhuma entrada realizada no período.')).toBeTruthy();
  });

  it('Carregar mais usa offset, não duplica e some ao atingir itemCount', async () => {
    const first = Array.from({ length: REPORT_TRANSACTIONS_PAGE_SIZE }, (_, index) =>
      item('REALIZED', {
        installmentExternalId: `inst-${index}`,
        settlementExternalId: `set-${index}`,
        amount: '10.00',
      }),
    );
    const extra = item('REALIZED', {
      installmentExternalId: 'inst-extra',
      settlementExternalId: 'set-extra',
      amount: '20.00',
    });
    vi.mocked(getReportsRevenueDetails).mockImplementation(async (options) => {
      if (options.situation !== 'REALIZED') {
        return emptyPage(options.situation);
      }
      if ((options.offset ?? 0) === 0) {
        return page('REALIZED', {
          totalAmount: '270.00',
          itemCount: REPORT_TRANSACTIONS_PAGE_SIZE + 1,
          offset: 0,
          items: first,
        });
      }
      expect(options.offset).toBe(REPORT_TRANSACTIONS_PAGE_SIZE);
      expect(options.limit).toBe(REPORT_TRANSACTIONS_PAGE_SIZE);
      return page('REALIZED', {
        totalAmount: '270.00',
        itemCount: REPORT_TRANSACTIONS_PAGE_SIZE + 1,
        offset: REPORT_TRANSACTIONS_PAGE_SIZE,
        items: [extra],
      });
    });
    renderSection();
    const realized = await screen.findByRole('region', { name: 'Entradas realizadas' });
    expect(blockMeta(realized).total).toBe(formatMoneyBrl('270.00'));
    expect(within(realized).getAllByRole('row')).toHaveLength(REPORT_TRANSACTIONS_PAGE_SIZE + 1);
    const loadMore = await screen.findByRole('button', { name: /carregar mais entradas realizadas/i });
    fireEvent.click(loadMore);
    await waitFor(() => {
      expect(realized.querySelector('[data-transaction-row="settlement:set-extra"]')).toBeTruthy();
    });
    expect(within(realized).getAllByRole('row')).toHaveLength(REPORT_TRANSACTIONS_PAGE_SIZE + 2);
    expect(screen.queryByRole('button', { name: /carregar mais entradas realizadas/i })).toBeNull();
    const keys = within(realized)
      .getAllByRole('row')
      .slice(1)
      .map((row) => row.getAttribute('data-transaction-row'));
    expect(new Set(keys).size).toBe(keys.length);
    expect(keys[0]).toBe('settlement:set-0');
  });
});
