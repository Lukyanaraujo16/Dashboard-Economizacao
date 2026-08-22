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
  readonly installmentTotal?: string;
  readonly paid?: string;
  readonly unpaid?: string;
  readonly dueDate?: string;
}) {
  const amount = input.amount;
  return {
    amount: new Prisma.Decimal(amount),
    categoryExternalIds: input.categoryExternalIds ?? [],
    competenceDate:
      input.competenceDate === undefined
        ? new Date('2026-08-10T00:00:00.000Z')
        : input.competenceDate === null
          ? null
          : new Date(`${input.competenceDate}T00:00:00.000Z`),
    installmentTotal: new Prisma.Decimal(input.installmentTotal ?? amount),
    paid: new Prisma.Decimal(input.paid ?? amount),
    unpaid: new Prisma.Decimal(input.unpaid ?? '0'),
    dueDate: new Date(`${input.dueDate ?? '2026-08-15'}T00:00:00.000Z`),
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
  it('soma allocation.amount e deriva cash split quando 100% no centro', () => {
    const result = calculateMonthlyCompetenceFromAllocations(
      [
        row({ amount: '3000', categoryExternalIds: ['serv'], paid: '3000', unpaid: '0' }),
        row({ amount: '2000', categoryExternalIds: ['serv'], paid: '2000', unpaid: '0' }),
        row({ amount: '1000', categoryExternalIds: [], paid: '1000', unpaid: '0' }),
        row({ amount: '500', categoryExternalIds: ['a', 'b'], paid: '500', unpaid: '0' }),
      ],
      [category({ externalId: 'serv', name: 'Serviços' })],
      'REVENUE',
      undefined,
      new Date('2026-08-21T12:00:00.000Z'),
    );
    expect(result.total.toString()).toBe('6500');
    expect(result.costCenterCashSplit).toBe(true);
    expect(result.received?.toString()).toBe('6500');
    expect(result.outstanding?.toString()).toBe('0');
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

  it('multi-centro parcial → cash split indisponível', () => {
    const result = calculateMonthlyCompetenceFromAllocations(
      [
        row({
          amount: '600',
          installmentTotal: '1000',
          paid: '500',
          unpaid: '500',
          categoryExternalIds: ['serv'],
        }),
      ],
      [category({ externalId: 'serv', name: 'Serviços' })],
      'REVENUE',
      undefined,
      new Date('2026-08-21T12:00:00.000Z'),
    );
    expect(result.total.toString()).toBe('600');
    expect(result.costCenterCashSplit).toBe(false);
    expect(result.received).toBeNull();
    expect(result.outstanding).toBeNull();
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
  const today = new Date('2026-08-21T12:00:00.000Z');

  it('agrega amount por competenceDate; cash EXACT quando single-center', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-03T00:00:00.000Z');
    const points = buildDailyCompetenceAllocationTotals(
      [
        row({ amount: '10', competenceDate: '2026-08-01', paid: '10', unpaid: '0' }),
        row({ amount: '5', competenceDate: '2026-08-01', paid: '5', unpaid: '0' }),
        row({ amount: '7', competenceDate: '2026-08-03', paid: '0', unpaid: '7' }),
      ],
      from,
      to,
      today,
    );
    expect(points).toHaveLength(3);
    expect(points[0]?.amount.toString()).toBe('15');
    expect(points[0]?.received?.toString()).toBe('15');
    expect(points[0]?.outstanding?.toString()).toBe('0');
    expect(points[1]?.amount.toString()).toBe('0');
    expect(points[1]?.received?.toString()).toBe('0');
    expect(points[2]?.amount.toString()).toBe('7');
    expect(points[2]?.received?.toString()).toBe('0');
    expect(points[2]?.outstanding?.toString()).toBe('7');
  });

  it('multi-centro parcial → received/outstanding null em todos os dias', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-02T00:00:00.000Z');
    const points = buildDailyCompetenceAllocationTotals(
      [
        row({
          amount: '600',
          installmentTotal: '1000',
          paid: '500',
          unpaid: '500',
          competenceDate: '2026-08-01',
        }),
      ],
      from,
      to,
      today,
    );
    expect(points[0]?.amount.toString()).toBe('600');
    expect(points.every((point) => point.received === null && point.outstanding === null)).toBe(
      true,
    );
  });

  it('Σ received diário = KPI received quando tudo EXACT', () => {
    const from = new Date('2026-08-01T00:00:00.000Z');
    const to = new Date('2026-08-03T00:00:00.000Z');
    const sources = [
      row({ amount: '100', competenceDate: '2026-08-01', paid: '100', unpaid: '0' }),
      row({
        amount: '40',
        installmentTotal: '100',
        paid: '100',
        unpaid: '0',
        competenceDate: '2026-08-02',
      }),
      row({
        amount: '60',
        installmentTotal: '100',
        paid: '0',
        unpaid: '100',
        competenceDate: '2026-08-03',
      }),
    ];
    const monthly = calculateMonthlyCompetenceFromAllocations(
      sources,
      [],
      'REVENUE',
      undefined,
      today,
    );
    const points = buildDailyCompetenceAllocationTotals(sources, from, to, today);
    const sumReceived = points.reduce(
      (acc, point) => acc.plus(point.received ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    const sumOutstanding = points.reduce(
      (acc, point) => acc.plus(point.outstanding ?? new Prisma.Decimal(0)),
      new Prisma.Decimal(0),
    );
    expect(monthly.costCenterCashSplit).toBe(true);
    expect(sumReceived.toString()).toBe(monthly.received?.toString());
    expect(sumOutstanding.toString()).toBe(monthly.outstanding?.toString());
  });
});
