import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import {
  ADVISOR_CASH_CATEGORY_TOP_N,
  compareAdvisorCashMonths,
  percentDelta,
  resolveAdvisorBillingCoverage,
  resolveAdvisorComparisonBillingCoverage,
} from '../src/modules/advisor/domain/compare-advisor-cash-months.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function composition(
  items: Array<{ key: string; name: string; amount: string; share?: string }>,
): NonNullable<MonthlyCashFlow['realizedByCategory']['inflows']> {
  const parsed = items.map((item) => ({
    kind: 'category' as const,
    key: item.key,
    name: item.name,
    amount: dec(item.amount),
    percentage: dec(item.share ?? '0'),
  }));
  const total = parsed.reduce((sum, item) => sum.plus(item.amount), dec('0'));
  return {
    total,
    classified: total,
    uncategorized: dec('0'),
    imprecise: dec('0'),
    coverageRate: dec('100'),
    items: parsed,
  };
}

function flow(input: {
  readonly tenantId?: string;
  readonly monthKey: string;
  readonly inflows: string | null;
  readonly outflows?: string | null;
  readonly result?: string | null;
  readonly expectedReceivables?: string | null;
  readonly expectedPayables?: string | null;
  readonly inflowItems?: Array<{ key: string; name: string; amount: string }>;
  readonly outflowItems?: Array<{ key: string; name: string; amount: string }>;
  readonly inflowCompositionAbsent?: boolean;
  readonly outflowCompositionAbsent?: boolean;
}): MonthlyCashFlow {
  const inflows = input.inflows === null ? null : dec(input.inflows);
  const outflows = input.outflows === undefined ? dec('0') : input.outflows === null ? null : dec(input.outflows);
  const expectedReceivables =
    input.expectedReceivables === undefined
      ? dec('0')
      : input.expectedReceivables === null
        ? null
        : dec(input.expectedReceivables);
  return {
    tenantId: input.tenantId ?? 'tenant-a',
    today: new Date('2026-09-24T00:00:00.000Z'),
    monthKey: input.monthKey,
    from: new Date(`${input.monthKey}-01T00:00:00.000Z`),
    to: new Date(`${input.monthKey}-28T00:00:00.000Z`),
    costCenterCashSplit: true,
    realized: {
      inflows,
      outflows,
      result:
        input.result === undefined
          ? inflows !== null && outflows !== null
            ? inflows.minus(outflows)
            : null
          : input.result === null
            ? null
            : dec(input.result),
    },
    realizedByCategory: {
      inflows: input.inflowCompositionAbsent
        ? null
        : input.inflowItems
          ? composition(input.inflowItems)
          : composition([]),
      outflows: input.outflowCompositionAbsent
        ? null
        : input.outflowItems
          ? composition(input.outflowItems)
          : composition([]),
    },
    expected: {
      receivables: expectedReceivables,
      payables:
        input.expectedPayables === undefined
          ? dec('0')
          : input.expectedPayables === null
            ? null
            : dec(input.expectedPayables),
      result: dec('0'),
    },
    overdue: {
      receivables: dec('0'),
      payables: dec('0'),
      ofMonth: { receivables: dec('0'), payables: dec('0') },
    },
    stock: {
      receivables: { open: null, overdue: null, dueToday: null, upcoming: null },
      payables: { open: null, overdue: null, dueToday: null, upcoming: null },
    },
    coverage: null,
    daily: { realized: [], expected: [] },
  };
}

