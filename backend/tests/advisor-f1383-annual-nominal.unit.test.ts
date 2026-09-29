import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { CashRealizedDetails } from '../src/modules/analytics/domain/cash-realized-details.js';
import {
  ADVISOR_CASH_INFLOW_MEANING,
  aggregateAdvisorNominalDimension,
  assertCashNominalLookupArgs,
  assertCashNominalRankingArgs,
  composeAdvisorFactualAnswer,
  lookupAdvisorNominalEntity,
  rankAdvisorNominalDimension,
  resolveAdvisorCivilRange,
  resolveAdvisorNominalIntent,
  resolveNominalPeriodInput,
  serializeAdvisorNominalLookup,
  serializeAdvisorNominalRanking,
} from '../src/modules/advisor/index.js';
import { AdvisorDomainError } from '../src/modules/advisor/domain/advisor-domain-error.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function detailsFor(
  monthKey: string,
  from: string,
  to: string,
  items: CashRealizedDetails['items'],
): CashRealizedDetails {
  return {
    tenantId: 'tenant-a',
    monthKey,
    from: new Date(from),
    to: new Date(to),
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
  readonly occurredOn: string;
  readonly description?: string | null;
  readonly partyId?: string | null;
  readonly partyName?: string | null;
}): CashRealizedDetails['items'][number] {
  return {
    settlementExternalId: input.id,
    installmentExternalId: input.id,
    installmentKind: 'RECEIVABLE',
    occurredOn: new Date(input.occurredOn),
    netAmount: dec(input.amount),
    attributedAmount: dec(input.amount),
    description: input.description ?? null,
    partyId: input.partyId ?? null,
    partyName: input.partyName ?? null,
    categoryNames: ['Atendimentos Convênio'],
    categoryExternalIds: ['cat-conv'],
    categoryKey: 'cat-conv',
    categoryKind: 'category',
    categoryName: 'Atendimentos Convênio',
  };
}

const AS_OF_SEP = new Date('2026-09-29T15:00:00.000Z');

