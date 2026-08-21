import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { toDashboardMonthlyRevenueResponse } from '../src/modules/dashboard/http/to-dashboard-monthly-revenue-response.js';

describe('dashboard monthly revenue serializer', () => {
  it('serializa Decimal em string sem tenantId', () => {
    const dto = toDashboardMonthlyRevenueResponse({
      tenantId: 'secret-tenant',
      today: new Date('2026-08-19T00:00:00.000Z'),
      monthKey: '2026-08',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      costCenterCashSplit: true,
      total: new Prisma.Decimal('10000'),
      received: new Prisma.Decimal('4000'),
      outstanding: new Prisma.Decimal('6000'),
      overdue: new Prisma.Decimal('0'),
      classified: new Prisma.Decimal('10000'),
      uncategorized: new Prisma.Decimal(0),
      imprecise: new Prisma.Decimal(0),
      coverageRate: new Prisma.Decimal('100'),
      items: [
        {
          kind: 'category',
          name: 'Serviços',
          amount: new Prisma.Decimal('10000'),
          received: new Prisma.Decimal('4000'),
          outstanding: new Prisma.Decimal('6000'),
          percentage: new Prisma.Decimal('100'),
        },
      ],
      daily: [
        {
          date: new Date('2026-08-01T00:00:00.000Z'),
          amount: new Prisma.Decimal('4000'),
          received: new Prisma.Decimal('4000'),
          outstanding: new Prisma.Decimal('0'),
        },
        {
          date: new Date('2026-08-15T00:00:00.000Z'),
          amount: new Prisma.Decimal('6000'),
          received: new Prisma.Decimal('0'),
          outstanding: new Prisma.Decimal('6000'),
        },
      ],
    });
    expect(dto.monthKey).toBe('2026-08');
    expect(dto.costCenterCashSplit).toBeUndefined();
    expect(dto.receivables.total).toBe('10000');
    expect(typeof dto.receivables.received).toBe('string');
    expect(dto.receivables.items[0]?.received).toBe('4000');
    expect(dto.receivables.daily).toEqual([
      { date: '2026-08-01', amount: '4000', received: '4000', outstanding: '0' },
      { date: '2026-08-15', amount: '6000', received: '0', outstanding: '6000' },
    ]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain('secret-tenant');
    expect(json).not.toContain('tenantId');
    expect(json).not.toMatch(/faturamento/i);
  });
});
