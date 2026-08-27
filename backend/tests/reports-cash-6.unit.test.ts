import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { aggregateCashRevenueReport } from '../src/modules/reports/domain/aggregate-cash-revenue-report.js';
import {
  aggregateCashExpensesReport,
  monthlyCashExpenses,
} from '../src/modules/reports/domain/aggregate-cash-expenses-report.js';
import { toRevenueReportResponse } from '../src/modules/reports/http/to-revenue-report-response.js';
import { toExpensesReportResponse } from '../src/modules/reports/http/to-expenses-report-response.js';
import { isRevenueReportEmpty } from '../src/modules/reports/exporters/revenue-export-presentation.js';
import { isExpensesReportEmpty } from '../src/modules/reports/exporters/expenses-export-presentation.js';

const ZERO = new Prisma.Decimal(0);

function lifeAugustFlow(): MonthlyCashFlow {
  const today = new Date(Date.UTC(2026, 7, 19));
  const from = new Date(Date.UTC(2026, 7, 1));
  const to = new Date(Date.UTC(2026, 7, 31));
  return {
    tenantId: 'tenant-life',
    today,
    monthKey: '2026-08',
    from,
    to,
    costCenterCashSplit: true,
    realized: {
      inflows: new Prisma.Decimal('224790.30'),
      outflows: new Prisma.Decimal('98941.52'),
      result: new Prisma.Decimal('125848.78'),
    },
    realizedByCategory: {
      inflows: {
        total: new Prisma.Decimal('224790.30'),
        classified: new Prisma.Decimal('224790.30'),
        uncategorized: ZERO,
        imprecise: ZERO,
        coverageRate: new Prisma.Decimal('100'),
        items: [
          {
            kind: 'category',
            key: 'consultas',
            name: 'Consultas',
            amount: new Prisma.Decimal('224790.30'),
            percentage: new Prisma.Decimal('100'),
          },
        ],
      },
      outflows: {
        total: new Prisma.Decimal('98941.52'),
        classified: new Prisma.Decimal('98941.52'),
        uncategorized: ZERO,
        imprecise: ZERO,
        coverageRate: new Prisma.Decimal('100'),
        items: [
          {
            kind: 'category',
            key: 'operacional',
            name: 'Operacional',
            amount: new Prisma.Decimal('98941.52'),
            percentage: new Prisma.Decimal('100'),
          },
        ],
      },
    },
    expected: {
      receivables: new Prisma.Decimal('10511.20'),
      payables: new Prisma.Decimal('28289.80'),
      result: new Prisma.Decimal('-17778.60'),
    },
    overdue: {
      receivables: ZERO,
      payables: ZERO,
      ofMonth: { receivables: ZERO, payables: ZERO },
    },
    coverage: new Prisma.Decimal('0.955447'),
    daily: { realized: [], expected: [] },
  };
}

describe('CASH-6 — aggregate cash reports (R22 Life agosto)', () => {
  it('entradas fecham com Home', () => {
    const aggregated = aggregateCashRevenueReport([lifeAugustFlow()]);
    expect(aggregated.received?.toFixed(2)).toBe('224790.30');
    expect(aggregated.outstanding?.toFixed(2)).toBe('10511.20');
    expect(aggregated.overdue?.toFixed(2)).toBe('0.00');
    expect(aggregated.total?.toFixed(2)).toBe('235301.50');
    expect(aggregated.items).toHaveLength(1);
    expect(aggregated.items[0]?.amount.toFixed(2)).toBe('224790.30');
  });

  it('saídas fecham com Home', () => {
    const flow = lifeAugustFlow();
    const aggregated = aggregateCashExpensesReport([flow]);
    expect(aggregated.received?.toFixed(2)).toBe('98941.52');
    expect(aggregated.outstanding?.toFixed(2)).toBe('28289.80');
    expect(aggregated.overdue?.toFixed(2)).toBe('0.00');
    expect(monthlyCashExpenses(flow)?.toFixed(2)).toBe('127231.32');
    expect(aggregated.total?.toFixed(2)).toBe('127231.32');
  });

  it('serializer HTTP preserva null e não inventa competência', () => {
    const revenue = toRevenueReportResponse('2026-08', '2026-08', [lifeAugustFlow()]);
    const expenses = toExpensesReportResponse('2026-08', '2026-08', [lifeAugustFlow()]);
    expect(revenue.receivables.received).toBe('224790.3');
    expect(revenue.receivables.total).toBe('235301.5');
    expect(expenses.payables.paid).toBe('98941.52');
    expect(expenses.payables.total).toBe('127231.32');
    expect(isRevenueReportEmpty(revenue)).toBe(false);
    expect(isExpensesReportEmpty(expenses)).toBe(false);
  });

  it('R25 — split unavailable não vira zero nos KPIs principais', () => {
    const flow: MonthlyCashFlow = {
      ...lifeAugustFlow(),
      costCenterCashSplit: false,
      realized: { inflows: null, outflows: null, result: null },
      expected: { receivables: null, payables: null, result: null },
      overdue: {
        receivables: null,
        payables: null,
        ofMonth: { receivables: null, payables: null },
      },
      realizedByCategory: { inflows: null, outflows: null },
      coverage: null,
    };
    const revenue = toRevenueReportResponse('2026-08', '2026-08', [flow]);
    expect(revenue.costCenterCashSplit).toBe(false);
    expect(revenue.receivables.total).toBeNull();
    expect(revenue.receivables.received).toBeNull();
    expect(revenue.receivables.outstanding).toBeNull();
  });
});
