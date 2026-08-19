import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { calculateReceivableDelinquency } from '../src/modules/analytics/domain/receivable-delinquency.js';
import type { InstallmentStockSnapshot } from '../src/modules/analytics/domain/types.js';

function snapshot(open: string, overdue: string, upcoming: string): InstallmentStockSnapshot {
  return {
    open: new Prisma.Decimal(open),
    overdue: new Prisma.Decimal(overdue),
    upcoming: new Prisma.Decimal(upcoming),
  };
}

describe('calculateReceivableDelinquency', () => {
  it('open = 0 e overdue = 0 retorna rate null', () => {
    const result = calculateReceivableDelinquency(snapshot('0', '0', '0'));
    expect(result.rate).toBeNull();
    expect(result.openUnpaid.equals(0)).toBe(true);
    expect(result.overdueUnpaid.equals(0)).toBe(true);
  });

  it('aberto sem vencido retorna Decimal zero, não null', () => {
    const result = calculateReceivableDelinquency(snapshot('100', '0', '100'));
    expect(result.rate).toBeInstanceOf(Prisma.Decimal);
    expect(result.rate!.equals(0)).toBe(true);
    expect(typeof result.rate).not.toBe('number');
  });

  it('tudo vencido retorna 100', () => {
    const result = calculateReceivableDelinquency(snapshot('100', '100', '0'));
    expect(result.rate!.equals(100)).toBe(true);
  });

  it('metade vencida retorna 50', () => {
    const result = calculateReceivableDelinquency(snapshot('100', '50', '50'));
    expect(result.rate!.equals(50)).toBe(true);
  });

  it('não arredonda decimal periódico', () => {
    const result = calculateReceivableDelinquency(snapshot('300', '100', '200'));
    const expected = new Prisma.Decimal(100).div(300).times(100);
    expect(result.rate!.equals(expected)).toBe(true);
    expect(result.rate!.toString()).not.toBe('33');
    expect(result.rate!.toString()).not.toBe('33.33');
  });

  it('preserva centavos no unpaid do snapshot', () => {
    const result = calculateReceivableDelinquency(snapshot('10.50', '1.25', '9.25'));
    const expected = new Prisma.Decimal('1.25').div('10.50').times(100);
    expect(result.rate!.equals(expected)).toBe(true);
    expect(result.overdueUnpaid.equals(new Prisma.Decimal('1.25'))).toBe(true);
  });

  it('aceita unpaid residual já refletido pela 9A (PARTIALLY_PAID)', () => {
    const result = calculateReceivableDelinquency(snapshot('4.7500', '4.7500', '0'));
    expect(result.rate!.equals(100)).toBe(true);
  });

  it('com snapshot válido a taxa não ultrapassa 100', () => {
    const result = calculateReceivableDelinquency(snapshot('80', '80', '0'));
    expect(result.rate!.lessThanOrEqualTo(100)).toBe(true);
    const mixed = calculateReceivableDelinquency(snapshot('80', '20', '60'));
    expect(mixed.rate!.lessThanOrEqualTo(100)).toBe(true);
  });
});
