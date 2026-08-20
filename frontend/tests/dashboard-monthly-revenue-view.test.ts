import { describe, expect, it } from 'vitest';

import {
  isMonthlyRevenueEmpty,
  monthlyRevenueSectionSubtitle,
  monthlyRevenueSectionTitle,
} from '../src/components/dashboard/dashboard-monthly-revenue-view';

describe('dashboard-monthly-revenue-view', () => {
  it('título sem repetir o mês — o seletor já é o contexto', () => {
    expect(monthlyRevenueSectionTitle()).toBe('Receitas por categoria');
  });

  it('subtítulo distingue passado, atual e futuro sem chamar de caixa', () => {
    expect(monthlyRevenueSectionSubtitle()).toMatch(/competência/i);
    expect(monthlyRevenueSectionSubtitle().toLowerCase()).not.toContain('caixa realizado');
  });

  it('empty quando total zero', () => {
    expect(
      isMonthlyRevenueEmpty({
        today: '2026-08-19',
        monthKey: '2026-08',
        from: '2026-08-01',
        to: '2026-08-31',
        receivables: {
          total: '0',
          received: '0',
          outstanding: '0',
          overdue: '0',
          classified: '0',
          uncategorized: '0',
          imprecise: '0',
          coverageRate: null,
          items: [],
          daily: [],
        },
      }),
    ).toBe(true);
  });
});
