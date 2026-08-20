import { describe, expect, it } from 'vitest';

import { toDashboardExecutiveInsightsResponse } from '../src/modules/dashboard/http/to-dashboard-executive-insights-response.js';

describe('dashboard executive-insights serializer', () => {
  it('serializa insights mensais sem tenantId nem PII', () => {
    const dto = toDashboardExecutiveInsightsResponse({
      tenantId: 'secret-tenant',
      today: new Date('2026-08-19T00:00:00.000Z'),
      monthKey: '2026-08',
      from: new Date('2026-08-01T00:00:00.000Z'),
      to: new Date('2026-08-31T00:00:00.000Z'),
      insights: [
        {
          id: 'revenue-expense-total',
          body: 'Agosto de 2026 gerou R$ 100,00 em receitas de competência e R$ 150,00 em despesas de competência.',
        },
        {
          id: 'revenue-expense-balance',
          body: 'As despesas da competência superam as receitas em R$ 50,00.',
        },
      ],
    });
    expect(dto.today).toBe('2026-08-19');
    expect(dto.monthKey).toBe('2026-08');
    expect(dto.insights).toHaveLength(2);
    expect(dto.insights[0]?.id).toBe('revenue-expense-total');
    const json = JSON.stringify(dto);
    expect(json).not.toContain('secret-tenant');
    expect(json).not.toContain('tenantId');
  });
});
