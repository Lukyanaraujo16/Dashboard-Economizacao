import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { toDashboardMonthlyCashFlowResponse } from '../src/modules/dashboard/http/to-dashboard-monthly-cash-flow-response.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(overrides: Partial<MonthlyCashFlow> = {}): MonthlyCashFlow {
  return {
    tenantId: 'secret-tenant',
    today: new Date('2026-08-26T00:00:00.000Z'),
    monthKey: '2026-08',
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    costCenterCashSplit: true,
    realized: { inflows: dec('80000'), outflows: dec('0'), result: dec('80000') },
    expected: { receivables: dec('20000'), payables: dec('0'), result: dec('20000') },
    overdue: {
      receivables: dec('0'),
      payables: dec('0'),
      ofMonth: { receivables: dec('0'), payables: dec('0') },
    },
    coverage: dec('0.8'),
    realizedByCategory: {
      inflows: {
        total: dec('80000'),
        classified: dec('80000'),
        uncategorized: dec('0'),
        imprecise: dec('0'),
        coverageRate: dec('100'),
        items: [
          {
            kind: 'category',
            key: 'cat-rev',
            key: 'cat-rev',
            name: 'Serviços',
            amount: dec('80000'),
            percentage: dec('100'),
          },
        ],
      },
      outflows: {
        total: dec('0'),
        classified: dec('0'),
        uncategorized: dec('0'),
        imprecise: dec('0'),
        coverageRate: null,
        items: [],
      },
    },
    daily: {
      realized: [
        {
          date: new Date('2026-08-05T00:00:00.000Z'),
          inflows: dec('80000'),
          outflows: dec('0'),
          result: dec('80000'),
        },
      ],
      expected: [
        {
          date: new Date('2026-08-31T00:00:00.000Z'),
          receivables: dec('20000'),
          payables: dec('0'),
          result: dec('20000'),
        },
      ],
    },
    ...overrides,
  };
}

describe('dashboard monthly cash flow serializer', () => {
  it('A — billing = 80000 + 20000; Decimal em string; sem tenantId', () => {
    const dto = toDashboardMonthlyCashFlowResponse(flow());
    expect(dto.billing).toBe('100000');
    expect(typeof dto.realized.inflows).toBe('string');
    expect(dto.realized.inflows).toBe('80000');
    expect(dto.expected.receivables).toBe('20000');
    expect(dto.overdue.receivables).toBe('0');
    expect(dto.costCenterCashSplit).toBe(true);
    expect(dto.realizedByCategory.inflows?.items[0]).toEqual({
      kind: 'category',
      key: 'cat-rev',
      name: 'Serviços',
      amount: '80000',
      percentage: '100',
    });
    expect(dto.daily.realized).toEqual([
      { date: '2026-08-05', inflows: '80000', outflows: '0', result: '80000' },
    ]);
    expect(dto.daily.expected).toEqual([
      { date: '2026-08-31', receivables: '20000', payables: '0', result: '20000' },
    ]);
    const json = JSON.stringify(dto);
    expect(json).not.toContain('secret-tenant');
    expect(json).not.toContain('tenantId');
  });

  it('B — vencido 5000 não entra no billing (95000)', () => {
    const dto = toDashboardMonthlyCashFlowResponse(
      flow({
        expected: { receivables: dec('15000'), payables: dec('0'), result: dec('15000') },
        overdue: {
          receivables: dec('5000'),
          payables: dec('0'),
          ofMonth: { receivables: dec('5000'), payables: dec('0') },
        },
      }),
    );
    expect(dto.billing).toBe('95000');
    expect(dto.overdue.receivables).toBe('5000');
  });

  it('C — expected 0 + overdue 20000 → billing = realizado', () => {
    const dto = toDashboardMonthlyCashFlowResponse(
      flow({
        expected: { receivables: dec('0'), payables: dec('0'), result: dec('0') },
        overdue: {
          receivables: dec('20000'),
          payables: dec('0'),
          ofMonth: { receivables: dec('20000'), payables: dec('0') },
        },
      }),
    );
    expect(dto.billing).toBe('80000');
  });

  it('não transforma null de CC unavailable em zero no billing', () => {
    const dto = toDashboardMonthlyCashFlowResponse(
      flow({
        costCenterCashSplit: false,
        realized: { inflows: null, outflows: null, result: null },
        expected: { receivables: dec('20'), payables: dec('0'), result: dec('20') },
        overdue: {
          receivables: dec('0'),
          payables: dec('0'),
          ofMonth: { receivables: dec('0'), payables: dec('0') },
        },
        coverage: null,
        realizedByCategory: { inflows: null, outflows: null },
        daily: {
          realized: [
            {
              date: new Date('2026-08-05T00:00:00.000Z'),
              inflows: null,
              outflows: null,
              result: null,
            },
          ],
          expected: [
            {
              date: new Date('2026-08-31T00:00:00.000Z'),
              receivables: null,
              payables: null,
              result: null,
            },
          ],
        },
      }),
    );
    expect(dto.costCenterCashSplit).toBe(false);
    expect(dto.realized.inflows).toBeNull();
    expect(dto.billing).toBeNull();
    expect(dto.daily.realized[0]?.inflows).toBeNull();
  });
});
