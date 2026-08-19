import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { calculateInstallmentStockSnapshot } from '../src/modules/analytics/domain/installment-snapshot.js';

const today = new Date('2026-08-19T00:00:00.000Z');

function row(dueDate: string, unpaid: string) {
  return {
    dueDate: new Date(`${dueDate}T00:00:00.000Z`),
    unpaid: new Prisma.Decimal(unpaid),
  };
}

function expectSnapshot(
  actual: ReturnType<typeof calculateInstallmentStockSnapshot>,
  expected: { open: string; overdue: string; upcoming: string },
) {
  expect(actual.open.equals(new Prisma.Decimal(expected.open))).toBe(true);
  expect(actual.overdue.equals(new Prisma.Decimal(expected.overdue))).toBe(true);
  expect(actual.upcoming.equals(new Prisma.Decimal(expected.upcoming))).toBe(true);
  expect(actual.open.equals(actual.overdue.plus(actual.upcoming))).toBe(true);
  expect(actual.open).toBeInstanceOf(Prisma.Decimal);
  expect(typeof actual.open).not.toBe('number');
}

describe('calculateInstallmentStockSnapshot', () => {
  it('zero registros retorna Decimal zero', () => {
    expectSnapshot(calculateInstallmentStockSnapshot([], today), {
      open: '0',
      overdue: '0',
      upcoming: '0',
    });
  });

  it('OPEN vencido entra em overdue', () => {
    expectSnapshot(calculateInstallmentStockSnapshot([row('2026-08-18', '10.50')], today), {
      open: '10.50',
      overdue: '10.50',
      upcoming: '0',
    });
  });

  it('dueDate == hoje entra em upcoming', () => {
    expectSnapshot(calculateInstallmentStockSnapshot([row('2026-08-19', '7.25')], today), {
      open: '7.25',
      overdue: '0',
      upcoming: '7.25',
    });
  });

  it('OPEN futuro entra em upcoming', () => {
    expectSnapshot(calculateInstallmentStockSnapshot([row('2026-08-20', '3')], today), {
      open: '3',
      overdue: '0',
      upcoming: '3',
    });
  });

  it('dueDate passado é overdue independentemente do rótulo de status', () => {
    expectSnapshot(calculateInstallmentStockSnapshot([row('2026-08-01', '1.11')], today), {
      open: '1.11',
      overdue: '1.11',
      upcoming: '0',
    });
  });

  it('dueDate futuro é upcoming mesmo se o persistido fosse OVERDUE', () => {
    expectSnapshot(calculateInstallmentStockSnapshot([row('2026-09-01', '2.22')], today), {
      open: '2.22',
      overdue: '0',
      upcoming: '2.22',
    });
  });

  it('soma unpaid residual de PARTIALLY_PAID vencido', () => {
    expectSnapshot(calculateInstallmentStockSnapshot([row('2026-08-10', '4.7500')], today), {
      open: '4.7500',
      overdue: '4.7500',
      upcoming: '0',
    });
  });

  it('PARTIALLY_PAID hoje entra em upcoming pelo unpaid', () => {
    expectSnapshot(calculateInstallmentStockSnapshot([row('2026-08-19', '1.0001')], today), {
      open: '1.0001',
      overdue: '0',
      upcoming: '1.0001',
    });
  });

  it('PARTIALLY_PAID futuro entra em upcoming', () => {
    expectSnapshot(calculateInstallmentStockSnapshot([row('2026-08-25', '9.99')], today), {
      open: '9.99',
      overdue: '0',
      upcoming: '9.99',
    });
  });

  it('agrega vários registros e preserva centavos', () => {
    const snapshot = calculateInstallmentStockSnapshot(
      [row('2026-08-18', '10.10'), row('2026-08-19', '0.20'), row('2026-08-21', '1.03')],
      today,
    );
    expectSnapshot(snapshot, { open: '11.33', overdue: '10.10', upcoming: '1.23' });
  });
});
