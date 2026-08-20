import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { toDashboardExpenseCompositionResponse } from '../src/modules/dashboard/http/to-dashboard-expense-composition-response.js';

describe('dashboard E2 serializer', () => {
  it('serializa Decimal em string sem tenantId nem categoryId', () => {
    const dto = toDashboardExpenseCompositionResponse({
      tenantId: 'secret-tenant',
      today: new Date('2026-08-19T00:00:00.000Z'),
      total: new Prisma.Decimal('100'),
      classified: new Prisma.Decimal('80'),
      uncategorized: new Prisma.Decimal('20'),
      imprecise: new Prisma.Decimal(0),
      coverageRate: new Prisma.Decimal('80'),
      items: [
        {
          kind: 'category',
          name: 'Aluguel',
          amount: new Prisma.Decimal('80'),
          percentage: new Prisma.Decimal('80'),
        },
      ],
    });
    expect(dto.today).toBe('2026-08-19');
    expect(dto.payables.total).toBe('100');
    expect(typeof dto.payables.coverageRate).toBe('string');
    expect(dto.payables.items[0]).toEqual({
      kind: 'category',
      name: 'Aluguel',
      amount: '80',
      percentage: '80',
    });
    const json = JSON.stringify(dto);
    expect(json).not.toContain('secret-tenant');
    expect(json).not.toContain('tenantId');
    expect(json).not.toContain('categoryId');
  });
});
