import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { toDashboardMonthlyExpenseResponse } from '../src/modules/dashboard/http/to-dashboard-monthly-expense-response.js';

describe('dashboard monthly expense serializer', () => {
  it('mapeia received analítico para paid no contrato HTTP', () => {
    const dto = toDashboardMonthlyExpenseResponse({
      tenantId: 'secret-tenant',
      today: new Date('2026-08-19T00:00:00.000Z'),
      monthKey: '2026-08',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      costCenterCashSplit: true,
      total: new Prisma.Decimal('600'),
      received: new Prisma.Decimal('600'),
      outstanding: new Prisma.Decimal('0'),
      overdue: new Prisma.Decimal('0'),
      classified: new Prisma.Decimal('600'),
      uncategorized: new Prisma.Decimal(0),
      imprecise: new Prisma.Decimal(0),
      coverageRate: new Prisma.Decimal('100'),
      items: [
        {
          kind: 'category',
          key: 'limp',
          name: 'Profissional de Limpeza',
          amount: new Prisma.Decimal('600'),
          received: new Prisma.Decimal('600'),
          outstanding: new Prisma.Decimal('0'),
          percentage: new Prisma.Decimal('100'),
        },
      ],
      daily: [
        {
          date: new Date('2026-08-10T00:00:00.000Z'),
          amount: new Prisma.Decimal('600'),
          received: new Prisma.Decimal('600'),
          outstanding: new Prisma.Decimal('0'),
        },
      ],
    });
    expect(dto.payables.total).toBe('600');
    expect(dto.payables.paid).toBe('600');
    expect(dto.payables.items[0]?.paid).toBe('600');
    expect(dto.payables.daily).toEqual([
      { date: '2026-08-10', amount: '600', received: '600', outstanding: '0' },
    ]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain('secret-tenant');
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('"key"');
  });
});
