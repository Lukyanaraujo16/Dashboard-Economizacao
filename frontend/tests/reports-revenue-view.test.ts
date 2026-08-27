import { describe, expect, it } from 'vitest';

import {
  isRevenueReportEmpty,
  revenueReportPeriodLabel,
} from '../src/components/reports/reports-revenue-view';
import type { ReportsRevenueResponse } from '../src/services/reports/revenue.types';

const base: ReportsRevenueResponse = {
  today: '2026-08-19',
  from: '2026-01',
  to: '2026-02',
  receivables: {
    total: null,
    received: null,
    outstanding: null,
    overdue: '0',
    classified: '0',
    uncategorized: '0',
    imprecise: '0',
    coverageRate: null,
    items: [],
  },
  months: [],
};

describe('reports-revenue-view', () => {
  it('considera vazio sem movimento em received/outstanding e sem itens', () => {
    expect(isRevenueReportEmpty(base)).toBe(true);
    expect(
      isRevenueReportEmpty({
        ...base,
        receivables: {
          ...base.receivables,
          total: '0',
          received: '0',
          outstanding: '0',
        },
      }),
    ).toBe(true);
    expect(
      isRevenueReportEmpty({
        ...base,
        receivables: {
          ...base.receivables,
          total: null,
          received: '10',
          outstanding: null,
          items: [
            {
              kind: 'category',
              name: 'Serviços',
              amount: '10',
              received: '10',
              outstanding: '0',
              percentage: '100',
            },
          ],
        },
      }),
    ).toBe(false);
    expect(
      isRevenueReportEmpty({
        ...base,
        receivables: {
          ...base.receivables,
          total: null,
          received: null,
          outstanding: null,
          items: [
            {
              kind: 'category',
              name: 'Serviços',
              amount: '10',
              received: '10',
              outstanding: '0',
              percentage: '100',
            },
          ],
        },
      }),
    ).toBe(false);
  });

  it('formata o período sem UUID', () => {
    expect(revenueReportPeriodLabel('2026-01', '2026-01')).toBe('jan/2026');
    expect(revenueReportPeriodLabel('2026-01', '2026-08')).toBe('jan/2026 — ago/2026');
  });
});
