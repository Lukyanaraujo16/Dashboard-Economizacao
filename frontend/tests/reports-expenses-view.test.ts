import { describe, expect, it } from 'vitest';

import {
  isExpensesReportEmpty,
  revenueReportPeriodLabel,
} from '../src/components/reports/reports-expenses-view';
import type { ReportsExpensesResponse } from '../src/services/reports/expenses.types';

const base: ReportsExpensesResponse = {
  today: '2026-08-19',
  from: '2026-01',
  to: '2026-02',
  payables: {
    total: '0',
    paid: '0',
    outstanding: '0',
    overdue: '0',
    classified: '0',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: null,
    items: [],
  },
  months: [],
};

describe('reports-expenses-view', () => {
  it('considera vazio quando o total é zero', () => {
    expect(isExpensesReportEmpty(base)).toBe(true);
    expect(
      isExpensesReportEmpty({
        ...base,
        payables: {
          ...base.payables,
          total: '10',
          items: [
            {
              kind: 'category',
              name: 'Aluguel',
              amount: '10',
              paid: '10',
              outstanding: '0',
              percentage: '100',
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('reusa o rótulo de período da receita', () => {
    expect(revenueReportPeriodLabel('2026-01', '2026-01')).toBe('jan/2026');
    expect(revenueReportPeriodLabel('2026-01', '2026-08')).toBe('jan/2026 — ago/2026');
  });
});
