import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EXPECTED_PAYABLE_CATEGORY_FALLBACK,
  EXPECTED_PAYABLE_DESCRIPTION_FALLBACK,
  EXPECTED_PAYABLE_SUPPLIER_FALLBACK,
  ExpectedPayableDetailsPanel,
  formatExpectedPayableCategories,
  formatExpectedPayableDescription,
  formatExpectedPayableSupplierName,
} from '../src/components/dashboard/expected-payable-details-panel';

describe('ExpectedPayableDetailsPanel', () => {
  afterEach(() => {
    cleanup();
  });

  const item = {
    id: 'id-1',
    externalId: 'ext-1',
    dueDate: '2026-08-31',
    amount: '1250',
    description: 'Honorários contábeis',
    supplierName: 'Fornecedor XYZ',
    categoryNames: ['Contabilidade'],
  };

  it('com supplierName presente mostra o nome real do fornecedor', () => {
    render(<ExpectedPayableDetailsPanel items={[item]} />);
    expect(screen.getByText('Fornecedor XYZ')).toBeTruthy();
    expect(screen.queryByText(EXPECTED_PAYABLE_SUPPLIER_FALLBACK)).toBeNull();
    expect(screen.getByText('R$ 1.250,00')).toBeTruthy();
    expect(screen.getByText(/31\/08\/2026 · Honorários contábeis/)).toBeTruthy();
    expect(screen.getByText('Contabilidade')).toBeTruthy();
  });

  it('com supplierName null mostra fallback sem afetar descrição, categoria, valor e vencimento', () => {
    render(
      <ExpectedPayableDetailsPanel
        items={[
          {
            ...item,
            supplierName: null,
            description: 'Aluguel',
            amount: '3267.32',
            dueDate: '2026-09-03',
            categoryNames: ['Consultas'],
          },
        ]}
      />,
    );
    expect(screen.getByText(EXPECTED_PAYABLE_SUPPLIER_FALLBACK)).toBeTruthy();
    expect(screen.getByText('R$ 3.267,32')).toBeTruthy();
    expect(screen.getByText(/03\/09\/2026 · Aluguel/)).toBeTruthy();
    expect(screen.getByText('Consultas')).toBeTruthy();
  });

  it('fallbacks honestos', () => {
    expect(formatExpectedPayableSupplierName(null)).toBe(EXPECTED_PAYABLE_SUPPLIER_FALLBACK);
    expect(formatExpectedPayableSupplierName('')).toBe(EXPECTED_PAYABLE_SUPPLIER_FALLBACK);
    expect(formatExpectedPayableSupplierName('  ')).toBe(EXPECTED_PAYABLE_SUPPLIER_FALLBACK);
    expect(formatExpectedPayableSupplierName('Fornecedor XYZ')).toBe('Fornecedor XYZ');
    expect(formatExpectedPayableDescription(null)).toBe(EXPECTED_PAYABLE_DESCRIPTION_FALLBACK);
    expect(formatExpectedPayableCategories([])).toBe(EXPECTED_PAYABLE_CATEGORY_FALLBACK);
    expect(formatExpectedPayableCategories(['A', 'B'])).toBe('A · B');
  });
});
