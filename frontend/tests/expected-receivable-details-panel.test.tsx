import { render, screen, cleanup } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import {
  EXPECTED_RECEIVABLE_CATEGORY_FALLBACK,
  EXPECTED_RECEIVABLE_CUSTOMER_FALLBACK,
  EXPECTED_RECEIVABLE_DESCRIPTION_FALLBACK,
  ExpectedReceivableDetailsPanel,
  formatExpectedReceivableCategories,
  formatExpectedReceivableCustomerName,
  formatExpectedReceivableDescription,
} from '../src/components/dashboard/expected-receivable-details-panel';

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
    customerName: 'Maria Silva',
    categoryNames: ['Consultas'],
  };

  it('com customerName presente mostra o nome real do cliente', () => {
    render(<ExpectedReceivableDetailsPanel items={[item]} />);
    expect(screen.getByText('Maria Silva')).toBeTruthy();
    expect(screen.queryByText(EXPECTED_RECEIVABLE_CUSTOMER_FALLBACK)).toBeNull();
    expect(screen.getByText('R$ 978,00')).toBeTruthy();
    expect(screen.getByText(/31\/08\/2026 · Consulta/)).toBeTruthy();
    expect(screen.getByText('Consultas')).toBeTruthy();
  });

  it('com customerName null mostra fallback sem afetar descrição, categoria, valor e vencimento', () => {
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
          },
        ]}
      />,
    );
    expect(screen.getByText(EXPECTED_RECEIVABLE_CUSTOMER_FALLBACK)).toBeTruthy();
    expect(screen.getByText('R$ 3.267,32')).toBeTruthy();
    expect(screen.getByText(/03\/09\/2026 · Recebimento - Rede Itaú/)).toBeTruthy();
    expect(screen.getByText('Consultas')).toBeTruthy();
  });

  it('fallbacks honestos', () => {
    expect(formatExpectedReceivableCustomerName(null)).toBe(EXPECTED_RECEIVABLE_CUSTOMER_FALLBACK);
    expect(formatExpectedReceivableCustomerName('')).toBe(EXPECTED_RECEIVABLE_CUSTOMER_FALLBACK);
    expect(formatExpectedReceivableCustomerName('  ')).toBe(EXPECTED_RECEIVABLE_CUSTOMER_FALLBACK);
    expect(formatExpectedReceivableCustomerName('Maria Silva')).toBe('Maria Silva');
    expect(formatExpectedReceivableDescription(null)).toBe(EXPECTED_RECEIVABLE_DESCRIPTION_FALLBACK);
    expect(formatExpectedReceivableCategories([])).toBe(EXPECTED_RECEIVABLE_CATEGORY_FALLBACK);
    expect(formatExpectedReceivableCategories(['A', 'B'])).toBe('A · B');
  });
});
