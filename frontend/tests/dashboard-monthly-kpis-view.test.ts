import { describe, expect, it } from 'vitest';

import {
  monthlyDelinquencyRate,
  toMonthlyDelinquencyKpi,
  toMonthlyPayableKpi,
  toMonthlyReceivableKpi,
} from '../src/components/dashboard/dashboard-monthly-kpis-view';
import type { DashboardMonthlyExpenseResponse } from '../src/services/dashboard/monthly-expenses.types';
import type { DashboardMonthlyRevenueResponse } from '../src/services/dashboard/monthly-revenue.types';

function revenue(
  total: string,
  extras: Partial<DashboardMonthlyRevenueResponse['receivables']> = {},
): DashboardMonthlyRevenueResponse {
  return {
    today: '2026-08-20',
    monthKey: '2026-08',
    from: '2026-08-01',
    to: '2026-08-31',
    receivables: {
      total,
      received: extras.received ?? '0',
      outstanding: extras.outstanding ?? total,
      overdue: extras.overdue ?? '0',
      classified: extras.classified ?? total,
      uncategorized: extras.uncategorized ?? '0',
      imprecise: extras.imprecise ?? '0',
      coverageRate: extras.coverageRate ?? '100',
      items:
        extras.items ??
        (total === '0'
          ? []
          : [
              {
                kind: 'category',
                name: 'Serviços',
                amount: total,
                received: extras.received ?? '0',
                outstanding: extras.outstanding ?? total,
                percentage: '100',
              },
            ]),
      daily: extras.daily ?? [],
    },
  };
}

function expense(
  total: string,
  extras: Partial<DashboardMonthlyExpenseResponse['payables']> = {},
): DashboardMonthlyExpenseResponse {
  return {
    today: '2026-08-20',
    monthKey: '2026-08',
    from: '2026-08-01',
    to: '2026-08-31',
    payables: {
      total,
      paid: extras.paid ?? '0',
      outstanding: extras.outstanding ?? total,
      overdue: extras.overdue ?? '0',
      classified: extras.classified ?? total,
      uncategorized: extras.uncategorized ?? '0',
      imprecise: extras.imprecise ?? '0',
      coverageRate: extras.coverageRate ?? '100',
      items:
        extras.items ??
        (total === '0'
          ? []
          : [
              {
                kind: 'category',
                name: 'Profissional de Limpeza',
                amount: total,
                paid: extras.paid ?? '0',
                outstanding: extras.outstanding ?? total,
                percentage: '100',
              },
            ]),
      daily: extras.daily ?? [],
    },
  };
}

describe('monthly context KPIs', () => {
  it('A receber usa outstanding da competência, não o total', () => {
    const kpi = toMonthlyReceivableKpi(
      revenue('136856.54', { received: '136856.54', outstanding: '0' }),
      'current',
    );
    expect(kpi.title).toBe('A receber');
    expect(kpi.value).toBe('R$\u00a00,00');
    expect(kpi.meta).toMatch(/competência/i);
  });

  it('A pagar mensal isola a parcela do mês, não o estoque 24×600', () => {
    const kpi = toMonthlyPayableKpi(expense('600.00', { outstanding: '600.00' }), 'future');
    expect(kpi.value).toBe('R$\u00a0600,00');
    expect(kpi.value).not.toBe('R$\u00a014.400,00');
    expect(kpi.meta).toMatch(/lançado/i);
  });

  it('futuro sem dados não inventa zero', () => {
    expect(toMonthlyReceivableKpi(revenue('0'), 'future').state).toBe('empty');
    expect(toMonthlyPayableKpi(expense('0'), 'future').state).toBe('empty');
    expect(toMonthlyReceivableKpi(revenue('0'), 'future').value).toBeUndefined();
  });

  it('inadimplência da competência usa overdue/outstanding e não o estoque global', () => {
    expect(monthlyDelinquencyRate('3', '8')).toBe('37.5');
    const kpi = toMonthlyDelinquencyKpi(revenue('8', { outstanding: '8', overdue: '3' }));
    expect(kpi.value).toBe('37,5%');
    expect(kpi.meta).toMatch(/competência/);
  });

  it('outstanding zero vira empty honesto, não 0%', () => {
    const kpi = toMonthlyDelinquencyKpi(
      revenue('136856.54', { received: '136856.54', outstanding: '0', overdue: '0' }),
    );
    expect(kpi.state).toBe('empty');
    expect(kpi.value).toBeUndefined();
  });
});
