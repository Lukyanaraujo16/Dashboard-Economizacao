import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import {
  ADVISOR_BREAKDOWN_DOES_NOT_PROVE,
  ADVISOR_BREAKDOWN_FACT_KIND,
  ADVISOR_MOVEMENT_DOES_NOT_PROVE,
  ADVISOR_MOVEMENT_FACT_KIND,
  ADVISOR_PLATFORM_INSTRUCTIONS,
  buildAnalyticalFactsContent,
  rankAdvisorCashMovementLines,
  rankAdvisorCashRealizedBreakdown,
  serializeAdvisorCashMovementLines,
  serializeAdvisorCashRealizedBreakdown,
} from '../src/modules/advisor/index.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(): MonthlyCashFlow {
  return {
    tenantId: 'tenant-a',
    today: new Date('2026-09-24T00:00:00.000Z'),
    monthKey: '2026-08',
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    costCenterCashSplit: true,
    realized: { inflows: dec('100'), outflows: dec('40'), result: dec('60') },
    realizedByCategory: {
      inflows: {
        total: dec('100'),
        classified: dec('100'),
        uncategorized: dec('0'),
        imprecise: dec('0'),
        coverageRate: dec('100'),
        items: [
          {
            kind: 'category',
            key: 'cat-convenio',
            name: 'Atendimentos Convênio',
            amount: dec('80'),
            percentage: dec('80'),
          },
        ],
      },
      outflows: null,
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
  };
}

describe('F13.8.1D2.2 contrato factual do drill-down', () => {
  it('breakdown carrega factKind, proves e doesNotProve', () => {
    const serialized = serializeAdvisorCashRealizedBreakdown(
      rankAdvisorCashRealizedBreakdown({
        flow: flow(),
        direction: 'INFLOW',
        requestedLimit: 5,
        effectiveLimit: 5,
      }),
    );
    expect(serialized.factKind).toBe(ADVISOR_BREAKDOWN_FACT_KIND);
    expect(serialized.scope).toBe('PERIOD');
    expect(serialized.proves).toEqual(expect.arrayContaining([
      'REALIZED_CATEGORY_RANKING',
      'CATEGORY_AMOUNT',
      'CATEGORY_SHARE_PERCENT',
      'CATEGORY_RANK',
    ]));
    expect(serialized.doesNotProve).toEqual(expect.arrayContaining([
      ...ADVISOR_BREAKDOWN_DOES_NOT_PROVE,
    ]));
    expect(serialized.doesNotProve).toEqual(expect.arrayContaining([
      'FIXED_VARIABLE_COST_CLASSIFICATION',
      'SECTOR_BENCHMARK',
      'CONVENIO_RANKING',
      'RECOMMENDATION',
    ]));
    expect(serialized.categoryLabelIsNotAccountingClass).toBe(true);
    expect(serialized.tenantSegmentIsNotBenchmark).toBe(true);
  });

  it('movement lines carrega janela incompleta e não ranking nominal', () => {
    const serialized = serializeAdvisorCashMovementLines(
      rankAdvisorCashMovementLines({
        monthKey: '2026-07',
        direction: 'INFLOW',
        sort: 'AMOUNT_DESC',
        requestedLimit: 10,
        effectiveLimit: 10,
        source: {
          available: true,
          items: [
            {
              date: new Date('2026-07-10T00:00:00.000Z'),
              amount: dec('90'),
              description: 'VALE',
              partyName: null,
              categoryNames: ['Atendimentos Convênio'],
              costCenterNames: [],
            },
          ],
        },
      }),
    );
    expect(serialized.factKind).toBe(ADVISOR_MOVEMENT_FACT_KIND);
    expect(serialized.populationComplete).toBe(false);
    expect(serialized.notAPartyRanking).toBe(true);
    expect(serialized.notAConvenioRanking).toBe(true);
    expect(serialized.descriptionIsLineMetadata).toBe(true);
    expect(serialized.unknownIsValidAnswer).toBe(true);
    expect(serialized.proves).toEqual(expect.arrayContaining([
      'INDIVIDUAL_MOVEMENT_WINDOW',
      'MOVEMENT_DESCRIPTION',
      'REQUESTED_TOP_N_ORDER',
    ]));
    expect(serialized.doesNotProve).toEqual(expect.arrayContaining([
      ...ADVISOR_MOVEMENT_DOES_NOT_PROVE,
    ]));
    expect(serialized.doesNotProve).toEqual(expect.arrayContaining([
      'CONVENIO_AGGREGATE_RANKING',
      'ENTITY_MONTH_SHARE',
      'ACCOUNTING_CLASSIFICATION',
    ]));
  });

  it('pré-carga PERIOD_DRILLDOWN reusa o contrato do tool result', () => {
    const result = JSON.stringify(
      serializeAdvisorCashMovementLines(
        rankAdvisorCashMovementLines({
          monthKey: '2026-07',
          direction: 'INFLOW',
          sort: 'AMOUNT_DESC',
          requestedLimit: 10,
          effectiveLimit: 10,
          source: { available: true, items: [] },
        }),
      ),
    );
    const facts = buildAnalyticalFactsContent({
      monthKey: '2026-07',
      comparison: null,
      drilldown: {
        toolName: 'cash_movement_lines',
        monthKey: '2026-07',
        ok: true,
        content: result,
      },
    });
    expect(facts).toContain('scope: PERIOD_DRILLDOWN');
    expect(facts).toContain('result.factKind');
    expect(facts).toContain(ADVISOR_MOVEMENT_FACT_KIND);
    expect(facts).toContain('Não invente subcategorias');
  });

  it('PLATFORM referencia o contrato e a disciplina objetiva', () => {
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('factKind, proves e doesNotProve');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('rótulo da categoria NÃO é classificação contábil');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO é benchmark');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('comum em clínicas');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('movimentos individuais, não um ranking agregado');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('Não invente subcategorias');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('"Não sabemos" é resposta válida');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('responda os fatos e pare');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('o que você acha?');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('Separe FATOS de INTERPRETAÇÃO');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('posso ajudar');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('10 maiores recebimentos de julho');
  });
});
