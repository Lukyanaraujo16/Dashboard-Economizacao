import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { CashRealizedDetails } from '../src/modules/analytics/domain/cash-realized-details.js';
import {
  aggregateAdvisorNominalDimension,
  composeAdvisorFactualAnswer,
  lookupAdvisorNominalEntity,
  rankAdvisorNominalDimension,
  resolveAdvisorConversationalNominal,
  resolveAdvisorNominalIntent,
  serializeAdvisorNominalLookup,
} from '../src/modules/advisor/index.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

const AS_OF = new Date('2026-09-29T15:00:00.000Z');

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
  item({ id: '1', amount: '427195.89', partyId: 'p-brad', partyName: 'Bradesco Seguros' }),
  item({ id: '2', amount: '204451.59', partyId: 'p-vale', partyName: 'VALE' }),
  item({ id: '3', amount: '125100.44', partyId: 'p-uni', partyName: 'Unimed' }),
];

const YTD_PERIOD = {
  kind: 'YTD' as const,
  year: 2026,
  from: '2026-01-01',
  to: '2026-09-29',
  isPartialYear: true,
  rangeKey: '2026-YTD',
};

function samePopulationAggregation(monthKey: string, period = YTD_PERIOD) {
  return aggregateAdvisorNominalDimension({
    monthKey,
    categoryKey: 'cat-conv',
    categoryName: 'Atendimentos Convênio',
    details: detailsFor(monthKey, POPULATION),
    period,
  });
}