describe('compareAdvisorCashMonths (F13.8.1D1)', () => {
  const jul = flow({
    monthKey: '2026-07',
    inflows: '136659.99',
    inflowItems: [
      { key: 'cat-convenio', name: 'Atendimentos Convênio', amount: '113984.49' },
      { key: 'cat-part', name: 'Particulares', amount: '22675.50' },
    ],
  });
  const ago = flow({
    monthKey: '2026-08',
    inflows: '224790.30',
    inflowItems: [
      { key: 'cat-convenio', name: 'Atendimentos Convênio', amount: '207185.50' },
      { key: 'cat-part', name: 'Particulares', amount: '17469.35' },
    ],
  });

  it('compara dois cash flows oficiais e calcula delta no backend', () => {
    const result = compareAdvisorCashMonths({
      tenantId: 'tenant-a',
      periodA: jul,
      periodB: ago,
    });
    expect(result.periodA.billing?.toString()).toBe('136659.99');
    expect(result.periodB.billing?.toString()).toBe('224790.3');
    expect(result.difference.billing?.toString()).toBe('88130.31');
    expect(result.difference.billingPercent?.toDecimalPlaces(2).toString()).toBe('64.49');
    expect(Number.isFinite(Number(result.difference.billingPercent))).toBe(true);
  });

  it('denominador zero não gera Infinity; ambos zero = 0; ausência ≠ zero', () => {
    expect(percentDelta(dec('10'), dec('0'))).toBeNull();
    expect(percentDelta(dec('0'), dec('0'))?.toString()).toBe('0');
    expect(percentDelta(dec('10'), null)).toBeNull();
    expect(percentDelta(null, dec('10'))).toBeNull();

    const absent = compareAdvisorCashMonths({
      tenantId: 'tenant-a',
      periodA: flow({ monthKey: '2026-07', inflows: null, expectedReceivables: null }),
      periodB: flow({ monthKey: '2026-08', inflows: '10', expectedReceivables: '0' }),
    });
    expect(absent.periodA.billing).toBeNull();
    expect(absent.difference.billing).toBeNull();
    expect(absent.difference.billingPercent).toBeNull();
    expect(absent.difference.billing?.toString()).not.toBe('0');
  });

  it('compara categorias por key estável, inclusive só em A, só em B, aumento, queda e unchanged', () => {
    const result = compareAdvisorCashMonths({
      tenantId: 'tenant-a',
      periodA: flow({
        monthKey: '2026-07',
        inflows: '100',
        inflowItems: [
          { key: 'cat-convenio', name: 'Atendimentos Convênio', amount: '60' },
          { key: 'cat-part', name: 'Particulares', amount: '30' },
          { key: 'cat-same', name: 'Estável', amount: '10' },
          { key: 'cat-only-a', name: 'Só A', amount: '8' },
        ],
      }),
      periodB: flow({
        monthKey: '2026-08',
        inflows: '140',
        inflowItems: [
          { key: 'cat-convenio', name: 'Atendimentos Convênio', amount: '100' },
          { key: 'cat-part', name: 'Particulares', amount: '10' },
          { key: 'cat-same', name: 'Estável', amount: '10' },
          { key: 'cat-only-b', name: 'Só B', amount: '20' },
        ],
      }),
    });

    const convenio = result.inflowCategories.items.find((item) => item.key === 'cat-convenio');
    const part = result.inflowCategories.items.find((item) => item.key === 'cat-part');
    const same = result.inflowCategories.items.find((item) => item.key === 'cat-same');
    const onlyA = result.inflowCategories.items.find((item) => item.key === 'cat-only-a');
    const onlyB = result.inflowCategories.items.find((item) => item.key === 'cat-only-b');

    expect(convenio?.name).toBe('Atendimentos Convênio');
    expect(convenio?.trend).toBe('INCREASE');
    expect(convenio?.delta?.toString()).toBe('40');
    expect(part?.trend).toBe('DECREASE');
    expect(part?.delta?.toString()).toBe('-20');
    expect(same?.trend).toBe('UNCHANGED');
    expect(onlyA?.amountA?.toString()).toBe('8');
    expect(onlyA?.amountB?.toString()).toBe('0');
    expect(onlyA?.trend).toBe('DECREASE');
    expect(onlyB?.amountA?.toString()).toBe('0');
    expect(onlyB?.amountB?.toString()).toBe('20');
    expect(onlyB?.trend).toBe('INCREASE');
    expect(result.inflowCategories.increases[0]?.key).toBe('cat-convenio');
    expect(result.inflowCategories.decreases[0]?.key).toBe('cat-part');
  });

  it('limita ranking de categorias e trata composição ausente como ABSENT, não zero', () => {
    const many = Array.from({ length: 15 }, (_, index) => ({
      key: `up-${index}`,
      name: `Alta ${index}`,
      amount: String(index + 1),
    }));
    const limited = compareAdvisorCashMonths({
      tenantId: 'tenant-a',
      periodA: flow({ monthKey: '2026-07', inflows: '0', inflowItems: [] }),
      periodB: flow({ monthKey: '2026-08', inflows: '120', inflowItems: many }),
    });
    expect(ADVISOR_CASH_CATEGORY_TOP_N).toBe(10);
    expect(limited.inflowCategories.increases).toHaveLength(10);
    expect(limited.inflowCategories.items.length).toBeGreaterThan(10);

    const absent = compareAdvisorCashMonths({
      tenantId: 'tenant-a',
      periodA: flow({ monthKey: '2026-07', inflows: '10', inflowCompositionAbsent: true }),
      periodB: flow({ monthKey: '2026-08', inflows: '20', inflowItems: [{ key: 'x', name: 'X', amount: '20' }] }),
    });
    expect(absent.inflowCategories.available).toBe(false);
    expect(absent.inflowCategories.items).toEqual([]);
  });

  it('FULL_BILLING só quando expected.receivables=0 nos dois períodos; senão REALIZED_ONLY', () => {
    expect(resolveAdvisorBillingCoverage(dec('0'))).toBe('FULL_BILLING');
    expect(resolveAdvisorBillingCoverage(dec('5'))).toBe('REALIZED_ONLY');
    expect(resolveAdvisorBillingCoverage(null)).toBe('REALIZED_ONLY');
    expect(resolveAdvisorComparisonBillingCoverage(dec('0'), dec('0'))).toBe('FULL_BILLING');
    expect(resolveAdvisorComparisonBillingCoverage(dec('0'), dec('12'))).toBe('REALIZED_ONLY');
    expect(resolveAdvisorComparisonBillingCoverage(null, dec('0'))).toBe('REALIZED_ONLY');

    const full = compareAdvisorCashMonths({ tenantId: 'tenant-a', periodA: jul, periodB: ago });
    expect(full.billingCoverage).toBe('FULL_BILLING');

    const realizedOnly = compareAdvisorCashMonths({
      tenantId: 'tenant-a',
      periodA: flow({ monthKey: '2026-07', inflows: '100', expectedReceivables: '0' }),
      periodB: flow({ monthKey: '2026-08', inflows: '100', expectedReceivables: '25' }),
    });
    expect(realizedOnly.billingCoverage).toBe('REALIZED_ONLY');
    expect(realizedOnly.periodB.billing?.toString()).toBe('125');
  });

  it('recusa fluxo de outro tenant e não mistura competência', () => {
    expect(() =>
      compareAdvisorCashMonths({
        tenantId: 'tenant-a',
        periodA: flow({ tenantId: 'tenant-b', monthKey: '2026-07', inflows: '1' }),
        periodB: ago,
      }),
    ).toThrow(/outro tenant/);
    expect(jul.daily.realized).toEqual([]);
  });
});
