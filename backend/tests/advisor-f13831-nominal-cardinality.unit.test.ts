import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { CashRealizedDetails } from '../src/modules/analytics/domain/cash-realized-details.js';
import {
  aggregateAdvisorNominalDimension,
  classifyAdvisorFactualResponse,
  composeAdvisorFactualAnswer,
  extractExplicitAdvisorTopNLimit,
  isAdvisorNominalTopNQuestion,
  isAdvisorNominalWinnerQuestion,
  rankAdvisorNominalDimension,
  resolveAdvisorNominalIntent,
  serializeAdvisorNominalRanking,
} from '../src/modules/advisor/index.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function detailsFor(
  monthKey: string,
  items: CashRealizedDetails['items'],
): CashRealizedDetails {
  return {
    tenantId: 'tenant-a',
    monthKey,
    from: new Date('2026-01-01T00:00:00.000Z'),
    to: new Date('2026-09-29T00:00:00.000Z'),
    today: new Date('2026-09-29T00:00:00.000Z'),
    direction: 'inflows',
    categoryKey: 'cat-conv',
    categoryKind: 'category',
    available: true,
    total: items.reduce((sum, item) => sum.plus(item.attributedAmount), dec('0')),
    itemCount: items.length,
    limit: items.length,
    offset: 0,
    items,
  };
}

function item(input: {
  readonly id: string;
  readonly amount: string;
  readonly partyId: string;
  readonly partyName: string;
}): CashRealizedDetails['items'][number] {
  return {
    settlementExternalId: input.id,
    installmentExternalId: input.id,
    installmentKind: 'RECEIVABLE',
    occurredOn: new Date('2026-03-10T00:00:00.000Z'),
    netAmount: dec(input.amount),
    attributedAmount: dec(input.amount),
    description: null,
    partyId: input.partyId,
    partyName: input.partyName,
    categoryNames: ['Atendimentos Convênio'],
    categoryExternalIds: ['cat-conv'],
    categoryKey: 'cat-conv',
    categoryKind: 'category',
    categoryName: 'Atendimentos Convênio',
  };
}

const POPULATION = [
  item({ id: '1', amount: '500', partyId: 'p1', partyName: 'Bradesco Seguros' }),
  item({ id: '2', amount: '400', partyId: 'p2', partyName: 'VALE' }),
  item({ id: '3', amount: '300', partyId: 'p3', partyName: 'Unimed' }),
  item({ id: '4', amount: '200', partyId: 'p4', partyName: 'Capital Prev' }),
  item({ id: '5', amount: '100', partyId: 'p5', partyName: 'Amil' }),
];

const AS_OF = new Date('2026-09-29T15:00:00.000Z');

function rankingFacts(input: {
  readonly monthKey: string;
  readonly limit: number;
  readonly period?: {
    readonly kind: 'MONTH' | 'YTD' | 'YEAR';
    readonly year: number | null;
    readonly from: string;
    readonly to: string;
    readonly isPartialYear: boolean;
    readonly rangeKey: string | null;
  };
  readonly items?: CashRealizedDetails['items'];
}): Record<string, unknown> {
  const items = input.items ?? POPULATION;
  const aggregation = aggregateAdvisorNominalDimension({
    monthKey: input.monthKey,
    categoryKey: 'cat-conv',
    categoryName: 'Atendimentos Convênio',
    details: detailsFor(input.monthKey, items),
    ...(input.period !== undefined ? { period: input.period } : {}),
  });
  return serializeAdvisorNominalRanking({
    status: 'OK',
    aggregation,
    ranking: rankAdvisorNominalDimension(aggregation, input.limit),
  });
}