describe('F13.8.3.2 lookup anual alinhado ao ranking', () => {
  it('A) invariância ranking(YTD,E) = lookup(YTD,E)', () => {
    const aggregation = samePopulationAggregation('2026-YTD');
    const ranking = rankAdvisorNominalDimension(aggregation, 3);
    const entity = ranking.ranking.find((row) => row.displayName === 'Unimed');
    expect(entity?.amount.toString()).toBe('125100.44');
    const looked = lookupAdvisorNominalEntity(aggregation, 'Unimed');
    expect(looked.status).toBe('OK');
    expect(looked.matches[0]?.amount.toString()).toBe(entity!.amount.toString());
  });

  it('B) invariância YEAR', () => {
    const period = {
      kind: 'YEAR' as const,
      year: 2025,
      from: '2025-01-01',
      to: '2025-12-31',
      isPartialYear: false,
      rangeKey: '2025',
    };
    const aggregation = samePopulationAggregation('2025', period);
    const ranked = rankAdvisorNominalDimension(aggregation, 5).ranking[2]!;
    const looked = lookupAdvisorNominalEntity(aggregation, ranked.displayName);
    expect(looked.status).toBe('OK');
    expect(looked.matches[0]?.amount.toString()).toBe(ranked.amount.toString());
  });

  it('C) lookup mensal existente continua', () => {
    const intent = resolveAdvisorNominalIntent('Quanto recebi da Vale em agosto?', {
      now: AS_OF,
    });
    expect(intent).toMatchObject({
      toolName: 'cash_nominal_dimension_lookup',
      entityQuery: 'Vale',
    });
    expect(intent?.civilRange).toBeUndefined();
  });

  it('D) lookup YTD explícito com categoria', () => {
    const intent = resolveAdvisorNominalIntent(
      'Quanto o convênio Unimed gerou de entrada neste ano?',
      { now: AS_OF },
    );
    expect(intent).toMatchObject({
      toolName: 'cash_nominal_dimension_lookup',
      categoryReference: 'convenio',
      entityQuery: 'Unimed',
    });
    expect(intent?.civilRange).toMatchObject({ kind: 'YTD', year: 2026 });
  });

  it('E) follow-up herda dimensão do ranking USER anterior', () => {
    const conversational = resolveAdvisorConversationalNominal({
      content: 'Quanto a Unimed gerou de entrada de caixa neste ano?',
      now: AS_OF,
      priorUserContents: [
        'Quais foram os 3 convênios que mais geraram entrada de caixa neste ano?',
      ],
    });
    expect(conversational.intent).toMatchObject({
      toolName: 'cash_nominal_dimension_lookup',
      entityQuery: 'Unimed',
      categoryReference: 'convenio',
    });
    expect(conversational.intent?.civilRange).toMatchObject({ kind: 'YTD', year: 2026 });
    expect(conversational.anaphora).toBe('RESOLVED');
  });

  it('F) probe curto "E a Unimed?" herda dimensão/período seguros do USER', () => {
    const conversational = resolveAdvisorConversationalNominal({
      content: 'E a Unimed?',
      now: AS_OF,
      priorUserContents: [
        'Quais foram os 3 convênios que mais geraram entrada de caixa neste ano?',
      ],
    });
    expect(conversational.intent).toMatchObject({
      toolName: 'cash_nominal_dimension_lookup',
      entityQuery: 'Unimed',
      categoryReference: 'convenio',
    });
    expect(conversational.intent?.civilRange?.kind).toBe('YTD');
    expect(conversational.anaphora).toBe('RESOLVED');
  });

  it('F2) probe curto sem contexto seguro → UNRESOLVED', () => {
    const conversational = resolveAdvisorConversationalNominal({
      content: 'E a Unimed?',
      now: AS_OF,
      priorUserContents: [],
    });
    expect(conversational.intent).toBeNull();
    expect(conversational.anaphora).toBe('UNRESOLVED');
  });

  it('G) identidade inexistente → NOT_FOUND factual', () => {
    const aggregation = samePopulationAggregation('2026-YTD');
    expect(lookupAdvisorNominalEntity(aggregation, 'Entidade Fantasma').status).toBe(
      'NOT_FOUND',
    );
    const facts = serializeAdvisorNominalLookup({
      status: 'NOT_FOUND',
      aggregation,
      entityQuery: 'Entidade Fantasma',
      match: null,
    });
    const composed = composeAdvisorFactualAnswer({
      content: 'Quanto a Entidade Fantasma gerou de entrada neste ano?',
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_lookup',
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
    expect(composed.classification.intentKind).toBe('FACTUAL_LIMITATION');
    expect(composed.answer).toContain('Entidade Fantasma');
    expect(composed.answer).not.toMatch(/pode ocorrer por diferentes razões/i);
    expect(composed.meta?.providerCalled).toBe(false);
  });

  it('H) identidade ambígua → AMBIGUOUS', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-YTD',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: detailsFor('2026-YTD', [
        item({ id: '1', amount: '100', partyId: 'p1', partyName: 'Unimed Nacional' }),
        item({ id: '2', amount: '200', partyId: 'p2', partyName: 'Unimed Regional' }),
      ]),
      period: YTD_PERIOD,
    });
    expect(lookupAdvisorNominalEntity(aggregation, 'Unimed').status).toBe('AMBIGUOUS');
  });

  it('J/K) período YTD e YEAR preservados no intent de lookup', () => {
    expect(
      resolveAdvisorNominalIntent('Quanto a Unimed gerou de entrada neste ano?', {
        now: AS_OF,
      })?.civilRange,
    ).toMatchObject({ kind: 'YTD', year: 2026, rangeKey: '2026-YTD' });
    expect(
      resolveAdvisorNominalIntent('Quanto a Unimed gerou de entrada em 2025?', {
        now: AS_OF,
      })?.civilRange,
    ).toMatchObject({ kind: 'YEAR', year: 2025, rangeKey: '2025' });
  });

  it('L) FACTUAL_CLOSED lookup YTD com providerCalls=0', () => {
    const aggregation = samePopulationAggregation('2026-YTD');
    const found = lookupAdvisorNominalEntity(aggregation, 'Unimed');
    expect(found.status).toBe('OK');
    const facts = serializeAdvisorNominalLookup({
      status: 'OK',
      aggregation,
      entityQuery: 'Unimed',
      match: found.matches[0]!,
    });
    const composed = composeAdvisorFactualAnswer({
      content: 'Quanto a Unimed gerou de entrada de caixa neste ano?',
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_lookup',
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(composed.classification).toMatchObject({
      kind: 'FACTUAL_CLOSED',
      intentKind: 'LOOKUP',
    });
    expect(composed.meta?.providerCalled).toBe(false);
    expect(composed.answer).toContain('Unimed');
    expect(composed.answer).toContain('125.100,44');
    expect(composed.answer).toMatch(/recebimentos realizados|entradas de caixa/i);
  });

  it('lookup autossuficiente sem categoria ainda resolve intent + YTD', () => {
    const intent = resolveAdvisorNominalIntent(
      'Quanto a Unimed gerou de entrada de caixa neste ano?',
      { now: AS_OF },
    );
    expect(intent).toMatchObject({
      toolName: 'cash_nominal_dimension_lookup',
      entityQuery: 'Unimed',
    });
    expect(intent?.categoryReference).toBeUndefined();
    expect(intent?.civilRange?.kind).toBe('YTD');
  });

  it('não usa texto do CONSULTANT — só prior USER', () => {
    const conversational = resolveAdvisorConversationalNominal({
      content: 'Quanto a Unimed gerou de entrada neste ano?',
      now: AS_OF,
      priorUserContents: [],
    });
    expect(conversational.intent?.categoryReference).toBeUndefined();
    expect(conversational.anaphora).toBe('NONE');
  });
});
