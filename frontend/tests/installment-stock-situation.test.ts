import { describe, expect, it } from 'vitest';

import { formatInstallmentStockSituation } from '../src/components/dashboard/installment-stock-situation';

describe('formatInstallmentStockSituation', () => {
  it('formata vencido / hoje / a vencer', () => {
    expect(formatInstallmentStockSituation('OVERDUE', 1)).toBe('Vencido há 1 dia');
    expect(formatInstallmentStockSituation('OVERDUE', 4)).toBe('Vencido há 4 dias');
    expect(formatInstallmentStockSituation('OVERDUE', null)).toBe('Vencido');
    expect(formatInstallmentStockSituation('DUE_TODAY', null)).toBe('Vence hoje');
    expect(formatInstallmentStockSituation('UPCOMING', null)).toBe('A vencer');
  });
});
