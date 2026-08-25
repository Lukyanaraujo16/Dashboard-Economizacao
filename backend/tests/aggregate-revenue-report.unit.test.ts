import { Prisma } from '../src/generated/prisma/client.js';
import { describe, expect, it } from 'vitest';

import type { MonthlyCompetenceRevenueResult } from '../src/modules/analytics/domain/types.js';
import { aggregateRevenueReport } from '../src/modules/reports/domain/aggregate-revenue-report.js';

const ZERO = new Prisma.Decimal(0);

function month(
  monthKey: string,
  overrides: Partial<MonthlyCompetenceRevenueResult> = {},
): MonthlyCompetenceRevenueResult {
  const [year, monthPart] = monthKey.split('-');
  const monthIndex = Number(monthPart) - 1;
  return {
    tenantId: 'tenant-a',
    today: new Date('2026-08-19T00:00:00.000Z'),
    monthKey,
    from: new Date(Date.UTC(Number(year), monthIndex, 1)),
    to: new Date(Date.UTC(Number(year), monthIndex + 1, 0)),
    costCenterCashSplit: true,
    total: new Prisma.Decimal('100'),
    received: new Prisma.Decimal('40'),
    outstanding: new Prisma.Decimal('60'),
    overdue: new Prisma.Decimal('10'),
    classified: new Prisma.Decimal('100'),
    uncategorized: ZERO,
    imprecise: ZERO,
    coverageRate: new Prisma.Decimal('100'),
    items: [
      {
        kind: 'category',
        key: 'serv',
        name: 'Serviços',
        amount: new Prisma.Decimal('100'),
        received: new Prisma.Decimal('40'),
        outstanding: new Prisma.Decimal('60'),
        percentage: new Prisma.Decimal('100'),
      },
    ],
    daily: [],
    ...overrides,
  };
}

describe('aggregateRevenueReport', () => {
  it('soma totais mensais e recalcula cobertura D9 no intervalo', () => {
    const result = aggregateRevenueReport([
      month('2026-01'),
      month('2026-02', {
        total: new Prisma.Decimal('50'),
        received: new Prisma.Decimal('50'),
        outstanding: ZERO,
        overdue: ZERO,
        classified: new Prisma.Decimal('50'),
        items: [
          {
            kind: 'category',
            key: 'serv',
            name: 'Serviços',
            amount: new Prisma.Decimal('50'),
            received: new Prisma.Decimal('50'),
            outstanding: ZERO,
            percentage: new Prisma.Decimal('100'),
          },
        ],
      }),
    ]);
    expect(result.total.toString()).toBe('150');
    expect(result.received?.toString()).toBe('90');
    expect(result.outstanding?.toString()).toBe('60');
    expect(result.overdue?.toString()).toBe('10');
    expect(result.classified.toString()).toBe('150');
    expect(result.coverageRate?.toString()).toBe('100');
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.amount.toString()).toBe('150');
    expect(result.items[0]?.percentage.toString()).toBe('100');
  });

  it('retorna coverageRate null quando o total do intervalo é zero (D9)', () => {
    const empty = month('2026-01', {
      total: ZERO,
      received: ZERO,
      outstanding: ZERO,
      overdue: ZERO,
      classified: ZERO,
      coverageRate: null,
      items: [],
    });
    expect(aggregateRevenueReport([empty]).coverageRate).toBeNull();
  });

  it('propaga cash split indisponível (CC1) para o intervalo', () => {
    const result = aggregateRevenueReport([
      month('2026-01'),
      month('2026-02', {
        costCenterCashSplit: false,
        received: null,
        outstanding: null,
        overdue: null,
        items: [
          {
            kind: 'category',
            key: 'serv',
            name: 'Serviços',
            amount: new Prisma.Decimal('100'),
            received: null,
            outstanding: null,
            percentage: new Prisma.Decimal('100'),
          },
        ],
      }),
    ]);
    expect(result.costCenterCashSplit).toBe(false);
    expect(result.received).toBeNull();
    expect(result.outstanding).toBeNull();
    expect(result.overdue).toBeNull();
  });

  it('mescla pelo id de categoria, não pelo nome de exibição', () => {
    const result = aggregateRevenueReport([
      month('2026-01', {
        items: [
          {
            kind: 'category',
            key: 'cat-a',
            name: 'Serviços',
            amount: new Prisma.Decimal('80'),
            received: new Prisma.Decimal('80'),
            outstanding: ZERO,
            percentage: new Prisma.Decimal('80'),
          },
          {
            kind: 'category',
            key: 'cat-b',
            name: 'Serviços',
            amount: new Prisma.Decimal('20'),
            received: new Prisma.Decimal('20'),
            outstanding: ZERO,
            percentage: new Prisma.Decimal('20'),
          },
        ],
      }),
      month('2026-02', {
        total: new Prisma.Decimal('30'),
        received: new Prisma.Decimal('30'),
        outstanding: ZERO,
        overdue: ZERO,
        classified: new Prisma.Decimal('30'),
        items: [
          {
            kind: 'category',
            key: 'cat-a',
            name: 'Serviços (renomeada)',
            amount: new Prisma.Decimal('30'),
            received: new Prisma.Decimal('30'),
            outstanding: ZERO,
            percentage: new Prisma.Decimal('100'),
          },
        ],
      }),
    ]);
    expect(result.items).toHaveLength(2);
    const catA = result.items.find((item) => item.key === 'cat-a');
    const catB = result.items.find((item) => item.key === 'cat-b');
    expect(catA?.amount.toString()).toBe('110');
    expect(catB?.amount.toString()).toBe('20');
    expect(catA?.name).toBe('Serviços');
    expect(result.items.every((item) => item.kind === 'category')).toBe(true);
  });
});
