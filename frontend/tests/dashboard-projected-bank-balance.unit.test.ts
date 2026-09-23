import { describe, expect, it } from 'vitest';

import { signedBalancePlotRatio } from '../src/components/dashboard/v2/cash-monthly-grouped-bars';
import { isCashExpectedHorizon } from '../src/services/dashboard/cash-expected-horizon';

describe('signedBalancePlotRatio', () => {
  it('37 — escala assinada mantém negativo abaixo de zero e visível, sem clamp para zero', () => {
    const present = [110000, -20000, 5000];
    const negative = signedBalancePlotRatio(-20000, present);
    const zero = signedBalancePlotRatio(0, present);
    const positive = signedBalancePlotRatio(110000, present);
    expect(negative).toBeGreaterThan(0);
    expect(negative).toBeLessThan(zero);
    expect(zero).toBeGreaterThan(negative);
    expect(zero).toBeLessThan(positive);
    expect(positive).toBeLessThan(1);
    expect(negative).not.toBe(zero);
  });
});

describe('parser do horizon com projeção opcional', () => {
  const months = [
    { monthKey: '2026-09', expected: { receivables: '20', payables: '10', result: '10' } },
    { monthKey: '2026-10', expected: { receivables: '0', payables: '0', result: '0' } },
    { monthKey: '2026-11', expected: { receivables: '0', payables: '0', result: '0' } },
  ];

  it('aceita contrato legado sem projection e o bloco novo', () => {
    expect(
      isCashExpectedHorizon(
        {
          today: '2026-09-23',
          startMonth: '2026-09',
          endMonth: '2026-11',
          horizon: 3,
          costCenterCashSplit: true,
          totals: { receivables: '20', payables: '10', result: '10' },
          months,
        },
        3,
      ),
    ).toBe(true);

    expect(
      isCashExpectedHorizon(
        {
          today: '2026-09-23',
          startMonth: '2026-09',
          endMonth: '2026-11',
          horizon: 3,
          costCenterCashSplit: true,
          totals: { receivables: '20', payables: '10', result: '10' },
          months,
          projection: {
            available: true,
            unavailableReason: null,
            base: { date: '2026-09-23', balance: '100', coverage: 'partial' },
            months: [
              {
                monthKey: '2026-09',
                overdueAdjustment: '5',
                expectedReceivables: '20',
                expectedPayables: '10',
                projectedBalance: '115',
              },
            ],
          },
        },
        3,
      ),
    ).toBe(true);
  });
});
