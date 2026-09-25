import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
  clampAdvisorDrilldownLimit,
  rankAdvisorCashRealizedBreakdown,
  serializeAdvisorCashRealizedBreakdown,
} from '../src/modules/advisor/index.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(overrides: Partial<MonthlyCashFlow> = {}): MonthlyCashFlow {
  return {
    tenantId: 'tenant-a',
    today: new Date('2026-09-24T00:00:00.000Z'),
    monthKey: '2026-08',
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    costCenterCashSplit: true,
    realized: { inflows: dec('224790.3'), outflows: dec('98941.52'), result: dec('125848.78') },
    realizedByCategory: {
      inflows: {
        total: dec('224790.3'),
        classified: dec('224790.3'),
        uncategorized: dec('0'),
        imprecise: dec('0'),
        coverageRate: dec('100'),
        items: [
          {
            kind: 'category',
            key: 'cat-convenio',
            name: 'Atendimentos Convênio',
            amount: dec('207185.5'),
            percentage: dec('92.17'),
          },
          {
            kind: 'category',
            key: 'cat-part',
            name: 'Atendimentos Particulares',
            amount: dec('17469.35'),
            percentage: dec('7.77'),
          },
          {
            kind: 'category',
            key: 'cat-rend',
            name: 'Rendimentos',
            amount: dec('135.45'),
            percentage: dec('0.06'),
          },
        ],
      },
      outflows: {
        total: dec('98941.52'),
        classified: dec('98941.52'),
        uncategorized: dec('0'),
        imprecise: dec('0'),
        coverageRate: dec('100'),
        items: [
          {
            kind: 'category',
            key: 'cat-folha',
            name: 'Folha',
            amount: dec('60000'),
            percentage: dec('60.64'),
          },
          {
            kind: 'category',
            key: 'cat-aluguel',
            name: 'Aluguel',
            amount: dec('38941.52'),
            percentage: dec('39.36'),
          },
        ],
      },
    },
    expected: { receivables: dec('0'), payables: dec('0'), result: dec('0') },
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
    ...overrides,
  };
}

