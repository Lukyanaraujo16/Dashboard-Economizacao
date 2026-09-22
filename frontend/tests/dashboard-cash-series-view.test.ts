import { describe, expect, it } from 'vitest';

import {
  cashExpensesComposedSeries,
  cashManagerialResultComposedSeries,
  cashRealizedOutflowsAccumulated,
  cashRealizedOutflowsSeries,
} from '../src/components/dashboard/dashboard-cash-series-view';
import { toMonthlyCashFlowView } from '../src/components/dashboard/dashboard-monthly-cash-flow-view';
import type { DashboardMonthlyCashFlowResponse } from '../src/services/dashboard/monthly-cash-flow.types';

function lifeAugustWithDaily(): DashboardMonthlyCashFlowResponse {
  return {
    today: '2026-08-19',
    monthKey: '2026-08',
    from: '2026-08-01',
    to: '2026-08-31',
    costCenterCashSplit: true,
    billing: '235301.50',
    realized: { inflows: '224790.30', outflows: '98941.52', result: '125848.78' },
    expected: { receivables: '10511.20', payables: '28289.80', result: '-17778.60' },
    overdue: {
      receivables: '4200.00',
      payables: '100.00',
      ofMonth: { receivables: '0', payables: '0' },
    },
    coverage: '0.95',
    realizedByCategory: {
      inflows: {
        total: '224790.30',
        classified: '224790.30',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: '100',
        items: [{ kind: 'category', key: 'cat-fixture', name: 'Consultas', amount: '224790.30', percentage: '100' }],
      },
      outflows: {
        total: '98941.52',
        classified: '98941.52',
        uncategorized: '0',
        imprecise: '0',
        coverageRate: '100',
        items: [{ kind: 'category', key: 'cat-fixture', name: 'Operacional', amount: '98941.52', percentage: '100' }],
      },
    },
    daily: {
      realized: [
        { date: '2026-08-05', inflows: '100000.00', outflows: '40000.00', result: '60000.00' },
        { date: '2026-08-12', inflows: '124790.30', outflows: '58941.52', result: '65848.78' },
      ],
      expected: [
        { date: '2026-08-31', receivables: '10511.20', payables: '28289.80', result: '-17778.60' },
      ],
    },
  };
}

describe('CASH-4C — séries compostas de caixa', () => {
  it('último ponto de despesas compõe monthlyExpenses (Life)', () => {
    const view = toMonthlyCashFlowView(lifeAugustWithDaily());
    const series = cashExpensesComposedSeries(view);
    expect(series).toBeTruthy();
    expect(view.monthlyExpenses).toBe('127231.32');
    const last = series!.at(-1)!;
    expect(last.amount).toBe(view.monthlyExpenses);
  });

  it('último ponto de resultado compõe managerialResult (Life)', () => {
    const view = toMonthlyCashFlowView(lifeAugustWithDaily());
    const series = cashManagerialResultComposedSeries(view);
    expect(series).toBeTruthy();
    expect(view.managerialResult).toBe('108070.18');
    const last = series!.at(-1)!;
    expect(last.amount).toBe(view.managerialResult);
  });

  it('saídas acumuladas terminam no total PAGO e espelham a diária', () => {
    const view = toMonthlyCashFlowView(lifeAugustWithDaily());
    const daily = cashRealizedOutflowsSeries(view);
    const cumulative = cashRealizedOutflowsAccumulated(view);
    expect(daily).toEqual([
      { date: '2026-08-05', amount: '40000.00' },
      { date: '2026-08-12', amount: '58941.52' },
    ]);
    expect(cumulative).toEqual([
      { date: '2026-08-05', amount: '40000.00' },
      { date: '2026-08-12', amount: '98941.52' },
    ]);
    expect(cumulative!.at(-1)!.amount).toBe(view.paid);
  });

  it('séries indefinidas quando split de caixa está desligado', () => {
    const view = toMonthlyCashFlowView({
      ...lifeAugustWithDaily(),
      costCenterCashSplit: false,
      billing: null,
      realized: { inflows: null, outflows: null, result: null },
      expected: { receivables: null, payables: null, result: null },
      overdue: {
        receivables: null,
        payables: null,
        ofMonth: { receivables: null, payables: null },
      },
      daily: { realized: [], expected: [] },
    });
    expect(cashExpensesComposedSeries(view)).toBeUndefined();
    expect(cashManagerialResultComposedSeries(view)).toBeUndefined();
    expect(cashRealizedOutflowsAccumulated(view)).toBeUndefined();
  });
});
