import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { CashRealizedDetails } from '../src/modules/analytics/domain/cash-realized-details.js';
import {
  ADVISOR_NOMINAL_AMBIGUITY_DEFINITIONS,
  ADVISOR_NOMINAL_CARDINALITY_DEFINITIONS,
  ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS,
  ADVISOR_NOMINAL_PREFERRED_SHARE_FOR_GENERIC_QUESTION,
  ADVISOR_PLATFORM_INSTRUCTIONS,
  aggregateAdvisorNominalDimension,
  advisorNominalLookupFactContract,
  advisorNominalRankingFactContract,
  buildAnalyticalFactsContent,
  listAdvisorNominalTools,
  lookupAdvisorNominalEntity,
  rankAdvisorNominalDimension,
  serializeAdvisorNominalLookup,
  serializeAdvisorNominalRanking,
} from '../src/modules/advisor/index.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function details(items: CashRealizedDetails['items']): CashRealizedDetails {
  return {
    tenantId: 'tenant-a',
    monthKey: '2026-08',
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    today: new Date('2026-09-24T00:00:00.000Z'),
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
  readonly description?: string | null;
  readonly partyId?: string | null;
  readonly partyName?: string | null;
}): CashRealizedDetails['items'][number] {
  return {
    settlementExternalId: input.id,
    installmentExternalId: input.id,
    installmentKind: 'RECEIVABLE',
    occurredOn: new Date('2026-08-10T00:00:00.000Z'),
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

/** Fixture semântica AGO — valores oficiais do smoke, sem hardcode no backend. */
function agoHomologationAggregation() {
  return aggregateAdvisorNominalDimension({
    monthKey: '2026-08',
    categoryKey: 'cat-conv',
    categoryName: 'Atendimentos Convênio',
    details: details([
      item({ id: 'vale-1', amount: '77483.88', description: 'VALE' }),
      item({ id: 'brad-1', amount: '67828', partyId: 'p-brad', partyName: 'Bradesco Seguros' }),
      item({
        id: 'uni-1',
        amount: '31578.84',
        partyId: 'p-uni',
        partyName: 'Unimed',
        description: 'Unimed Fesp',
      }),
      item({ id: 'cap-1', amount: '9009.6', description: 'Capital Prev' }),
      item({ id: 'uni-amb', amount: '21285.18', description: 'Unimed' }),
    ]),
  });
}

describe('F13.8.1D3.2 denominadores semânticos', () => {
  it('define shareOfPopulation, shareOfIdentified e coverage sem intercambiabilidade', () => {
    expect(ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS.shareOfPopulation).toContain(
      'entityAmount / populationAmount',
    );
    expect(ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS.shareOfIdentified).toContain(
      'entityAmount / identifiedAmount',
    );
    expect(ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS.coverage).toContain(
      'identifiedAmount / populationAmount',
    );
    expect(ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS.shareOfIdentified).toContain(
      'NÃO rotular como total da categoria',
    );
    expect(ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS.coverage).not.toBe(
      ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS.shareOfPopulation,
    );
    expect(ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS.shareOfIdentified).not.toBe(
      ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS.shareOfPopulation,
    );
    expect(ADVISOR_NOMINAL_PREFERRED_SHARE_FOR_GENERIC_QUESTION).toBe('shareOfPopulation');
  });

  it('VALE fixture: ~37,40% population, ~41,68% identified, ~89,73% coverage', () => {
    const aggregation = agoHomologationAggregation();
    const vale = aggregation.groups.find((group) => group.normalizedKey === 'vale');
    expect(aggregation.coverage.totalPopulationAmount.toString()).toBe('207185.5');
    expect(aggregation.coverage.identifiedAmount.toString()).toBe('185900.32');
    expect(vale?.amount.toString()).toBe('77483.88');
    const populationShare = vale!.amount.div(aggregation.coverage.totalPopulationAmount).times(100);
    const identifiedShare = vale!.amount.div(aggregation.coverage.identifiedAmount).times(100);
    const coverage = aggregation.coverage.identifiedAmount
      .div(aggregation.coverage.totalPopulationAmount)
      .times(100);
    expect(populationShare.toDecimalPlaces(2).toString()).toBe('37.4');
    expect(identifiedShare.toDecimalPlaces(2).toString()).toBe('41.68');
    expect(coverage.toDecimalPlaces(2).toString()).toBe('89.73');
    expect(populationShare.toDecimalPlaces(2).toString()).not.toBe(
      identifiedShare.toDecimalPlaces(2).toString(),
    );
  });

  it('PLATFORM e contract proíbem rotular shareOfIdentified como população', () => {
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO rotule shareOfIdentified como total da categoria');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('entre os valores identificados');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('prefira shareOfPopulation');
    expect(advisorNominalRankingFactContract().denominators).toEqual(
      ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS,
    );
    expect(advisorNominalLookupFactContract().preferredShareForGenericQuestion).toBe(
      'shareOfPopulation',
    );
  });

  it('ranking e lookup carregam denominadores suficientes', () => {
    const aggregation = agoHomologationAggregation();
    const ranking = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking: rankAdvisorNominalDimension(aggregation, 5),
    });
    const lookup = serializeAdvisorNominalLookup({
      status: 'OK',
      aggregation,
      entityQuery: 'Vale',
      match: lookupAdvisorNominalEntity(aggregation, 'Vale').matches[0] ?? null,
    });
    expect(ranking.denominators).toEqual(ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS);
    expect(ranking.population).toEqual(expect.objectContaining({ amount: '207185.5' }));
    expect(lookup.denominators).toEqual(ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS);
    expect(lookup.populationAmount).toBe('207185.5');
    expect(lookup.identifiedAmount).toBe('185900.32');
    expect(lookup.entity).toEqual(
      expect.objectContaining({
        amount: '77483.88',
        identityStatus: 'IDENTIFIED',
        shareOfPopulation: populationShare().toString(),
        shareOfIdentified: identifiedShare().toString(),
      }),
    );
  });
});

