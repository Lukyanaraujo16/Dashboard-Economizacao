import { describe, expect, it } from 'vitest';

import {
  emptyManagerialBillingKpi,
  toManagerialBillingKpi,
} from '../src/components/dashboard/dashboard-managerial-billing-view';
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
      received: extras.received ?? total,
      outstanding: extras.outstanding ?? '0',
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
                received: extras.received ?? total,
                outstanding: extras.outstanding ?? '0',
                percentage: '100',
              },
            ]),
      daily: extras.daily ?? [],
    },
  };
}

describe('toManagerialBillingKpi', () => {
  it('mês passado usa total e copy de competência gerada', () => {
    const kpi = toManagerialBillingKpi(revenue('136856.54'), 'past');
    expect(kpi.state).toBe('ready');
    expect(kpi.title).toBe('Faturamento');
    expect(kpi.value).toBe('R$\u00a0136.856,54');
    expect(kpi.meta).toBe('Gerado na competência');
    expect(kpi.meta.toLowerCase()).not.toContain('caixa');
    expect(kpi.meta.toLowerCase()).not.toContain('recebido no mês');
  });

  it('mês atual usa total com gerado até agora', () => {
    const kpi = toManagerialBillingKpi(revenue('136856.54'), 'current');
    expect(kpi.title).toBe('Faturamento');
    expect(kpi.value).toBe('R$\u00a0136.856,54');
    expect(kpi.meta).toBe('Gerado até agora');
  });

  it('mês futuro com dados vira previsto e não inventa caixa', () => {
    const kpi = toManagerialBillingKpi(revenue('5000.00'), 'future');
    expect(kpi.title).toBe('Faturamento previsto');
    expect(kpi.value).toBe('R$\u00a05.000,00');
    expect(kpi.meta).toMatch(/já lançadas/i);
  });

  it('mês futuro sem dados usa empty com travessão semântico e não zero', () => {
    const kpi = toManagerialBillingKpi(revenue('0'), 'future');
    expect(kpi.state).toBe('empty');
    expect(kpi.title).toBe('Faturamento previsto');
    expect(kpi.value).toBeUndefined();
    expect(kpi.emptyMessage).toBe('Sem receitas previstas');
  });

  it('mês atual/passado sem dados não inventa R$ 0,00', () => {
    expect(toManagerialBillingKpi(revenue('0'), 'current').state).toBe('empty');
    expect(toManagerialBillingKpi(revenue('0'), 'past').state).toBe('empty');
    expect(emptyManagerialBillingKpi('past').emptyMessage).toMatch(/sem receitas/i);
  });

  it('valor do card é o total gerencial, não outstanding isolado', () => {
    const kpi = toManagerialBillingKpi(
      revenue('1000.00', { received: '400.00', outstanding: '600.00' }),
      'current',
    );
    expect(kpi.value).toBe('R$\u00a01.000,00');
    expect(kpi.value).not.toBe('R$\u00a0600,00');
    expect(kpi.value).not.toBe('R$\u00a0400,00');
  });
});
