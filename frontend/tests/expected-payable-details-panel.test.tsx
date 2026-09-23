import { render, screen, cleanup, within } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EXPECTED_PAYABLE_CATEGORY_FALLBACK,
  EXPECTED_PAYABLE_DESCRIPTION_FALLBACK,
  EXPECTED_PAYABLE_SUPPLIER_FALLBACK,
  EXPECTED_PAYABLE_TITLE_FALLBACK,
  ExpectedPayableDetailsPanel,
  formatExpectedPayableCategories,
  formatExpectedPayableDescription,
  resolveExpectedPayableTitlePresentation,
} from '../src/components/dashboard/expected-payable-details-panel';

describe('ExpectedPayableDetailsPanel', () => {
  afterEach(() => {
    cleanup();
  });

  const base = {
    id: 'id-1',
    externalId: 'ext-1',
    dueDate: '2026-09-24',
    amount: '1004.86',
    description: '13/365 - Conta de Luz - Jacaraípe',
    supplierName: 'Fornecedor ABC' as string | null,
    categoryNames: ['Energia Elétrica'] as readonly string[],
  };

  it('CASO 1 — fornecedor + categoria: título fornecedor e categoria abaixo', () => {
    render(
      <ExpectedPayableDetailsPanel
        items={[
          {
            ...base,
            supplierName: 'Fornecedor ABC',
            categoryNames: ['Energia Elétrica'],
          },
        ]}
      />,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Fornecedor ABC')).toBeTruthy();
    expect(within(item).getByText('Energia Elétrica')).toBeTruthy();
    expect(screen.queryByText(EXPECTED_PAYABLE_SUPPLIER_FALLBACK)).toBeNull();
    expect(screen.getByText('R$ 1.004,86')).toBeTruthy();
  });

  it('CASO 2 — sem fornecedor + categoria: título categoria sem duplicar abaixo', () => {
    render(
      <ExpectedPayableDetailsPanel
        items={[
          {
            ...base,
            supplierName: null,
            categoryNames: ['Energia Elétrica'],
          },
        ]}
      />,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Energia Elétrica')).toBeTruthy();
    expect(within(item).queryByText(EXPECTED_PAYABLE_SUPPLIER_FALLBACK)).toBeNull();
    expect(screen.queryByText(EXPECTED_PAYABLE_SUPPLIER_FALLBACK)).toBeNull();
    // Uma única ocorrência do nome da categoria (título), sem linha terciária.
    expect(within(item).getAllByText('Energia Elétrica')).toHaveLength(1);
    expect(item.querySelectorAll('p')).toHaveLength(1); // só secondary (data · descrição)
  });

  it('CASO 3 — sem fornecedor + Salário dos Colaboradores como título', () => {
    render(
      <ExpectedPayableDetailsPanel
        items={[
          {
            ...base,
            supplierName: null,
            description: '6/365 - Salário Ana Paula Gomes Margon - Estagiária',
            amount: '1107.10',
            dueDate: '2026-09-25',
            categoryNames: ['Salário dos Colaboradores'],
          },
        ]}
      />,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Salário dos Colaboradores')).toBeTruthy();
    expect(within(item).getAllByText('Salário dos Colaboradores')).toHaveLength(1);
    expect(screen.queryByText(EXPECTED_PAYABLE_SUPPLIER_FALLBACK)).toBeNull();
  });

  it('CASO 4 — sem fornecedor nem categoria: Pagamento previsto', () => {
    render(
      <ExpectedPayableDetailsPanel
        items={[
          {
            ...base,
            supplierName: null,
            categoryNames: [],
          },
        ]}
      />,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByText(EXPECTED_PAYABLE_TITLE_FALLBACK)).toBeTruthy();
    expect(screen.queryByText(EXPECTED_PAYABLE_SUPPLIER_FALLBACK)).toBeNull();
    expect(screen.queryByText(EXPECTED_PAYABLE_CATEGORY_FALLBACK)).toBeNull();
    expect(item.querySelectorAll('p')).toHaveLength(1);
  });

  it('CASO 5 — fornecedor vazio/espaços + categoria válida → título categoria', () => {
    render(
      <ExpectedPayableDetailsPanel
        items={[
          {
            ...base,
            supplierName: '   ',
            categoryNames: ['Energia Elétrica'],
          },
        ]}
      />,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Energia Elétrica')).toBeTruthy();
    expect(within(item).getAllByText('Energia Elétrica')).toHaveLength(1);
    expect(screen.queryByText(EXPECTED_PAYABLE_SUPPLIER_FALLBACK)).toBeNull();
  });

  it('CASO 6 — fornecedor válido + categoria vazia: sem linha terciária', () => {
    render(
      <ExpectedPayableDetailsPanel
        items={[
          {
            ...base,
            supplierName: 'Fornecedor XYZ',
            categoryNames: ['  ', ''],
          },
        ]}
      />,
    );
    const item = screen.getByRole('listitem');
    expect(within(item).getByText('Fornecedor XYZ')).toBeTruthy();
    expect(screen.queryByText(EXPECTED_PAYABLE_CATEGORY_FALLBACK)).toBeNull();
    expect(item.querySelectorAll('p')).toHaveLength(1);
  });

  it('helpers de formatação e resolução de título', () => {
    expect(
      resolveExpectedPayableTitlePresentation({
        supplierName: null,
        categoryNames: [],
      }).title,
    ).toBe(EXPECTED_PAYABLE_TITLE_FALLBACK);
    expect(
      resolveExpectedPayableTitlePresentation({
        supplierName: '  Fornecedor ABC  ',
        categoryNames: ['Energia Elétrica'],
      }),
    ).toEqual({
      title: 'Fornecedor ABC',
      showCategoryBelow: true,
      categoryBelow: 'Energia Elétrica',
    });
    expect(formatExpectedPayableDescription(null)).toBe(EXPECTED_PAYABLE_DESCRIPTION_FALLBACK);
    expect(formatExpectedPayableCategories([])).toBe(EXPECTED_PAYABLE_CATEGORY_FALLBACK);
    expect(formatExpectedPayableCategories(['A', 'B'])).toBe('A · B');
  });

  it('14 — classifica vencido / hoje / a vencer no estoque', () => {
    render(
      <ExpectedPayableDetailsPanel
        items={[
          {
            ...base,
            id: 'over',
            externalId: 'over',
            dueDate: '2026-09-22',
            situation: 'OVERDUE',
            overdueDays: 1,
          },
          {
            ...base,
            id: 'today',
            externalId: 'today',
            dueDate: '2026-09-23',
            situation: 'DUE_TODAY',
            overdueDays: null,
          },
          {
            ...base,
            id: 'next',
            externalId: 'next',
            dueDate: '2026-09-24',
            situation: 'UPCOMING',
            overdueDays: null,
          },
        ]}
        emptyMessage="Nenhuma conta a pagar em aberto."
        ariaLabel="Títulos a pagar em aberto"
      />,
    );
    expect(screen.getByLabelText('Títulos a pagar em aberto')).toBeTruthy();
    expect(screen.getByText('Vencido há 1 dia')).toBeTruthy();
    expect(screen.getByText('Vence hoje')).toBeTruthy();
    expect(screen.getByText('A vencer')).toBeTruthy();
  });
});
