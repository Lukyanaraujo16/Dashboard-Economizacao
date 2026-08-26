import { describe, expect, it } from 'vitest';

import { toMonthlyCashFlowView } from '../src/components/dashboard/dashboard-monthly-cash-flow-view';
import type { DashboardMonthlyCashFlowResponse } from '../src/services/dashboard/monthly-cash-flow.types';
import { subtractDecimalStrings } from '../src/components/dashboard/v2/chart-math';

function money(value: string): string {
  return subtractDecimalStrings(value, '0');
}

function flow(
  overrides: Partial<DashboardMonthlyCashFlowResponse> & {
    readonly realized?: Partial<DashboardMonthlyCashFlowResponse['realized']>;
    readonly expected?: Partial<DashboardMonthlyCashFlowResponse['expected']>;
    readonly overdue?: Partial<DashboardMonthlyCashFlowResponse['overdue']> & {
      readonly ofMonth?: Partial<DashboardMonthlyCashFlowResponse['overdue']['ofMonth']>;
    };
    readonly daily?: Partial<DashboardMonthlyCashFlowResponse['daily']>;
  } = {},
): DashboardMonthlyCashFlowResponse {
  return {
    today: '2026-08-26',
    monthKey: '2026-08',
    from: '2026-08-01',
    to: '2026-08-31',
    costCenterCashSplit: overrides.costCenterCashSplit ?? true,
    billing: overrides.billing === undefined ? '100000' : overrides.billing,
    realized: {
      inflows: '80000',
      outflows: '40000',
      result: '40000',
      ...overrides.realized,
    },
    expected: {
      receivables: '20000',
      payables: '10000',
      result: '10000',
      ...overrides.expected,
    },
    overdue: {
      receivables: '0',
      payables: '0',
      ofMonth: {
        receivables: '0',
        payables: '0',
        ...overrides.overdue?.ofMonth,
      },
      ...overrides.overdue,
    },
    coverage: overrides.coverage === undefined ? '0.8' : overrides.coverage,
    daily: {
      realized:
        overrides.daily?.realized ?? [
          { date: '2026-08-05', inflows: '80000', outflows: '0', result: '80000' },
        ],
      expected:
        overrides.daily?.expected ?? [
          { date: '2026-08-31', receivables: '20000', payables: '10000', result: '10000' },
        ],
    },
  };
}

