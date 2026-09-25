import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { CashRealizedDetails } from '../src/modules/analytics/domain/cash-realized-details.js';
import {
  ADVISOR_NOMINAL_DOES_NOT_PROVE,
  ADVISOR_NOMINAL_RANKING_FACT_KIND,
  ADVISOR_PLATFORM_INSTRUCTIONS,
  CASH_NOMINAL_LOOKUP_TOOL_NAME,
  CASH_NOMINAL_RANKING_TOOL_NAME,
  COMPARE_CASH_NOMINAL_TOOL_NAME,
  aggregateAdvisorNominalDimension,
  assertCashNominalLookupArgs,
  assertCashNominalRankingArgs,
  compareAdvisorNominalAggregations,
  createAdvisorAnalyticalToolExecutor,
  identifyAdvisorNominalDimension,
  lookupAdvisorNominalEntity,
  normalizeAdvisorNominalKey,
  rankAdvisorNominalDimension,
  resolveAdvisorOfficialCategory,
  resolveAdvisorNominalIntent,
  resolveConclusionSafety,
  serializeAdvisorNominalRanking,
  tokenizeAdvisorNominalText,
} from '../src/modules/advisor/index.js';
import { AdvisorDomainError } from '../src/modules/advisor/domain/advisor-domain-error.js';

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

