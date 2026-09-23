import { render, screen, cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EXPECTED_RECEIVABLE_CATEGORY_FALLBACK,
  EXPECTED_RECEIVABLE_DESCRIPTION_FALLBACK,
  EXPECTED_RECEIVABLE_TITLE_FALLBACK,
  ExpectedReceivableDetailsPanel,
  formatExpectedReceivableCategories,
  formatExpectedReceivableDescription,
  resolveExpectedReceivableTitlePresentation,
} from '../src/components/dashboard/expected-receivable-details-panel';

const LEGACY_CUSTOMER_FALLBACK = 'Sem cliente vinculado no Conta Azul';

describe('ExpectedReceivableDetailsPanel', () => {
  afterEach(() => {
    cleanup();
  });

  const item = {
    id: 'id-1',
    externalId: 'ext-1',
    dueDate: '2026-08-31',
    amount: '978',
    description: 'Consulta',
    customerName: 'Maria Silva' as string | null,
    categoryNames: ['Consultas'] as readonly string[],
  };

  it('1/2 — customerName presente: título = cliente; categoria permanece abaixo', () => {
    render(<ExpectedReceivableDetailsPanel items={[item]} />);
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Maria Silva')).toBeTruthy();
    expect(within(row).getByText('Consultas')).toBeTruthy();
    expect(within(row).getAllByText('Consultas')).toHaveLength(1);
    expect(screen.queryByText(LEGACY_CUSTOMER_FALLBACK)).toBeNull();
    expect(screen.getByText('R$ 978,00')).toBeTruthy();
    expect(screen.getByText(/31\/08\/2026 · Consulta/)).toBeTruthy();
  });

  it('3/8/9 — customerName null + uma categoria: título = categoria, sem duplicar', () => {
    render(
      <ExpectedReceivableDetailsPanel
        items={[
          {
            ...item,
            customerName: null,
            description: 'Recebimento - Rede Itaú',
            amount: '3267.32',
            dueDate: '2026-09-03',
            categoryNames: ['Consultas'],
            situation: 'UPCOMING',
            overdueDays: null,
          },
        ]}
      />,
    );
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Consultas')).toBeTruthy();
    expect(within(row).getAllByText('Consultas')).toHaveLength(1);
    expect(row.querySelectorAll('p')).toHaveLength(1);
    expect(screen.queryByText(LEGACY_CUSTOMER_FALLBACK)).toBeNull();
    expect(screen.getByText('R$ 3.267,32')).toBeTruthy();
    expect(screen.getByText(/A vencer/)).toBeTruthy();
    expect(screen.getByText(/03\/09\/2026 · Recebimento - Rede Itaú/)).toBeTruthy();
  });

  it('4 — customerName vazio/espaços + uma categoria: título = categoria', () => {
    render(
      <ExpectedReceivableDetailsPanel
        items={[{ ...item, customerName: '   ', categoryNames: ['Consultas'] }]}
      />,
    );
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Consultas')).toBeTruthy();
    expect(within(row).getAllByText('Consultas')).toHaveLength(1);
    expect(screen.queryByText(LEGACY_CUSTOMER_FALLBACK)).toBeNull();
  });

  it('5 — customerName null + múltiplas categorias válidas', () => {
    render(
      <ExpectedReceivableDetailsPanel
        items={[{ ...item, customerName: null, categoryNames: ['Consultas', 'Procedimentos'] }]}
      />,
    );
    const row = screen.getByRole('listitem');
    expect(within(row).getByText('Consultas · Procedimentos')).toBeTruthy();
    expect(within(row).getAllByText('Consultas · Procedimentos')).toHaveLength(1);
    expect(row.querySelectorAll('p')).toHaveLength(1);
    expect(screen.queryByText(LEGACY_CUSTOMER_FALLBACK)).toBeNull();
  });

  it('6 — categoryNames com vazias/espaços são ignoradas', () => {
    expect(
      resolveExpectedReceivableTitlePresentation({
        customerName: null,
        categoryNames: ['  ', '', 'Consultas', '   '],
      }),
    ).toEqual({
      title: 'Consultas',
      showCategoryBelow: false,
      categoryBelow: null,
    });
    expect(formatExpectedReceivableCategories(['  ', 'A', '', 'B'])).toBe('A · B');
  });

  it('7/8 — sem cliente + sem categoria válida: Recebimento previsto', () => {
    render(
      <ExpectedReceivableDetailsPanel
        items={[{ ...item, customerName: null, categoryNames: ['  ', ''] }]}
      />,
    );
    const row = screen.getByRole('listitem');
    expect(within(row).getByText(EXPECTED_RECEIVABLE_TITLE_FALLBACK)).toBeTruthy();
    expect(screen.queryByText(LEGACY_CUSTOMER_FALLBACK)).toBeNull();
    expect(screen.queryByText(EXPECTED_RECEIVABLE_CATEGORY_FALLBACK)).toBeNull();
    expect(row.querySelectorAll('p')).toHaveLength(1);
  });

  it('helpers de formatação e resolução de título', () => {
    expect(
      resolveExpectedReceivableTitlePresentation({
        customerName: '  Maria Silva  ',
        categoryNames: ['Consultas'],
      }),
    ).toEqual({
      title: 'Maria Silva',
      showCategoryBelow: true,
      categoryBelow: 'Consultas',
    });
    expect(
      resolveExpectedReceivableTitlePresentation({
        customerName: null,
        categoryNames: [],
      }).title,
    ).toBe(EXPECTED_RECEIVABLE_TITLE_FALLBACK);
    expect(formatExpectedReceivableDescription(null)).toBe(EXPECTED_RECEIVABLE_DESCRIPTION_FALLBACK);
    expect(formatExpectedReceivableCategories([])).toBe(EXPECTED_RECEIVABLE_CATEGORY_FALLBACK);
    expect(formatExpectedReceivableCategories(['A', 'B'])).toBe('A · B');
  });
});
