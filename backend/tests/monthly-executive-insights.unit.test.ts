import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { buildMonthlyExecutiveInsights } from '../src/modules/analytics/domain/monthly-executive-insights.js';

const ZERO = new Prisma.Decimal(0);

function revenue(input: {
  readonly total: string;
  readonly classified?: string;
  readonly items?: readonly {
    readonly kind: 'category';
    readonly name: string;
    readonly amount: string;
  }[];
}) {
  const total = new Prisma.Decimal(input.total);
  const classified = new Prisma.Decimal(input.classified ?? input.total);
  return {
    tenantId: 't1',
    today: new Date('2026-08-19T00:00:00.000Z'),
    monthKey: '2026-08',
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    costCenterCashSplit: true,
    total,
    received: ZERO,
    outstanding: total,
    overdue: ZERO,
    classified,
    uncategorized: ZERO,
    imprecise: ZERO,
    coverageRate: classified.greaterThan(ZERO) ? new Prisma.Decimal(100) : null,
    items: (input.items ?? []).map((item) => ({
      kind: item.kind,
      key: item.name,
      name: item.name,
      amount: new Prisma.Decimal(item.amount),
      received: ZERO,
      outstanding: new Prisma.Decimal(item.amount),
      percentage: classified.greaterThan(ZERO)
        ? new Prisma.Decimal(item.amount).div(classified).times(100)
        : ZERO,
    })),
    daily: [],
  };
}

function expense(input: {
  readonly total: string;
  readonly classified?: string;
  readonly uncategorized?: string;
  readonly imprecise?: string;
  readonly items?: readonly {
    readonly kind: 'category' | 'uncategorized' | 'imprecise';
    readonly name: string;
    readonly amount: string;
  }[];
}) {
  const total = new Prisma.Decimal(input.total);
  const classified = new Prisma.Decimal(input.classified ?? input.total);
  const uncategorized = new Prisma.Decimal(input.uncategorized ?? '0');
  const imprecise = new Prisma.Decimal(input.imprecise ?? '0');
  return {
    tenantId: 't1',
    today: new Date('2026-08-19T00:00:00.000Z'),
    monthKey: '2026-08',
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    costCenterCashSplit: true,
    total,
    received: ZERO,
    outstanding: total,
    overdue: ZERO,
    classified,
    uncategorized,
    imprecise,
    coverageRate: classified.greaterThan(ZERO) ? new Prisma.Decimal(100) : null,
    items: (input.items ?? []).map((item) => ({
      kind: item.kind,
      key: item.name,
      name: item.name,
      amount: new Prisma.Decimal(item.amount),
      received: ZERO,
      outstanding: new Prisma.Decimal(item.amount),
      percentage: total.greaterThan(ZERO)
        ? new Prisma.Decimal(item.amount).div(total).times(100)
        : ZERO,
    })),
    daily: [],
  };
}

describe('buildMonthlyExecutiveInsights', () => {
  it('monta totais, balanço e top categorias com no máximo 4 insights', () => {
    const result = buildMonthlyExecutiveInsights({
      tenantId: 't1',
      today: new Date('2026-08-19T00:00:00.000Z'),
      monthKey: '2026-08',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      revenue: revenue({
        total: '100',
        items: [{ kind: 'category', name: 'Serviços', amount: '100' }],
      }),
      expense: expense({
        total: '150',
        items: [
          { kind: 'category', name: 'Salários', amount: '120' },
          { kind: 'uncategorized', name: 'Sem categoria', amount: '30' },
        ],
        uncategorized: '30',
      }),
    });

    expect(result.insights.length).toBeLessThanOrEqual(4);
    expect(result.insights.map((item) => item.id)).toEqual([
      'revenue-expense-total',
      'revenue-expense-balance',
      'top-revenue-category',
      'top-expense-category',
    ]);
    expect(result.insights[0]?.body).toContain('R$ 100,00');
    expect(result.insights[1]?.body).toContain('superam as receitas');
    expect(result.insights[2]?.body).toContain('Serviços');
    expect(result.insights[3]?.body).toContain('Salários');
  });

  it('omite insights quando o mês está vazio', () => {
    const result = buildMonthlyExecutiveInsights({
      tenantId: 't1',
      today: new Date('2026-08-19T00:00:00.000Z'),
      monthKey: '2026-08',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      revenue: revenue({ total: '0', classified: '0', items: [] }),
      expense: expense({ total: '0', classified: '0', items: [] }),
    });
    expect(result.insights).toEqual([]);
  });

  it('inclui gap de classificação quando houver dado real', () => {
    const result = buildMonthlyExecutiveInsights({
      tenantId: 't1',
      today: new Date('2026-08-19T00:00:00.000Z'),
      monthKey: '2026-08',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      revenue: revenue({ total: '0', classified: '0', items: [] }),
      expense: expense({
        total: '100',
        classified: '80',
        uncategorized: '20',
        items: [
          { kind: 'category', name: 'A', amount: '80' },
          { kind: 'uncategorized', name: 'Sem categoria', amount: '20' },
        ],
      }),
    });
    const gap = result.insights.find((item) => item.id === 'expense-classification-gap');
    expect(gap?.body).toContain('sem classificação precisa');
    expect(gap?.body).toContain('20,0%');
  });
});