describe('Ranking oficial cash_realized_breakdown (F13.8.1D2)', () => {
  it('ordena INFLOW por amount DESC com rank e sharePercent no backend', () => {
    const ranked = rankAdvisorCashRealizedBreakdown({
      flow: flow(),
      direction: 'INFLOW',
      requestedLimit: 10,
      effectiveLimit: 10,
    });
    expect(ranked.status).toBe('OK');
    expect(ranked.scope).toBe('PERIOD');
    expect(ranked.coverage).toBe('FULL_BILLING');
    expect(ranked.totalRealized?.toString()).toBe('224790.3');
    expect(ranked.categories.map((item) => item.label)).toEqual([
      'Atendimentos Convênio',
      'Atendimentos Particulares',
      'Rendimentos',
    ]);
    expect(ranked.categories[0]?.rank).toBe(1);
    expect(ranked.categories[0]?.sharePercent?.toDecimalPlaces(2).toString()).toBe('92.17');
    expect(ranked.categories[1]?.rank).toBe(2);
  });

  it('ordena OUTFLOW por amount DESC sem inventar despesa contábil', () => {
    const ranked = rankAdvisorCashRealizedBreakdown({
      flow: flow(),
      direction: 'OUTFLOW',
      requestedLimit: 5,
      effectiveLimit: 5,
    });
    expect(ranked.categories.map((item) => item.label)).toEqual(['Folha', 'Aluguel']);
    expect(ranked.categories[0]?.amount.toString()).toBe('60000');
    const serialized = serializeAdvisorCashRealizedBreakdown(ranked);
    expect(serialized.realizedMeaning).toBe('SAIDAS_REALIZADAS_DE_CAIXA');
    expect(serialized.notIndividualConvenioRanking).toBe(true);
  });

  it('desempate determinístico por label e depois key', () => {
    const ranked = rankAdvisorCashRealizedBreakdown({
      flow: flow({
        realizedByCategory: {
          inflows: {
            total: dec('20'),
            classified: dec('20'),
            uncategorized: dec('0'),
            imprecise: dec('0'),
            coverageRate: dec('100'),
            items: [
              { kind: 'category', key: 'b', name: 'Beta', amount: dec('10'), percentage: dec('50') },
              { kind: 'category', key: 'a', name: 'Alfa', amount: dec('10'), percentage: dec('50') },
            ],
          },
          outflows: null,
        },
      }),
      direction: 'INFLOW',
      requestedLimit: 5,
      effectiveLimit: 5,
    });
    expect(ranked.categories.map((item) => item.label)).toEqual(['Alfa', 'Beta']);
    expect(ranked.categories[0]?.rank).toBe(1);
    expect(ranked.categories[1]?.rank).toBe(2);
  });

  it('denominador zero vira NOT_APPLICABLE, não Infinity', () => {
    const ranked = rankAdvisorCashRealizedBreakdown({
      flow: flow({
        realizedByCategory: {
          inflows: {
            total: dec('0'),
            classified: dec('0'),
            uncategorized: dec('0'),
            imprecise: dec('0'),
            coverageRate: null,
            items: [
              { kind: 'category', key: 'z', name: 'Zero', amount: dec('0'), percentage: dec('0') },
            ],
          },
          outflows: null,
        },
      }),
      direction: 'INFLOW',
      requestedLimit: 5,
      effectiveLimit: 5,
    });
    expect(ranked.categories[0]?.sharePercent).toBeNull();
    expect(serializeAdvisorCashRealizedBreakdown(ranked).categories).toEqual([
      expect.objectContaining({ sharePercent: 'NOT_APPLICABLE' }),
    ]);
  });

  it('composição ausente é ABSENT e não zero', () => {
    const ranked = rankAdvisorCashRealizedBreakdown({
      flow: flow({
        realizedByCategory: { inflows: null, outflows: null },
      }),
      direction: 'INFLOW',
      requestedLimit: 5,
      effectiveLimit: 5,
    });
    expect(ranked.status).toBe('ABSENT');
    expect(ranked.totalRealized).toBeNull();
    expect(ranked.categories).toEqual([]);
    const serialized = serializeAdvisorCashRealizedBreakdown(ranked);
    expect(serialized.totalRealized).toBe('ABSENT');
    expect(serialized.status).toBe('ABSENT');
  });

  it('lista oficial vazia é EMPTY_RESULT', () => {
    const ranked = rankAdvisorCashRealizedBreakdown({
      flow: flow({
        realizedByCategory: {
          inflows: {
            total: dec('0'),
            classified: dec('0'),
            uncategorized: dec('0'),
            imprecise: dec('0'),
            coverageRate: null,
            items: [],
          },
          outflows: null,
        },
      }),
      direction: 'INFLOW',
      requestedLimit: 5,
      effectiveLimit: 5,
    });
    expect(ranked.status).toBe('EMPTY_RESULT');
    expect(ranked.totalRealized?.toString()).toBe('0');
  });

  it('aplica default 5, teto 20 e não inventa Outros', () => {
    expect(clampAdvisorDrilldownLimit(undefined)).toEqual({
      requestedLimit: null,
      effectiveLimit: ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
    });
    expect(clampAdvisorDrilldownLimit(5000).effectiveLimit).toBe(ADVISOR_DRILLDOWN_MAX_LIMIT);
    expect(clampAdvisorDrilldownLimit(3).effectiveLimit).toBe(3);
    const ranked = rankAdvisorCashRealizedBreakdown({
      flow: flow(),
      direction: 'INFLOW',
      requestedLimit: 1,
      effectiveLimit: 1,
    });
    expect(ranked.categories).toHaveLength(1);
    expect(ranked.hasMore).toBe(true);
    expect(ranked.categories.some((item) => item.label === 'Outros')).toBe(false);
  });
});