describe('F13.8.1D3.2 cardinalidade e topN', () => {
  it('requestedLimit=5 com 4 IDENTIFIED: returnedCount=4 e hasMore=false', () => {
    const aggregation = agoHomologationAggregation();
    const serialized = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking: rankAdvisorNominalDimension(aggregation, 5),
    });
    expect(serialized.requestedLimit).toBe(5);
    expect(serialized.returnedCount).toBe(4);
    expect(serialized.identifiedEntityCount).toBe(4);
    expect(serialized.hasMore).toBe(false);
    expect(serialized.cardinality).toEqual({
      requestedLimit: 5,
      returnedCount: 4,
      identifiedEntityCount: 4,
      hasMore: false,
      requestedLimitIsNotEntityCount: true,
    });
    expect(serialized.cardinalityMeanings).toEqual(ADVISOR_NOMINAL_CARDINALITY_DEFINITIONS);
    expect(serialized.ranking).toHaveLength(4);
    expect(
      (serialized.ranking as Array<{ identityStatus: string }>).every(
        (row) => row.identityStatus === 'IDENTIFIED',
      ),
    ).toBe(true);
    expect(JSON.stringify(serialized.ranking)).not.toContain('21285.18');
  });

  it('topN share da população é 89,73% e dos identificados é 100%', () => {
    const aggregation = agoHomologationAggregation();
    const serialized = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking: rankAdvisorNominalDimension(aggregation, 5),
    });
    expect(serialized.topN).toEqual(
      expect.objectContaining({
        amount: '185900.32',
        shareOfPopulation: coverageShare().toString(),
        shareOfIdentified: '100',
        returnedCount: 4,
        hasMore: false,
      }),
    );
    expect(serialized.coverageIsNotTopNShare).toBe(true);
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('do total da categoria');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('prefira shareOfPopulation');
  });
});

describe('F13.8.1D3.2 ambiguidade Unimed', () => {
  it('preserva IDENTIFIED 31578.84 e AMBIGUOUS 21285.18 sem unir', () => {
    const aggregation = agoHomologationAggregation();
    const identified = aggregation.groups.filter((group) => group.identityStatus === 'IDENTIFIED');
    const ambiguous = aggregation.groups.filter((group) => group.identityStatus === 'AMBIGUOUS');
    expect(identified.find((group) => group.normalizedKey === 'unimed')?.amount.toString()).toBe(
      '31578.84',
    );
    expect(aggregation.coverage.ambiguousAmount.toString()).toBe('21285.18');
    expect(ambiguous).toHaveLength(1);
    expect(rankAdvisorNominalDimension(aggregation, 5).ranking).toHaveLength(4);
    expect(JSON.stringify(serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation,
      ranking: rankAdvisorNominalDimension(aggregation, 5),
    }))).not.toContain('outro movimento');
  });

  it('explicação oficial usa ausência de identificador estruturado e proíbe motivo inventado', () => {
    expect(ADVISOR_NOMINAL_AMBIGUITY_DEFINITIONS.officialExplanation).toContain(
      'identificador estruturado compartilhado',
    );
    expect(ADVISOR_NOMINAL_AMBIGUITY_DEFINITIONS.ambiguousAmount).toContain('NÃO inventar motivo operacional');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('tipos de atendimento');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('subcategorias');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('identificador estruturado compartilhado');
    expect(advisorNominalRankingFactContract().doesNotProve).toEqual(
      expect.arrayContaining(['OPERATIONAL_AMBIGUITY_REASON']),
    );
  });
});

describe('F13.8.1D3.2 disciplina objetiva', () => {
  it('pergunta objetiva não autoriza estratégia, concentração ou importância', () => {
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('boa concentração');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('retenção');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('captação');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('relacionamento');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('responda os fatos e pare');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('melhor desempenho');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('o que você acha?');
    expect(advisorNominalRankingFactContract().doesNotProve).toEqual(
      expect.arrayContaining(['CONCENTRATION_QUALITY', 'RECOMMENDATION']),
    );
  });

  it('PERIOD_NOMINAL e schemas das tools carregam a semântica', () => {
    const facts = buildAnalyticalFactsContent({
      monthKey: '2026-08',
      comparison: null,
      drilldown: {
        toolName: 'cash_nominal_dimension_ranking',
        monthKey: '2026-08',
        ok: true,
        content: '{"status":"OK"}',
      },
    });
    expect(facts).toContain('shareOfPopulation ≠ shareOfIdentified ≠ coverage');
    expect(facts).toContain('requestedLimit não é cardinalidade');
    const tools = listAdvisorNominalTools();
    expect(tools.find((tool) => tool.name === 'cash_nominal_dimension_ranking')?.description).toContain(
      'requestedLimit não é cardinalidade',
    );
    expect(tools.find((tool) => tool.name === 'cash_nominal_dimension_lookup')?.description).toContain(
      'shareOfPopulation é o total da categoria',
    );
  });
});

function populationShare(): Prisma.Decimal {
  return dec('77483.88').div(dec('207185.5')).times(100);
}

function identifiedShare(): Prisma.Decimal {
  return dec('77483.88').div(dec('185900.32')).times(100);
}

function coverageShare(): Prisma.Decimal {
  return dec('185900.32').div(dec('207185.5')).times(100);
}
