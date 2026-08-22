import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  aggregateCostCenterCashSplits,
  deriveInstallmentCostCenterCashSplit,
} from '../src/modules/analytics/domain/cost-center-cash-split.js';

const today = new Date('2026-08-21T12:00:00.000Z');
const pastDue = new Date('2026-08-01T00:00:00.000Z');
const futureDue = new Date('2026-09-01T00:00:00.000Z');

describe('deriveInstallmentCostCenterCashSplit', () => {
  it('single-center 100%: received=paid outstanding=unpaid', () => {
    const result = deriveInstallmentCostCenterCashSplit({
      allocationAmount: new Prisma.Decimal('1000'),
      installmentTotal: new Prisma.Decimal('1000'),
      paid: new Prisma.Decimal('400'),
      unpaid: new Prisma.Decimal('600'),
      dueDate: futureDue,
      today,
    });
    expect(result.kind).toBe('EXACT');
    if (result.kind === 'EXACT') {
      expect(result.received.toString()).toBe('400');
      expect(result.outstanding.toString()).toBe('600');
      expect(result.overdue.toString()).toBe('0');
    }
  });

  it('single-center overdue unpaid → overdue = unpaid', () => {
    const result = deriveInstallmentCostCenterCashSplit({
      allocationAmount: new Prisma.Decimal('100'),
      installmentTotal: new Prisma.Decimal('100'),
      paid: new Prisma.Decimal('0'),
      unpaid: new Prisma.Decimal('100'),
      dueDate: pastDue,
      today,
    });
    expect(result.kind).toBe('EXACT');
    if (result.kind === 'EXACT') {
      expect(result.overdue.toString()).toBe('100');
    }
  });

  it('multi-center fully paid → received = allocation', () => {
    const result = deriveInstallmentCostCenterCashSplit({
      allocationAmount: new Prisma.Decimal('600'),
      installmentTotal: new Prisma.Decimal('1000'),
      paid: new Prisma.Decimal('1000'),
      unpaid: new Prisma.Decimal('0'),
      dueDate: futureDue,
      today,
    });
    expect(result.kind).toBe('EXACT');
    if (result.kind === 'EXACT') {
      expect(result.received.toString()).toBe('600');
      expect(result.outstanding.toString()).toBe('0');
    }
  });

  it('multi-center fully open → outstanding = allocation', () => {
    const result = deriveInstallmentCostCenterCashSplit({
      allocationAmount: new Prisma.Decimal('400'),
      installmentTotal: new Prisma.Decimal('1000'),
      paid: new Prisma.Decimal('0'),
      unpaid: new Prisma.Decimal('1000'),
      dueDate: futureDue,
      today,
    });
    expect(result.kind).toBe('EXACT');
    if (result.kind === 'EXACT') {
      expect(result.received.toString()).toBe('0');
      expect(result.outstanding.toString()).toBe('400');
    }
  });

  it('multi-center partial → UNAVAILABLE (não proporcionaliza)', () => {
    const result = deriveInstallmentCostCenterCashSplit({
      allocationAmount: new Prisma.Decimal('600'),
      installmentTotal: new Prisma.Decimal('1000'),
      paid: new Prisma.Decimal('500'),
      unpaid: new Prisma.Decimal('500'),
      dueDate: futureDue,
      today,
    });
    expect(result).toEqual({ kind: 'UNAVAILABLE' });
  });
});

describe('aggregateCostCenterCashSplits', () => {
  it('qualquer UNAVAILABLE zera o split do mês', () => {
    const agg = aggregateCostCenterCashSplits([
      {
        kind: 'EXACT',
        received: new Prisma.Decimal('100'),
        outstanding: new Prisma.Decimal('0'),
        overdue: new Prisma.Decimal('0'),
      },
      { kind: 'UNAVAILABLE' },
    ]);
    expect(agg.costCenterCashSplit).toBe(false);
    expect(agg.received).toBeNull();
  });

  it('soma EXACT', () => {
    const agg = aggregateCostCenterCashSplits([
      {
        kind: 'EXACT',
        received: new Prisma.Decimal('100'),
        outstanding: new Prisma.Decimal('50'),
        overdue: new Prisma.Decimal('10'),
      },
      {
        kind: 'EXACT',
        received: new Prisma.Decimal('20'),
        outstanding: new Prisma.Decimal('30'),
        overdue: new Prisma.Decimal('0'),
      },
    ]);
    expect(agg.costCenterCashSplit).toBe(true);
    expect(agg.received?.toString()).toBe('120');
    expect(agg.outstanding?.toString()).toBe('80');
    expect(agg.overdue?.toString()).toBe('10');
  });
});
