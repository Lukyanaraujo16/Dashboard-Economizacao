import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ComponentProps } from 'react';

import { CashCategoryDrilldown } from '../src/components/dashboard/cash-category-drilldown';
import type { DashboardCashRealizedCategoryComposition } from '../src/services/dashboard/monthly-cash-flow.types';

const getDetails = vi.fn();

vi.mock('../src/services/dashboard/cash-realized-details', () => ({
  getDashboardCashRealizedDetails: (...args: unknown[]) => getDetails(...args),
}));

const composition: DashboardCashRealizedCategoryComposition = {
  total: '100',
  classified: '100',
  uncategorized: '0',
  imprecise: '0',
  coverageRate: '100',
  items: [
    {
      kind: 'category',
      key: 'cat-a',
      name: 'Serviços',
      amount: '100',
      percentage: '100',
    },
  ],
};

function renderDrilldown(overrides?: Partial<ComponentProps<typeof CashCategoryDrilldown>>) {
  return render(
    <CashCategoryDrilldown
      composition={composition}
      direction="inflows"
      monthKey="2026-08"
      tenantId="tenant-a"
      costCenterId={null}
      categoryId={null}
      {...overrides}
    />,
  );
}

describe('CashCategoryDrilldown (12-C)', () => {
  beforeEach(() => {
    getDetails.mockReset();
  });

  afterEach(() => {
    cleanup();
  });

  it('categoria inicia fechada e busca lazy ao expandir', async () => {
    getDetails.mockResolvedValue({
      today: '2026-08-26',
      monthKey: '2026-08',
      from: '2026-08-01',
      to: '2026-08-31',
      direction: 'inflows',
      categoryKey: 'cat-a',
      categoryKind: 'category',
      available: true,
      total: '100',
      itemCount: 2,
      limit: 100,
      offset: 0,
      items: [
        {
          settlementExternalId: 's1',
          installmentExternalId: 'ar-1',
          installmentKind: 'RECEIVABLE',
          occurredOn: '2026-08-05',
          netAmount: '60',
          attributedAmount: '60',
          description: 'Baixa 1',
          partyName: 'Cliente X',
          categoryNames: ['Serviços'],
          categoryExternalIds: ['cat-a'],
          categoryKey: 'cat-a',
          categoryKind: 'category',
          categoryName: 'Serviços',
        },
        {
          settlementExternalId: 's2',
          installmentExternalId: 'ar-2',
          installmentKind: 'RECEIVABLE',
          occurredOn: '2026-08-06',
          netAmount: '40',
          attributedAmount: '40',
          description: null,
          partyName: 'Cliente X',
          categoryNames: ['Serviços'],
          categoryExternalIds: ['cat-a'],
          categoryKey: 'cat-a',
          categoryKind: 'category',
          categoryName: 'Serviços',
        },
      ],
    });

    renderDrilldown();
    expect(getDetails).not.toHaveBeenCalled();
    const toggle = screen.getByRole('button', { name: /Serviços/i });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    await waitFor(() => expect(getDetails).toHaveBeenCalledTimes(1));
    expect(getDetails.mock.calls[0]?.[0]).toMatchObject({
      direction: 'inflows',
      categoryKey: 'cat-a',
      categoryKind: 'category',
      monthKey: '2026-08',
    });

    expect(await screen.findByText('Cliente X')).toBeTruthy();
    expect(screen.getAllByText(/R\$\s*100,00/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: /Cliente X/i }));
    expect(await screen.findByText(/05\/08\/2026/)).toBeTruthy();
    expect(screen.getByText(/Baixa 1/)).toBeTruthy();
  });

  it('party ausente usa description; fallback neutro', async () => {
    getDetails.mockResolvedValue({
      today: '2026-08-26',
      monthKey: '2026-08',
      from: '2026-08-01',
      to: '2026-08-31',
      direction: 'outflows',
      categoryKey: 'cat-exp',
      categoryKind: 'category',
      available: true,
      total: '30',
      itemCount: 2,
      limit: 100,
      offset: 0,
      items: [
        {
          settlementExternalId: 's1',
          installmentExternalId: 'ap-1',
          installmentKind: 'PAYABLE',
          occurredOn: '2026-08-05',
          netAmount: '10',
          attributedAmount: '10',
          description: 'Folha agosto',
          partyName: null,
          categoryNames: ['Salários'],
          categoryExternalIds: ['cat-exp'],
          categoryKey: 'cat-exp',
          categoryKind: 'category',
          categoryName: 'Salários',
        },
        {
          settlementExternalId: 's2',
          installmentExternalId: 'ap-2',
          installmentKind: 'PAYABLE',
          occurredOn: '2026-08-06',
          netAmount: '20',
          attributedAmount: '20',
          description: null,
          partyName: null,
          categoryNames: ['Salários'],
          categoryExternalIds: ['cat-exp'],
          categoryKey: 'cat-exp',
          categoryKind: 'category',
          categoryName: 'Salários',
        },
      ],
    });

    renderDrilldown({
      direction: 'outflows',
      composition: {
        ...composition,
        items: [
          {
            kind: 'category',
            key: 'cat-exp',
            name: 'Salários',
            amount: '30',
            percentage: '100',
          },
        ],
      },
    });

    fireEvent.click(screen.getByRole('button', { name: /Salários/i }));
    expect(await screen.findByText('Folha agosto')).toBeTruthy();
    expect(screen.getByText('Sem contraparte identificada')).toBeTruthy();
  });

  it('erro mostra retry e não quebra o modal', async () => {
    getDetails.mockRejectedValueOnce(new Error('boom'));
    renderDrilldown();
    fireEvent.click(screen.getByRole('button', { name: /Serviços/i }));
    expect(await screen.findByText(/Não foi possível carregar/i)).toBeTruthy();
    getDetails.mockResolvedValue({
      today: '2026-08-26',
      monthKey: '2026-08',
      from: '2026-08-01',
      to: '2026-08-31',
      direction: 'inflows',
      categoryKey: 'cat-a',
      categoryKind: 'category',
      available: true,
      total: '0',
      itemCount: 0,
      limit: 100,
      offset: 0,
      items: [],
    });
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    expect(await screen.findByText(/Sem lançamentos nesta categoria/i)).toBeTruthy();
  });

  it('paginação carrega mais sem duplicar e preserva total da categoria', async () => {
    getDetails
      .mockResolvedValueOnce({
        today: '2026-08-26',
        monthKey: '2026-08',
        from: '2026-08-01',
        to: '2026-08-31',
        direction: 'inflows',
        categoryKey: 'cat-a',
        categoryKind: 'category',
        available: true,
        total: '150',
        itemCount: 2,
        limit: 1,
        offset: 0,
        items: [
          {
            settlementExternalId: 's1',
            installmentExternalId: 'ar-1',
            installmentKind: 'RECEIVABLE',
            occurredOn: '2026-08-01',
            netAmount: '100',
            attributedAmount: '100',
            description: null,
            partyName: 'A',
            categoryNames: ['Serviços'],
            categoryExternalIds: ['cat-a'],
            categoryKey: 'cat-a',
            categoryKind: 'category',
            categoryName: 'Serviços',
          },
        ],
      })
      .mockResolvedValueOnce({
        today: '2026-08-26',
        monthKey: '2026-08',
        from: '2026-08-01',
        to: '2026-08-31',
        direction: 'inflows',
        categoryKey: 'cat-a',
        categoryKind: 'category',
        available: true,
        total: '150',
        itemCount: 2,
        limit: 1,
        offset: 1,
        items: [
          {
            settlementExternalId: 's2',
            installmentExternalId: 'ar-2',
            installmentKind: 'RECEIVABLE',
            occurredOn: '2026-08-02',
            netAmount: '50',
            attributedAmount: '50',
            description: null,
            partyName: 'B',
            categoryNames: ['Serviços'],
            categoryExternalIds: ['cat-a'],
            categoryKey: 'cat-a',
            categoryKind: 'category',
            categoryName: 'Serviços',
          },
        ],
      });

    renderDrilldown();
    fireEvent.click(screen.getByRole('button', { name: /Serviços/i }));
    expect(await screen.findByText('A')).toBeTruthy();
    // total da categoria permanece no header (100 do composition fixture — pai)
    const categoryButton = screen.getByRole('button', { name: /Serviços/i });
    expect(within(categoryButton).getByText(/R\$\s*100,00/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /Carregar mais/i }));
    expect(await screen.findByText('B')).toBeTruthy();
    expect(getDetails).toHaveBeenCalledTimes(2);
    expect(getDetails.mock.calls[1]?.[0]).toMatchObject({ offset: 1 });
  });

  it('troca de mês invalida cache', async () => {
    getDetails.mockResolvedValue({
      today: '2026-08-26',
      monthKey: '2026-08',
      from: '2026-08-01',
      to: '2026-08-31',
      direction: 'inflows',
      categoryKey: 'cat-a',
      categoryKind: 'category',
      available: true,
      total: '10',
      itemCount: 1,
      limit: 100,
      offset: 0,
      items: [
        {
          settlementExternalId: 's1',
          installmentExternalId: 'ar-1',
          installmentKind: 'RECEIVABLE',
          occurredOn: '2026-08-05',
          netAmount: '10',
          attributedAmount: '10',
          description: null,
          partyName: 'Agosto',
          categoryNames: ['Serviços'],
          categoryExternalIds: ['cat-a'],
          categoryKey: 'cat-a',
          categoryKind: 'category',
          categoryName: 'Serviços',
        },
      ],
    });

    const { rerender } = renderDrilldown({ monthKey: '2026-08' });
    fireEvent.click(screen.getByRole('button', { name: /Serviços/i }));
    expect(await screen.findByText('Agosto')).toBeTruthy();
    expect(getDetails).toHaveBeenCalledTimes(1);

    getDetails.mockResolvedValue({
      today: '2026-09-01',
      monthKey: '2026-09',
      from: '2026-09-01',
      to: '2026-09-30',
      direction: 'inflows',
      categoryKey: 'cat-a',
      categoryKind: 'category',
      available: true,
      total: '5',
      itemCount: 1,
      limit: 100,
      offset: 0,
      items: [
        {
          settlementExternalId: 's9',
          installmentExternalId: 'ar-9',
          installmentKind: 'RECEIVABLE',
          occurredOn: '2026-09-05',
          netAmount: '5',
          attributedAmount: '5',
          description: null,
          partyName: 'Setembro',
          categoryNames: ['Serviços'],
          categoryExternalIds: ['cat-a'],
          categoryKey: 'cat-a',
          categoryKind: 'category',
          categoryName: 'Serviços',
        },
      ],
    });

    rerender(
      <CashCategoryDrilldown
        composition={composition}
        direction="inflows"
        monthKey="2026-09"
        tenantId="tenant-a"
        costCenterId={null}
        categoryId={null}
      />,
    );
    expect(screen.queryByText('Agosto')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Serviços/i }));
    expect(await screen.findByText('Setembro')).toBeTruthy();
    expect(getDetails).toHaveBeenCalledTimes(2);
    expect(getDetails.mock.calls[1]?.[0]).toMatchObject({ monthKey: '2026-09' });
  });

  it('envia categoryKind junto com categoryKey (desambiguação)', async () => {
    getDetails.mockResolvedValue({
      today: '2026-08-26',
      monthKey: '2026-08',
      from: '2026-08-01',
      to: '2026-08-31',
      direction: 'inflows',
      categoryKey: 'uncategorized',
      categoryKind: 'uncategorized',
      available: true,
      total: '1',
      itemCount: 0,
      limit: 100,
      offset: 0,
      items: [],
    });

    renderDrilldown({
      composition: {
        ...composition,
        items: [
          {
            kind: 'uncategorized',
            key: 'uncategorized',
            name: 'Sem categoria',
            amount: '1',
            percentage: '100',
          },
        ],
      },
    });
    fireEvent.click(screen.getByRole('button', { name: /Sem categoria/i }));
    await waitFor(() => expect(getDetails).toHaveBeenCalled());
    expect(getDetails.mock.calls[0]?.[0]).toMatchObject({
      categoryKey: 'uncategorized',
      categoryKind: 'uncategorized',
    });
  });
});