describe('F13.8.3 contrato temporal civil', () => {
  it('resolve YTD para "este ano" / "no ano até agora" / "de janeiro até agora"', () => {
    for (const content of [
      'Qual convênio mais faturou este ano?',
      'Qual foi o convênio que eu mais faturei no ano até agora?',
      'Quais convênios mais faturaram de janeiro até agora?',
    ]) {
      const range = resolveAdvisorCivilRange({ content, now: AS_OF_SEP });
      expect(range).toMatchObject({
        kind: 'YTD',
        year: 2026,
        isPartialYear: true,
        rangeKey: '2026-YTD',
      });
      expect(range?.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
      expect(range?.to.toISOString()).toBe('2026-09-29T00:00:00.000Z');
    }
  });

  it('ano explícito corrente vira YTD até asOf', () => {
    const range = resolveAdvisorCivilRange({
      content: 'Quais foram os 5 convênios que mais faturaram em 2026?',
      now: AS_OF_SEP,
    });
    expect(range).toMatchObject({ kind: 'YTD', year: 2026, rangeKey: '2026-YTD' });
    expect(range?.to.toISOString()).toBe('2026-09-29T00:00:00.000Z');
  });

  it('ano explícito anterior cobre 01-01 a 31-12', () => {
    const range = resolveAdvisorCivilRange({
      content: 'Qual convênio mais faturou no ano de 2025?',
      now: AS_OF_SEP,
    });
    expect(range).toMatchObject({
      kind: 'YEAR',
      year: 2025,
      isPartialYear: false,
      rangeKey: '2025',
    });
    expect(range?.from.toISOString()).toBe('2025-01-01T00:00:00.000Z');
    expect(range?.to.toISOString()).toBe('2025-12-31T00:00:00.000Z');
  });

  it('1º de janeiro: YTD colapsa para o próprio dia', () => {
    const now = new Date('2026-01-01T15:00:00.000Z');
    const range = resolveAdvisorCivilRange({ content: 'este ano', now });
    expect(range?.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(range?.to.toISOString()).toBe('2026-01-01T00:00:00.000Z');
  });

  it('31 de dezembro: YTD cobre o ano inteiro até o asOf', () => {
    const now = new Date('2026-12-31T18:00:00.000Z');
    const range = resolveAdvisorCivilRange({ content: 'neste ano', now });
    expect(range?.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(range?.to.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('respeita virada UTC em que São Paulo ainda está no ano anterior', () => {
    const before = new Date('2027-01-01T02:30:00.000Z');
    const range = resolveAdvisorCivilRange({ content: 'este ano', now: before });
    expect(range).toMatchObject({ kind: 'YTD', year: 2026, rangeKey: '2026-YTD' });
    expect(range?.to.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('ano futuro não resolve período oficial', () => {
    expect(
      resolveAdvisorCivilRange({
        content: 'Qual convênio mais faturou em 2099?',
        now: AS_OF_SEP,
      }),
    ).toBeNull();
  });

  it('mês explícito tem precedência sobre interpretação anual', () => {
    expect(
      resolveAdvisorCivilRange({
        content: 'Qual convênio mais faturou em agosto de 2026?',
        now: AS_OF_SEP,
      }),
    ).toBeNull();
  });
});

describe('F13.8.3 intenção nominal + período anual', () => {
  it('roteia winner YTD com civilRange', () => {
    const intent = resolveAdvisorNominalIntent(
      'Qual foi o convênio que eu mais faturei no ano até agora?',
      { now: AS_OF_SEP },
    );
    expect(intent?.toolName).toBe('cash_nominal_dimension_ranking');
    expect(intent?.categoryReference).toBe('convenio');
    expect(intent?.civilRange).toMatchObject({ kind: 'YTD', year: 2026 });
  });

  it('roteia top N anual', () => {
    const intent = resolveAdvisorNominalIntent(
      'Quais foram os 5 convênios que mais faturaram em 2026?',
      { now: AS_OF_SEP },
    );
    expect(intent?.toolName).toBe('cash_nominal_dimension_ranking');
    expect(intent?.limit).toBe(5);
    expect(intent?.civilRange?.kind).toBe('YTD');
  });

  it('roteia lookup anual', () => {
    const intent = resolveAdvisorNominalIntent('Quanto a Unimed faturou este ano?', {
      now: AS_OF_SEP,
    });
    expect(intent?.toolName).toBe('cash_nominal_dimension_lookup');
    expect(intent?.entityQuery).toBe('Unimed');
    expect(intent?.civilRange?.kind).toBe('YTD');
  });

  it('não improvisar comparação anual nesta fase', () => {
    const intent = resolveAdvisorNominalIntent(
      'Compare os convênios deste ano com o ano passado.',
      { comparison: true, now: AS_OF_SEP },
    );
    expect(intent?.toolName).not.toBe('compare_cash_nominal_dimension');
  });

  it('pergunta mensal homologada continua sem civilRange', () => {
    const intent = resolveAdvisorNominalIntent(
      'Qual convênio mais faturou em agosto de 2026?',
      { now: AS_OF_SEP },
    );
    expect(intent?.toolName).toBe('cash_nominal_dimension_ranking');
    expect(intent?.civilRange).toBeUndefined();
  });
});

describe('F13.8.3 resolveNominalPeriodInput', () => {
  it('monthKey sozinho permanece MONTH', () => {
    const period = resolveNominalPeriodInput({ monthKey: '2026-08', now: AS_OF_SEP });
    expect(period.monthKey).toBe('2026-08');
    expect(period.civilRange).toBeUndefined();
    expect(period.meta.kind).toBe('MONTH');
  });

  it('YTD corrente usa from/to civis sem datas futuras', () => {
    const period = resolveNominalPeriodInput({
      periodKind: 'YTD',
      year: 2026,
      now: AS_OF_SEP,
    });
    expect(period.monthKey).toBe('2026-YTD');
    expect(period.civilRange).toEqual({
      from: new Date('2026-01-01T00:00:00.000Z'),
      to: new Date('2026-09-29T00:00:00.000Z'),
      rangeKey: '2026-YTD',
    });
    expect(period.meta).toMatchObject({
      kind: 'YTD',
      year: 2026,
      from: '2026-01-01',
      to: '2026-09-29',
      isPartialYear: true,
    });
  });

  it('YEAR passado cobre ano civil completo', () => {
    const period = resolveNominalPeriodInput({
      periodKind: 'YEAR',
      year: 2025,
      now: AS_OF_SEP,
    });
    expect(period.meta.kind).toBe('YEAR');
    expect(period.civilRange?.rangeKey).toBe('2025');
    expect(period.meta.from).toBe('2025-01-01');
    expect(period.meta.to).toBe('2025-12-31');
  });

  it('rejeita monthKey + periodKind juntos e ano futuro', () => {
    expect(() =>
      resolveNominalPeriodInput({ monthKey: '2026-08', periodKind: 'YTD', year: 2026 }),
    ).toThrow(AdvisorDomainError);
    expect(() =>
      resolveNominalPeriodInput({ periodKind: 'YTD', year: 2099, now: AS_OF_SEP }),
    ).toThrow(AdvisorDomainError);
  });
});

describe('F13.8.3 tools rejeitam campos perigosos', () => {
  it('ranking rejeita tenantId, SQL, from/to livres', () => {
    expect(() =>
      assertCashNominalRankingArgs({
        periodKind: 'YTD',
        year: 2026,
        categoryReference: 'convenio',
        tenantId: 'x',
      }),
    ).toThrow(AdvisorDomainError);
    expect(() =>
      assertCashNominalRankingArgs({
        periodKind: 'YTD',
        year: 2026,
        categoryReference: 'convenio',
        sql: 'select 1',
      }),
    ).toThrow(AdvisorDomainError);
    expect(() =>
      assertCashNominalRankingArgs({
        periodKind: 'YTD',
        year: 2026,
        categoryReference: 'convenio',
        from: '2026-01-01',
      }),
    ).toThrow(AdvisorDomainError);
  });

  it('lookup aceita periodKind+year tipados', () => {
    expect(
      assertCashNominalLookupArgs({
        periodKind: 'YTD',
        year: 2026,
        categoryReference: 'convenio',
        entityQuery: 'Unimed',
      }),
    ).toEqual({
      periodKind: 'YTD',
      year: 2026,
      categoryReference: 'convenio',
      entityQuery: 'Unimed',
    });
  });
});

describe('F13.8.3 agregação / ranking / lookup YTD', () => {
  const ytdItems = [
    item({
      id: '1',
      amount: '1000',
      occurredOn: '2026-02-10T00:00:00.000Z',
      partyId: 'p-unimed',
      partyName: 'Unimed',
    }),
    item({
      id: '2',
      amount: '400',
      occurredOn: '2026-03-10T00:00:00.000Z',
      partyId: 'p-unimed',
      partyName: 'Unimed',
    }),
    item({
      id: '3',
      amount: '900',
      occurredOn: '2026-04-10T00:00:00.000Z',
      partyId: 'p-bradesco',
      partyName: 'Bradesco Saúde',
    }),
    item({
      id: '4',
      amount: '200',
      occurredOn: '2026-05-10T00:00:00.000Z',
      partyId: 'p-amil',
      partyName: 'Amil',
    }),
  ];

  const ytdDetails = detailsFor(
    '2026-YTD',
    '2026-01-01T00:00:00.000Z',
    '2026-09-29T00:00:00.000Z',
    ytdItems,
  );

  const periodMeta = {
    kind: 'YTD' as const,
    year: 2026,
    from: '2026-01-01',
    to: '2026-09-29',
    isPartialYear: true,
    rangeKey: '2026-YTD',
  };

  it('winner YTD agrega intervalo único e declara cashMeaning', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-YTD',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: ytdDetails,
      period: periodMeta,
    });
    const ranking = rankAdvisorNominalDimension(aggregation, 3);
    expect(ranking.ranking[0]?.displayName).toBe('Unimed');
    expect(ranking.ranking[0]?.amount.toString()).toBe('1400');
    const serialized = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking,
    });
    expect(serialized.cashMeaning).toBe(ADVISOR_CASH_INFLOW_MEANING);
    expect(serialized.period).toMatchObject(periodMeta);
    expect(serialized.scope).toBe('CIVIL_RANGE');
  });

  it('top N YTD retorna N posições oficiais', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-YTD',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: ytdDetails,
      period: periodMeta,
    });
    const ranking = rankAdvisorNominalDimension(aggregation, 2);
    expect(ranking.ranking).toHaveLength(2);
    expect(ranking.ranking.map((row) => row.displayName)).toEqual(['Unimed', 'Bradesco Saúde']);
  });

  it('lookup YTD resolve entidade segura', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-YTD',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: ytdDetails,
      period: periodMeta,
    });
    const found = lookupAdvisorNominalEntity(aggregation, 'Unimed');
    expect(found.status).toBe('OK');
    const serialized = serializeAdvisorNominalLookup({
      status: 'OK',
      aggregation,
      entityQuery: 'Unimed',
      match: found.status === 'OK' ? found.matches[0]! : null,
    });
    expect(serialized.cashMeaning).toBe(ADVISOR_CASH_INFLOW_MEANING);
    expect((serialized.entity as { amount: string }).amount).toBe('1400');
  });

  it('empate preserva política determinística existente', () => {
    const tied = detailsFor('2026-YTD', '2026-01-01T00:00:00.000Z', '2026-09-29T00:00:00.000Z', [
      item({
        id: 'a',
        amount: '500',
        occurredOn: '2026-02-01T00:00:00.000Z',
        partyId: 'p1',
        partyName: 'Alpha Convênio',
      }),
      item({
        id: 'b',
        amount: '500',
        occurredOn: '2026-03-01T00:00:00.000Z',
        partyId: 'p2',
        partyName: 'Beta Convênio',
      }),
    ]);
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-YTD',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: tied,
      period: periodMeta,
    });
    const ranking = rankAdvisorNominalDimension(aggregation, 2);
    expect(ranking.ranking[0]?.amount.toString()).toBe('500');
    expect(ranking.ranking[1]?.amount.toString()).toBe('500');
    expect(ranking.ranking[0]?.normalizedKey < ranking.ranking[1]!.normalizedKey).toBe(true);
  });

  it('nenhuma movimentação → EMPTY_RESULT com período', () => {
    const empty = detailsFor('2026-YTD', '2026-01-01T00:00:00.000Z', '2026-09-29T00:00:00.000Z', []);
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-YTD',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: empty,
      period: periodMeta,
    });
    const serialized = serializeAdvisorNominalRanking({
      status: 'EMPTY_RESULT',
      aggregation,
      ranking: rankAdvisorNominalDimension(aggregation, 5),
    });
    expect(serialized.status).toBe('EMPTY_RESULT');
    expect(serialized.period).toMatchObject({ kind: 'YTD', year: 2026 });
  });

  it('identidade ambígua no lookup não escolhe silenciosamente', () => {
    const ambiguous = detailsFor(
      '2026-YTD',
      '2026-01-01T00:00:00.000Z',
      '2026-09-29T00:00:00.000Z',
      [
        item({
          id: '1',
          amount: '100',
          occurredOn: '2026-02-01T00:00:00.000Z',
          partyId: 'p1',
          partyName: 'Unimed Nacional',
        }),
        item({
          id: '2',
          amount: '200',
          occurredOn: '2026-03-01T00:00:00.000Z',
          partyId: 'p2',
          partyName: 'Unimed Regional',
        }),
      ],
    );
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-YTD',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: ambiguous,
      period: periodMeta,
    });
    expect(lookupAdvisorNominalEntity(aggregation, 'Unimed').status).toBe('AMBIGUOUS');
  });

  it('mês homologado continua produzindo o mesmo monthKey/contrato MONTH', () => {
    const monthly = detailsFor(
      '2026-08',
      '2026-08-01T00:00:00.000Z',
      '2026-08-31T00:00:00.000Z',
      [
        item({
          id: 'm1',
          amount: '300',
          occurredOn: '2026-08-10T00:00:00.000Z',
          partyId: 'p-unimed',
          partyName: 'Unimed',
        }),
      ],
    );
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: monthly,
    });
    expect(aggregation.period.kind).toBe('MONTH');
    const serialized = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking: rankAdvisorNominalDimension(aggregation, 5),
    });
    expect(serialized.monthKey).toBe('2026-08');
    expect(serialized.scope).toBe('PERIOD');
    expect(serialized.cashMeaning).toBe(ADVISOR_CASH_INFLOW_MEANING);
  });
});

