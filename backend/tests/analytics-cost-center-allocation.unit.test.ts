import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  buildDailyCompetenceAllocationTotals,
  calculateMonthlyCompetenceFromAllocations,
} from '../src/modules/analytics/domain/cost-center-allocation-math.js';
import {
  IMPRECISE_PAYABLE_BUCKET_NAME,
  UNCATEGORIZED_PAYABLE_BUCKET_NAME,
} from '../src/modules/analytics/domain/payable-category-composition.js';

function row(input: {
  readonly amount: string;
  readonly categoryExternalIds?: readonly string[];
  readonly competenceDate?: string | null;
}) {
  return {
    amount: new Prisma.Decimal(input.amount),
    categoryExternalIds: input.categoryExternalIds ?? [],
    competenceDate:
      input.competenceDate === undefined
        ? new Date('2026-08-10T00:00:00.000Z')
        : input.competenceDate === null
          ? null
          : new Date(`${input.competenceDate}T00:00:00.000Z`),
  };
}

function category(input: {
  readonly externalId: string;
  readonly name: string;
  readonly type?: 'EXPENSE' | 'REVENUE' | 'UNKNOWN';
}) {
  return {
    externalId: input.externalId,
    name: input.name,
    type: input.type ?? 'REVENUE',
  };
}

describe('calculateMonthlyCompetenceFromAllocations', () => {
  it('soma allocation.amount e aplica D8; cash split fica null', () => {
    const result = calculateMonthlyCompetenceFromAllocations(
      [
        row({ amount: '3000', categoryExternalIds: ['serv'] }),
        row({ amount: '2000', categoryExternalIds: ['serv'] }),
        row({ amount: '1000', categoryExternalIds: [] }),
        row({ amount: '500', categoryExternalIds: ['a', 'b'] }),
      ],
      [category({ externalId: 'serv', name: 'Serviços' })],
      'REVENUE',
    );
    expect(result.total.toString()).toBe('6500');
    expect(result.received).toBeNull();
    expect(result.outstanding).toBeNull();
    expect(result.overdue).toBeNull();
    expect(result.classified.toString()).toBe('5000');
    expect(result.uncategorized.toString()).toBe('1000');
    expect(result.imprecise.toString()).toBe('500');
    expect(result.items.find((item) => item.kind === 'category')?.amount.toString()).toBe('5000');
    expect(result.items.find((item) => item.name === UNCATEGORIZED_PAYABLE_BUCKET_NAME)?.amount.toString()).toBe(
      '1000',
    );
    expect(result.items.find((item) => item.name === IMPRECISE_PAYABLE_BUCKET_NAME)?.amount.toString()).toBe(
      '500',
    );
    expect(result.items.every((item) => item.received === null && item.outstanding === null)).toBe(
      true,
    );
  });

  it('marca categoria de tipo errado como imprecisa', () => {
    const result = calculateMonthlyCompetenceFromAllocations(
      [row({ amount: '100', categoryExternalIds: ['x'] })],
      [category({ externalId: 'x', name: 'Despesa', type: 'EXPENSE' })],
      'REVENUE',
    );
    expect(result.imprecise.toString()).toBe('100');
    expect(result.classified.toString()).toBe('0');
  });
});

describe('buildDailyCompetenceAllocationTotals', () => {
  it('agrega por competenceDate e zera dias sem alocação; cash null', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-03T00:00:00.000Z');
    const points = buildDailyCompetenceAllocationTotals(
      [
        row({ amount: '10', competenceDate: '2026-08-01' }),
        row({ amount: '5', competenceDate: '2026-08-01' }),
        row({ amount: '7', competenceDate: '2026-08-03' }),
      ],
      from,
      to,
    );
    expect(points).toHaveLength(3);
    expect(points[0]).toEqual({
      date: from,
      amount: new Prisma.Decimal('15'),
      received: null,
      outstanding: null,
    });
    expect(points[1]?.amount.toString()).toBe('0');
    expect(points[2]?.amount.toString()).toBe('7');
    expect(points.every((point) => point.received === null && point.outstanding === null)).toBe(
      true,
    );
  });
});