describe('F13.8.1D3 dimensão nominal', () => {
  it('normaliza trim, whitespace, case e Unicode sem fuzzy', () => {
    expect(normalizeAdvisorNominalKey('  VALE   -   Bruto  ')).toBe('vale');
    expect(normalizeAdvisorNominalKey('Válé')).toBe('vale');
    expect(normalizeAdvisorNominalKey('Bradesco Seguros')).toBe('bradesco seguros');
    expect(normalizeAdvisorNominalKey('Bradesco')).not.toBe(
      normalizeAdvisorNominalKey('Bradesco Seguros'),
    );
    expect(tokenizeAdvisorNominalText('Convênios')).toEqual(['convenio']);
  });

  it('identifica party estruturado e description; preserva UNKNOWN', () => {
    expect(
      identifyAdvisorNominalDimension({
        partyId: 'p1',
        partyName: 'Bradesco Seguros',
        description: 'Bradesco',
      }),
    ).toMatchObject({
      status: 'IDENTIFIED',
      sourceKind: 'STRUCTURED_PARTY',
      displayName: 'Bradesco Seguros',
    });
    expect(
      identifyAdvisorNominalDimension({
        partyId: null,
        partyName: null,
        description: 'VALE - Bruto',
      }),
    ).toMatchObject({
      status: 'IDENTIFIED',
      sourceKind: 'NORMALIZED_DESCRIPTION',
      normalizedKey: 'vale',
      displayName: 'VALE',
    });
    expect(
      identifyAdvisorNominalDimension({
        partyId: null,
        partyName: null,
        description: 'Recebimento convênio',
      }).status,
    ).toBe('UNKNOWN');
  });

  it('resolve categoria por key, nome exato ou token único; ambígua não escolhe', () => {
    const catalog = [
      { key: 'cat-conv', name: 'Atendimentos Convênio', type: 'REVENUE' },
      { key: 'cat-part', name: 'Atendimentos Particulares', type: 'REVENUE' },
      { key: 'cat-exp', name: 'Convênio interno', type: 'EXPENSE' },
    ];
    expect(resolveAdvisorOfficialCategory('cat-conv', catalog).status).toBe('RESOLVED');
    expect(resolveAdvisorOfficialCategory('Atendimentos Convênio', catalog)).toMatchObject({
      status: 'RESOLVED',
      category: { key: 'cat-conv' },
    });
    expect(resolveAdvisorOfficialCategory('convenio', catalog)).toMatchObject({
      status: 'RESOLVED',
      category: { key: 'cat-conv' },
    });
    expect(
      resolveAdvisorOfficialCategory('atendimentos', catalog).status,
    ).toBe('AMBIGUOUS');
    expect(resolveAdvisorOfficialCategory('inexistente', catalog).status).toBe('NOT_FOUND');
  });

  it('agrega população completa, coverage e ranking determinístico', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({ id: '1', amount: '80', partyId: 'p-brad', partyName: 'Bradesco Seguros', description: 'Bradesco' }),
        item({ id: '2', amount: '20', partyId: 'p-brad', partyName: 'Bradesco Seguros', description: 'Bradesco' }),
        item({ id: '3', amount: '50', description: 'VALE - Bruto' }),
        item({ id: '4', amount: '10', description: 'Recebimento convênio' }),
        item({ id: '5', amount: '5', description: 'Unimed' }),
        item({ id: '6', amount: '5', description: 'Unimed Fesp' }),
      ]),
    });
    expect(aggregation.coverage.totalPopulationCount).toBe(6);
    expect(aggregation.coverage.totalPopulationAmount.toString()).toBe('170');
    expect(aggregation.coverage.identifiedAmount.toString()).toBe('160');
    expect(aggregation.coverage.unknownAmount.toString()).toBe('10');
    expect(aggregation.coverage.ambiguousAmount.toString()).toBe('0');
    expect(aggregation.groups[0]?.displayName).toBe('Bradesco Seguros');
    expect(aggregation.groups[0]?.amount.toString()).toBe('100');
    expect(aggregation.groups[0]?.movementCount).toBe(2);
    expect(aggregation.groups.find((group) => group.normalizedKey === 'unimed')).toBeDefined();
    expect(aggregation.groups.find((group) => group.normalizedKey === 'unimed fesp')).toBeDefined();
    const ranked = rankAdvisorNominalDimension(aggregation, 2);
    expect(ranked.ranking).toHaveLength(2);
    expect(ranked.hasMore).toBe(true);
    expect(ranked.ranking[0]?.shareOfIdentified?.toString()).toBe('62.5');
    expect(resolveConclusionSafety({
      identifiedPercent: dec('94.117647058823529412'),
      unknownCount: 1,
      ambiguousCount: 0,
      identifiedCount: 5,
      totalCount: 6,
    })).toBe('PARTIAL');
    expect(resolveConclusionSafety({
      identifiedPercent: dec('100'),
      unknownCount: 0,
      ambiguousCount: 0,
      identifiedCount: 2,
      totalCount: 2,
    })).toBe('COMPLETE');
    expect(resolveConclusionSafety({
      identifiedPercent: dec('50'),
      unknownCount: 2,
      ambiguousCount: 0,
      identifiedCount: 1,
      totalCount: 2,
    })).toBe('INSUFFICIENT');
  });

  it('lookup exact, múltiplos movimentos, NOT_FOUND e AMBIGUOUS', () => {
    const aggregation = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({ id: '1', amount: '40', description: 'VALE' }),
        item({ id: '2', amount: '10', description: 'VALE - Bruto' }),
        item({ id: '3', amount: '30', partyId: 'p-brad', partyName: 'Bradesco Seguros' }),
        item({ id: '4', amount: '5', description: 'Bradesco' }),
      ]),
    });
    expect(lookupAdvisorNominalEntity(aggregation, 'vale').matches[0]?.amount.toString()).toBe('50');
    expect(lookupAdvisorNominalEntity(aggregation, 'bradesco').status).toBe('OK');
    expect(lookupAdvisorNominalEntity(aggregation, 'inexistente').status).toBe('NOT_FOUND');
    expect(lookupAdvisorNominalEntity(aggregation, 'Vale e Bradesco').status).toBe('AMBIGUOUS');
  });

  it('compara dois períodos com delta e denominador zero', () => {
    const periodA = aggregateAdvisorNominalDimension({
      monthKey: '2026-07',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([item({ id: '1', amount: '40', description: 'VALE' })]),
    });
    const periodB = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([
        item({ id: '2', amount: '100', description: 'VALE' }),
        item({ id: '3', amount: '10', description: 'Unimed' }),
      ]),
    });
    const compared = compareAdvisorNominalAggregations({
      periodA,
      periodB,
      entityQuery: 'vale',
    });
    expect(compared.items[0]?.deltaAmount.toString()).toBe('60');
    expect(compared.items[0]?.deltaPercent?.toString()).toBe('150');
    const onlyB = compareAdvisorNominalAggregations({
      periodA: aggregateAdvisorNominalDimension({
        monthKey: '2026-07',
        categoryKey: 'cat-conv',
        categoryName: 'Atendimentos Convênio',
        details: details([]),
      }),
      periodB,
      entityQuery: 'unimed',
    });
    expect(onlyB.items[0]?.amountA.toString()).toBe('0');
    expect(onlyB.items[0]?.deltaPercent).toBeNull();
  });

  it('fact contract e PLATFORM da disciplina nominal', () => {
    const serialized = serializeAdvisorNominalRanking({
      status: 'OK',
      aggregation: aggregateAdvisorNominalDimension({
        monthKey: '2026-08',
        categoryKey: 'cat-conv',
        categoryName: 'Atendimentos Convênio',
        details: details([item({ id: '1', amount: '10', description: 'VALE' })]),
      }),
      ranking: rankAdvisorNominalDimension(
        aggregateAdvisorNominalDimension({
          monthKey: '2026-08',
          categoryKey: 'cat-conv',
          categoryName: 'Atendimentos Convênio',
          details: details([item({ id: '1', amount: '10', description: 'VALE' })]),
        }),
        5,
      ),
    });
    expect(serialized.factKind).toBe(ADVISOR_NOMINAL_RANKING_FACT_KIND);
    expect(serialized.doesNotProve).toEqual(expect.arrayContaining([...ADVISOR_NOMINAL_DOES_NOT_PROVE]));
    expect(serialized.populationComplete).toBe(true);
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('população COMPLETA');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('Maior entrada realizada ≠ convênio mais rentável');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('Coverage é obrigatória');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('cash_nominal_dimension_ranking');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO some movimentos');
  });

  it('intent nominal não rouba Top N da D2', () => {
    expect(resolveAdvisorNominalIntent('Me mostre os 10 maiores recebimentos de julho.')).toBeNull();
    expect(resolveAdvisorNominalIntent('Compare julho e agosto', { comparison: true })).toBeNull();
    expect(resolveAdvisorNominalIntent('Qual convênio individual mais faturou em agosto de 2026?')).toMatchObject({
      toolName: CASH_NOMINAL_RANKING_TOOL_NAME,
      categoryReference: 'convenio',
    });
    expect(resolveAdvisorNominalIntent('Quanto recebi da Vale em agosto?')).toMatchObject({
      toolName: CASH_NOMINAL_LOOKUP_TOOL_NAME,
      entityQuery: 'Vale',
    });
    expect(
      resolveAdvisorNominalIntent('Quanto a Vale cresceu de julho para agosto?', { comparison: true }),
    ).toMatchObject({
      toolName: COMPARE_CASH_NOMINAL_TOOL_NAME,
      entityQuery: 'Vale',
    });
  });

  it('tools rejeitam tenantId, SQL e categoryKey cru', () => {
    expect(() =>
      assertCashNominalRankingArgs({
        monthKey: '2026-08',
        categoryReference: 'convenio',
        tenantId: 'x',
      }),
    ).toThrow(AdvisorDomainError);
    expect(() =>
      assertCashNominalLookupArgs({
        monthKey: '2026-08',
        entityQuery: 'Vale',
        sql: 'select 1',
      }),
    ).toThrow(AdvisorDomainError);
    expect(() =>
      assertCashNominalRankingArgs({
        monthKey: '2026-08',
        categoryKey: 'cat-conv',
      }),
    ).toThrow(AdvisorDomainError);
    expect(() =>
      assertCashNominalRankingArgs({
        monthKey: '2026-99',
        categoryReference: 'convenio',
      }),
    ).toThrow(AdvisorDomainError);
  });

  it('executor isola tenant e desconhece tool estranha', async () => {
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: {
        async compare() {
          throw new Error('não');
        },
      },
      cashNominal: {
        async rank(input) {
          expect(input.tenantId).toBe('tenant-a');
          return { status: 'OK', ranking: [], coverage: { amountPercent: '100' } };
        },
        async lookup() {
          return { status: 'NOT_FOUND' };
        },
        async compare() {
          return { status: 'OK', items: [] };
        },
      },
    });
    const ok = await executor.execute({
      tenantId: 'tenant-a',
      resolvedMonthKey: '2026-08',
      call: {
        id: '1',
        name: CASH_NOMINAL_RANKING_TOOL_NAME,
        arguments: { monthKey: '2026-07', categoryReference: 'convenio' },
      },
    });
    expect(ok.ok).toBe(true);
    expect(ok.monthKey).toBe('2026-08');
    const unknown = await executor.execute({
      tenantId: 'tenant-a',
      call: { id: '2', name: 'drop_table', arguments: {} },
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.content).toContain('UNAVAILABLE');
  });
});