describe('F13.8.3 compositor factual anual', () => {
  it('FACTUAL_CLOSED YTD sem provider e com linguagem de caixa realizado', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-YTD',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: detailsFor('2026-YTD', '2026-01-01T00:00:00.000Z', '2026-09-29T00:00:00.000Z', [
        item({
          id: '1',
          amount: '1400',
          occurredOn: '2026-02-10T00:00:00.000Z',
          partyId: 'p-unimed',
          partyName: 'Unimed',
        }),
        item({
          id: '2',
          amount: '900',
          occurredOn: '2026-04-10T00:00:00.000Z',
          partyId: 'p-bradesco',
          partyName: 'Bradesco Saúde',
        }),
      ]),
      period: {
        kind: 'YTD',
        year: 2026,
        from: '2026-01-01',
        to: '2026-09-29',
        isPartialYear: true,
        rangeKey: '2026-YTD',
      },
    });
    const facts = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking: rankAdvisorNominalDimension(aggregation, 5),
    });
    const question = 'Qual foi o convênio que eu mais faturei no ano até agora?';
    const composed = composeAdvisorFactualAnswer({
      content: question,
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
    expect(composed.meta?.providerCalled).toBe(false);
    expect(composed.answer).toContain('recebimentos realizados');
    expect(composed.answer).toContain('2026 até agora');
    expect(composed.answer).toContain('Unimed');
    expect(composed.answer).not.toMatch(/^Unimed faturou/);
  });
});