describe('toMonthlyCashFlowView', () => {
  it('A1 — billing vem do DTO (inflows + expected.receivables)', () => {
    const view = toMonthlyCashFlowView(flow());
    expect(view.billing).toBe('100000');
    expect(view.received).toBe('80000');
    expect(view.realizedInflows).toBe('80000');
    expect(view.receivable).toBe('20000');
    expect(view.expectedReceivables).toBe('20000');
  });

  it('A2 — monthlyExpenses = realized.outflows + expected.payables', () => {
    const view = toMonthlyCashFlowView(flow());
    expect(view.paid).toBe('40000');
    expect(view.realizedOutflows).toBe('40000');
    expect(view.payable).toBe('10000');
    expect(view.expectedPayables).toBe('10000');
    expect(view.monthlyExpenses).toBe(money('50000'));
  });

  it('A3 — managerialResult = billing − monthlyExpenses', () => {
    const view = toMonthlyCashFlowView(flow());
    expect(view.managerialResult).toBe(money('50000'));
    expect(view.realizedResult).toBe('40000');
  });

  it('A4 — overdue.receivables não entra no Faturamento', () => {
    const view = toMonthlyCashFlowView(
      flow({
        billing: '95000',
        realized: { inflows: '80000', outflows: '40000', result: '40000' },
        expected: { receivables: '15000', payables: '10000', result: '5000' },
        overdue: {
          receivables: '5000',
          payables: '0',
          ofMonth: { receivables: '5000', payables: '0' },
        },
      }),
    );
    expect(view.billing).toBe('95000');
    expect(view.overdueReceivables).toBe('5000');
    expect(view.billing).not.toBe(money('100000'));
  });

  it('A5 — overdue.payables não entra em monthlyExpenses', () => {
    const view = toMonthlyCashFlowView(
      flow({
        overdue: {
          receivables: '0',
          payables: '3000',
          ofMonth: { receivables: '0', payables: '3000' },
        },
      }),
    );
    expect(view.monthlyExpenses).toBe(money('50000'));
    expect(view.overduePayables).toBe('3000');
  });

  it('A6 — pagamento tardio já no DTO não duplica Faturamento', () => {
    const view = toMonthlyCashFlowView(
      flow({
        billing: '100000',
        realized: { inflows: '95000', outflows: '40000', result: '55000' },
        expected: { receivables: '5000', payables: '10000', result: '-5000' },
        overdue: {
          receivables: '0',
          payables: '0',
          ofMonth: { receivables: '0', payables: '0' },
        },
      }),
    );
    expect(view.billing).toBe('100000');
    expect(view.received).toBe('95000');
    expect(view.receivable).toBe('5000');
    expect(view.overdueReceivables).toBe('0');
  });

  it('A7 — despesa tardia já no DTO não duplica monthlyExpenses', () => {
    const view = toMonthlyCashFlowView(
      flow({
        realized: { inflows: '80000', outflows: '45000', result: '35000' },
        expected: { receivables: '20000', payables: '5000', result: '15000' },
      }),
    );
    expect(view.paid).toBe('45000');
    expect(view.payable).toBe('5000');
    expect(view.monthlyExpenses).toBe(money('50000'));
  });

  it('A8 — costCenterCashSplit=false + billing=null permanece unavailable', () => {
    const view = toMonthlyCashFlowView(
      flow({
        costCenterCashSplit: false,
        billing: null,
        realized: { inflows: null, outflows: null, result: null },
        expected: { receivables: null, payables: null, result: null },
        overdue: {
          receivables: null,
          payables: null,
          ofMonth: { receivables: null, payables: null },
        },
        coverage: null,
      }),
    );
    expect(view.costCenterCashSplit).toBe(false);
    expect(view.billing).toBeNull();
    expect(view.received).toBeNull();
    expect(view.monthlyExpenses).toBeNull();
    expect(view.managerialResult).toBeNull();
    expect(view.billing).not.toBe('0');
    expect(view.monthlyExpenses).not.toBe(money('0'));
  });

  it('A9 — realized.outflows=null zera disponibilidade de despesas e resultado', () => {
    const view = toMonthlyCashFlowView(
      flow({
        realized: { inflows: '80000', outflows: null, result: null },
      }),
    );
    expect(view.billing).toBe('100000');
    expect(view.paid).toBeNull();
    expect(view.monthlyExpenses).toBeNull();
    expect(view.managerialResult).toBeNull();
    expect(view.realizedResult).toBeNull();
  });

  it('A10 — adapter não usa grossAmount', () => {
    expect(toMonthlyCashFlowView.toString()).not.toMatch(/grossAmount/);
  });

  it('A11 — daily.realized e daily.expected permanecem séries distintas', () => {
    const realized = [{ date: '2026-08-05', inflows: '80000', outflows: '0', result: '80000' }];
    const expected = [
      { date: '2026-08-31', receivables: '20000', payables: '10000', result: '10000' },
    ];
    const view = toMonthlyCashFlowView(flow({ daily: { realized, expected } }));
    expect(view.dailyRealized).toBe(realized);
    expect(view.dailyExpected).toBe(expected);
    expect(view.dailyRealized).not.toBe(view.dailyExpected);
    expect(view.dailyRealized[0]).toMatchObject({ inflows: '80000' });
    expect(view.dailyExpected[0]).toMatchObject({ receivables: '20000' });
  });

  it('A12 — coverage não é confundido com billing', () => {
    const view = toMonthlyCashFlowView(flow({ billing: '100000', coverage: '0.8' }));
    expect(view.coverage).toBe('0.8');
    expect(view.billing).toBe('100000');
    expect(view.billing).not.toBe(view.coverage);
  });
});