describe('F13.8.3.1 cardinalidade WINNER vs TOP_N', () => {
  it('A) winner YTD → limit 1 e resposta com exatamente 1 entidade', () => {
    const question = 'Qual foi o convênio que eu mais faturei no ano até agora?';
    expect(isAdvisorNominalWinnerQuestion(question)).toBe(true);
    expect(isAdvisorNominalTopNQuestion(question)).toBe(false);
    expect(resolveAdvisorNominalIntent(question, { now: AS_OF })?.limit).toBe(1);

    const facts = rankingFacts({
      monthKey: '2026-YTD',
      limit: 1,
      period: {
        kind: 'YTD',
        year: 2026,
        from: '2026-01-01',
        to: '2026-09-29',
        isPartialYear: true,
        rangeKey: '2026-YTD',
      },
    });
    expect(facts.requestedLimit).toBe(1);
    expect((facts.cardinality as { requestedLimit: number }).requestedLimit).toBe(1);

    const composed = composeAdvisorFactualAnswer({
      content: question,
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(composed.classification).toMatchObject({
      kind: 'FACTUAL_CLOSED',
      intentKind: 'RANKING_WINNER',
    });
    expect(composed.meta?.providerCalled).toBe(false);
    expect(composed.answer).toContain('Bradesco Seguros');
    expect(composed.answer).not.toContain('VALE');
    expect(composed.answer).not.toContain('Unimed');
    expect(composed.answer).not.toContain('1. ');
  });

  it('B) top 3 YTD → requestedLimit 3 e até 3 itens apresentados', () => {
    const question =
      'Quais foram os 3 convênios que mais geraram entrada de caixa neste ano?';
    expect(isAdvisorNominalTopNQuestion(question)).toBe(true);
    expect(isAdvisorNominalWinnerQuestion(question)).toBe(false);
    expect(extractExplicitAdvisorTopNLimit(
      question
        .normalize('NFD')
        .replace(/\p{M}/gu, '')
        .toLowerCase(),
    )).toBe(3);
    expect(resolveAdvisorNominalIntent(question, { now: AS_OF })?.limit).toBe(3);

    const facts = rankingFacts({
      monthKey: '2026-YTD',
      limit: 3,
      period: {
        kind: 'YTD',
        year: 2026,
        from: '2026-01-01',
        to: '2026-09-29',
        isPartialYear: true,
        rangeKey: '2026-YTD',
      },
    });
    const composed = composeAdvisorFactualAnswer({
      content: question,
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(composed.classification.intentKind).toBe('RANKING_TOPN');
    expect(composed.meta?.providerCalled).toBe(false);
    expect(composed.answer).toContain('1. Bradesco Seguros');
    expect(composed.answer).toContain('2. VALE');
    expect(composed.answer).toContain('3. Unimed');
    expect(composed.answer).not.toContain('Capital Prev');
    expect(composed.answer).toMatch(/identificação nominal cobre/);
  });

  it('C) mostre os 5 em ano completo → TOP_N 5', () => {
    const question = 'Mostre os 5 convênios que mais geraram entrada em 2025.';
    expect(resolveAdvisorNominalIntent(question, { now: AS_OF })?.limit).toBe(5);
    expect(isAdvisorNominalTopNQuestion(question)).toBe(true);
    expect(
      classifyAdvisorFactualResponse({
        content: question,
        anaphora: 'NONE',
        toolName: 'cash_nominal_dimension_ranking',
        toolOk: true,
        facts: rankingFacts({
          monthKey: '2025',
          limit: 5,
          period: {
            kind: 'YEAR',
            year: 2025,
            from: '2025-01-01',
            to: '2025-12-31',
            isPartialYear: false,
            rangeKey: '2025',
          },
        }),
      }).intentKind,
    ).toBe('RANKING_TOPN');
  });

  it('D) winner mensal continua winner com limit 1', () => {
    const question = 'Qual convênio individual mais faturou em agosto de 2026?';
    expect(isAdvisorNominalWinnerQuestion(question)).toBe(true);
    expect(resolveAdvisorNominalIntent(question, { now: AS_OF })?.limit).toBe(1);
    const composed = composeAdvisorFactualAnswer({
      content: question,
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify(
        rankingFacts({
          monthKey: '2026-08',
          limit: 1,
        }),
      ),
    });
    expect(composed.classification.intentKind).toBe('RANKING_WINNER');
    expect(composed.answer).toContain('Bradesco Seguros');
    expect(composed.answer).not.toContain('VALE');
  });

  it('E) top 3 mensal continua top 3', () => {
    const question = 'Quais foram os 3 convênios que mais faturaram em agosto de 2026?';
    expect(resolveAdvisorNominalIntent(question, { now: AS_OF })?.limit).toBe(3);
    const composed = composeAdvisorFactualAnswer({
      content: question,
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify(rankingFacts({ monthKey: '2026-08', limit: 3 })),
    });
    expect(composed.classification.intentKind).toBe('RANKING_TOPN');
    expect(composed.answer).toContain('1. Bradesco Seguros');
    expect(composed.answer).toContain('3. Unimed');
    expect(composed.answer).not.toContain('Capital Prev');
  });

  it('F) N maior que disponíveis não inventa posições', () => {
    const composed = composeAdvisorFactualAnswer({
      content: 'Quais foram os 5 convênios que mais faturaram neste ano?',
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify(
        rankingFacts({
          monthKey: '2026-YTD',
          limit: 5,
          items: POPULATION.slice(0, 2),
          period: {
            kind: 'YTD',
            year: 2026,
            from: '2026-01-01',
            to: '2026-09-29',
            isPartialYear: true,
            rangeKey: '2026-YTD',
          },
        }),
      ),
    });
    expect(composed.classification.intentKind).toBe('RANKING_TOPN');
    expect(composed.answer).toContain('1. Bradesco Seguros');
    expect(composed.answer).toContain('2. VALE');
    expect(composed.answer).not.toContain('3. ');
    expect(composed.answer).toContain('os 2 maiores');
  });

  it('G) coverage/ambiguidade preservados no winner e top N', () => {
    const withAmbiguous: CashRealizedDetails['items'] = [
      ...POPULATION.slice(0, 3),
      {
        ...item({ id: 'amb', amount: '50', partyId: 'x', partyName: 'x' }),
        partyId: null,
        partyName: null,
        description: 'Recebimento convênio',
      },
    ];
    const facts = rankingFacts({
      monthKey: '2026-YTD',
      limit: 3,
      items: withAmbiguous,
      period: {
        kind: 'YTD',
        year: 2026,
        from: '2026-01-01',
        to: '2026-09-29',
        isPartialYear: true,
        rangeKey: '2026-YTD',
      },
    });
    const coverage = facts.coverage as { identifiedPercent: string };
    expect(Number(coverage.identifiedPercent)).toBeLessThan(100);
    const composed = composeAdvisorFactualAnswer({
      content: 'Quais foram os 3 convênios que mais geraram entrada neste ano?',
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(composed.answer).toMatch(/identificação nominal cobre/);
  });

  it('H/I) FACTUAL_CLOSED winner/topN com providerCalls=0', () => {
    for (const question of [
      'Qual foi o convênio que eu mais faturei no ano até agora?',
      'Quais foram os 3 convênios que mais geraram entrada de caixa neste ano?',
    ]) {
      const limit = isAdvisorNominalWinnerQuestion(question) ? 1 : 3;
      const composed = composeAdvisorFactualAnswer({
        content: question,
        anaphora: 'NONE',
        toolName: 'cash_nominal_dimension_ranking',
        toolOk: true,
        toolContent: JSON.stringify(
          rankingFacts({
            monthKey: '2026-YTD',
            limit,
            period: {
              kind: 'YTD',
              year: 2026,
              from: '2026-01-01',
              to: '2026-09-29',
              isPartialYear: true,
              rangeKey: '2026-YTD',
            },
          }),
        ),
      });
      expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
      expect(composed.meta?.providerCalled).toBe(false);
    }
  });

  it('compositor usa requestedLimit do contrato, não o tamanho bruto do ranking', () => {
    const facts = rankingFacts({ monthKey: '2026-08', limit: 5 });
    // Simula contrato pedindo 2 mesmo com 5 linhas no array (não inferir pelo length).
    const patched = {
      ...facts,
      requestedLimit: 2,
      cardinality: {
        ...(facts.cardinality as Record<string, unknown>),
        requestedLimit: 2,
        returnedCount: 5,
      },
    };
    const composed = composeAdvisorFactualAnswer({
      content: 'Quais foram os 2 convênios que mais faturaram em agosto de 2026?',
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify(patched),
    });
    expect(composed.classification.intentKind).toBe('RANKING_TOPN');
    expect(composed.answer).toContain('1. Bradesco Seguros');
    expect(composed.answer).toContain('2. VALE');
    expect(composed.answer).not.toContain('3. Unimed');
  });
});
