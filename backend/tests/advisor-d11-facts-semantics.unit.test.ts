import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialStockSnapshot, MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import {
  ADVISOR_CASH_OUTFLOW_MEANING,
  ADVISOR_CASH_RESULT_MEANING,
  ADVISOR_PLATFORM_INSTRUCTIONS,
  AI_EMOJI_PREFERENCE_INSTRUCTIONS,
  buildAnalyticalFactsContent,
  buildFinancialFactsContent,
  compareAdvisorCashMonths,
  formatAdvisorCivilDate,
  resolveAdvisorConversationalPeriod,
  serializeAdvisorCashMonthComparison,
} from '../src/modules/advisor/index.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(overrides: Partial<MonthlyCashFlow> = {}): MonthlyCashFlow {
  return {
    tenantId: 'tenant-a',
    today: new Date('2026-09-24T00:00:00.000Z'),
    monthKey: '2026-07',
    from: new Date('2026-07-01T00:00:00.000Z'),
    to: new Date('2026-07-31T00:00:00.000Z'),
    costCenterCashSplit: true,
    realized: { inflows: dec('136659.99'), outflows: dec('135897.54'), result: dec('762.45') },
    realizedByCategory: {
      inflows: {
        total: dec('136659.99'),
        classified: dec('136659.99'),
        uncategorized: dec('0'),
        imprecise: dec('0'),
        coverageRate: dec('100'),
        items: [
          {
            kind: 'category',
            key: 'cat-convenio',
            name: 'Atendimentos Convênio',
            amount: dec('113984.49'),
            percentage: dec('83.4'),
          },
        ],
      },
      outflows: null,
    },
    expected: { receivables: dec('0'), payables: dec('0'), result: dec('0') },
    overdue: {
      receivables: dec('10511.20'),
      payables: dec('1'),
      ofMonth: { receivables: dec('200'), payables: dec('0') },
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

function snapshot(): FinancialStockSnapshot {
  return {
    tenantId: 'tenant-a',
    today: new Date('2026-09-24T00:00:00.000Z'),
    receivables: { open: dec('20'), overdue: dec('10511.20'), upcoming: dec('17') },
    payables: { open: dec('8'), overdue: dec('0'), upcoming: dec('8') },
    receivableDelinquency: {
      overdueUnpaid: dec('10511.20'),
      openUnpaid: dec('20'),
      rate: dec('15'),
    },
  };
}

function periodSection(facts: string): string {
  const current = facts.indexOf('scope: CURRENT_SNAPSHOT');
  return current >= 0 ? facts.slice(0, current) : facts;
}

function snapshotSection(facts: string): string {
  const current = facts.indexOf('scope: CURRENT_SNAPSHOT');
  return current >= 0 ? facts.slice(current) : '';
}

describe('F13.8.1D1.1 coerência temporal e semântica', () => {
  it('separa PERIOD e CURRENT_SNAPSHOT com asOf do snapshot.today', () => {
    const facts = buildFinancialFactsContent({
      monthKey: '2026-07',
      flow: flow(),
      snapshot: snapshot(),
    });
    expect(formatAdvisorCivilDate(snapshot().today)).toBe('2026-09-24');
    expect(facts).toContain('scope: PERIOD');
    expect(facts).toContain('scope: CURRENT_SNAPSHOT');
    expect(facts).toContain('asOf: 2026-09-24');
    expect(facts).toContain('asOfTimeZone: America/Sao_Paulo');
    expect(facts.indexOf('scope: PERIOD')).toBeLessThan(facts.indexOf('scope: CURRENT_SNAPSHOT'));

    const period = periodSection(facts);
    const current = snapshotSection(facts);
    expect(period).toContain('monthKey: 2026-07');
    expect(period).toContain('billing: 136659.99');
    expect(period).toContain('cash.realized.result: 762.45');
    expect(period).toContain(`cash.realized.result.meaning: ${ADVISOR_CASH_RESULT_MEANING}`);
    expect(period).toContain('realizedByCategory.inflows.1.name: Atendimentos Convênio');
    expect(period).toContain('cash.overdue.ofMonth.receivables: 200');
    expect(period).not.toContain('stock.receivables.overdue');
    expect(period).not.toContain('receivableDelinquency.overdueUnpaid');
    expect(current).toContain('stock.receivables.overdue: 10511.2');
    expect(current).toContain('cash.overdue.receivables: 10511.2');
    expect(current).toContain('NÃO pertence ao monthKey PERIOD');
    expect(current).not.toContain('monthKey: 2026-07');
  });

  it('pergunta histórica de julho/agosto não transforma snapshot atual no período', () => {
    const july = resolveAdvisorConversationalPeriod({
      content: 'E em julho?',
      referenceMonthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
      priorUserContents: ['Como está meu faturamento em agosto de 2026?'],
    });
    expect(july).toEqual({ monthKey: '2026-07', source: 'EXPLICIT', comparison: false });

    const factsJuly = buildFinancialFactsContent({
      monthKey: july.monthKey,
      flow: flow({ monthKey: '2026-07' }),
      snapshot: snapshot(),
    });
    const factsAugust = buildFinancialFactsContent({
      monthKey: '2026-08',
      flow: flow({
        monthKey: '2026-08',
        realized: { inflows: dec('224790.3'), outflows: dec('98941.52'), result: dec('125848.78') },
      }),
      snapshot: snapshot(),
    });
    expect(periodSection(factsJuly)).toContain('monthKey: 2026-07');
    expect(periodSection(factsAugust)).toContain('monthKey: 2026-08');
    expect(snapshotSection(factsJuly)).toContain('asOf: 2026-09-24');
    expect(snapshotSection(factsAugust)).toContain('asOf: 2026-09-24');
    expect(snapshotSection(factsJuly)).toBe(snapshotSection(factsAugust));
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain(
      'Nunca apresente um fato CURRENT_SNAPSHOT como se fosse do PERIOD',
    );
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain(
      'NÃO mencione CURRENT_SNAPSHOT espontaneamente',
    );
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('vencido hoje');
  });

  it('resultado de caixa não é lucro líquido e outflow é saída de caixa', () => {
    const facts = buildFinancialFactsContent({
      monthKey: '2026-07',
      flow: flow(),
      snapshot: snapshot(),
    });
    expect(facts).toContain('cash.realized.result: 762.45');
    expect(facts).toContain('RESULTADO_DE_CAIXA');
    expect(facts).toContain('Não é lucro líquido');
    expect(facts).not.toMatch(/lucro líquido = 762\.45/);
    expect(facts).toContain(`cash.realized.outflows.meaning: ${ADVISOR_CASH_OUTFLOW_MEANING}`);
    expect(facts).toContain('Não é despesa contábil');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('RESULTADO DE CAIXA');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO chame de lucro líquido');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO use margem');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO chame automaticamente de despesa contábil');
  });

  it('pergunta objetiva não exige recomendação; consultiva permite, separada do fato', () => {
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('e em julho?');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('onde aumentou?');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO acrescente automaticamente: recomendação');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('o que você recomenda?');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('separe fato de recomendação');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('Interpretação não é recomendação');
  });

  it('comparação D1, cobertura, categoria e tool output permanecem explícitos', () => {
    const jul = flow({ monthKey: '2026-07' });
    const ago = flow({
      monthKey: '2026-08',
      realized: { inflows: dec('224790.3'), outflows: dec('0'), result: dec('224790.3') },
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
              amount: dec('207185.50'),
              percentage: dec('92'),
            },
          ],
        },
        outflows: null,
      },
    });
    const comparison = compareAdvisorCashMonths({ tenantId: 'tenant-a', periodA: jul, periodB: ago });
    expect(comparison.billingCoverage).toBe('FULL_BILLING');
    expect(comparison.inflowCategories.increases[0]?.name).toBe('Atendimentos Convênio');
    const analytical = buildAnalyticalFactsContent({
      monthKey: '2026-08',
      comparisonMonthKey: '2026-07',
      comparison,
    });
    expect(analytical).toContain('scope: PERIOD_COMPARISON');
    expect(analytical).toContain('periodA.scope: PERIOD');
    expect(analytical).toContain('periodB.scope: PERIOD');
    expect(analytical).toContain('difference.scope: COMPARISON');
    expect(analytical).toContain('periodA.monthKey: 2026-07');
    expect(analytical).toContain('periodB.monthKey: 2026-08');
    expect(analytical).toContain('RESULTADO_DE_CAIXA');
    const serialized = serializeAdvisorCashMonthComparison(comparison);
    expect(serialized.temporalScope).toBe('PERIOD_COMPARISON');
    expect(serialized.realizedResultMeaning).toBe('RESULTADO_DE_CAIXA');
    expect(serialized.monthKey).toBe('2026-08');
    expect(serialized.comparisonMonthKey).toBe('2026-07');
    expect(serialized.billingCoverage).toBe('FULL_BILLING');
  });

  it('emoji preference não regride', () => {
    expect(AI_EMOJI_PREFERENCE_INSTRUCTIONS.NONE).toContain('Do not use emojis');
    expect(AI_EMOJI_PREFERENCE_INSTRUCTIONS.MODERATE).toContain('sparingly');
    expect(AI_EMOJI_PREFERENCE_INSTRUCTIONS.FREE).toContain('naturally');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).not.toContain('Do not use emojis');
  });
});
