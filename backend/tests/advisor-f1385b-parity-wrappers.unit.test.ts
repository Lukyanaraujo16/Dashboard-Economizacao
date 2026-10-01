import { describe, expect, it } from 'vitest';

import {
  ANALYTICAL_CAPABILITY_REGISTRY,
  ANALYTICAL_EXECUTOR_KEYS,
  buildCashMovementLinesQuery,
  buildCashRealizedBreakdownQuery,
  buildCompareCashMonthsQuery,
  buildCostCenterRankingQuery,
  buildCurrentSnapshotQuery,
  buildFinancialFactsMonthQuery,
  buildNominalLookupQuery,
  buildNominalRankingQuery,
  canonicalRatioToLegacyPercentString,
  executeAnalyticalQuery,
  getAnalyticalExecutor,
  legacyPercentToCanonicalRatio,
  listAnalyticalCapabilities,
  listAnalyticalExecutorKeys,
  roundtripLegacyCoveragePercent,
  toLegacyAnalyticalFact,
  validateAnalyticalCapability,
  wrapLegacyAnalyticalResult,
} from '../src/modules/advisor/domain/analytical/index.js';
import { buildFinancialFactsContent } from '../src/modules/advisor/domain/financial-facts-text.js';
import { serializeAdvisorCurrentSnapshotFacts } from '../src/modules/advisor/domain/advisor-current-snapshot-facts.js';
import {
  buildFinancialFactsViaUniversal,
  serializeCurrentSnapshotViaUniversal,
} from '../src/modules/advisor/domain/analytical/preload-analytical-parity.js';
import type { FinancialStockSnapshot } from '../src/modules/analytics/domain/types.js';
import { Prisma } from '../src/generated/prisma/client.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

describe('F13.8.5B coverage conversion', () => {
  it('converte percent legado ↔ ratio canônico com roundtrip', () => {
    expect(legacyPercentToCanonicalRatio('94.89')).toBeCloseTo(0.9489, 10);
    expect(canonicalRatioToLegacyPercentString(0.9489)).toBe('94.89');
    expect(roundtripLegacyCoveragePercent('94.89')).toBe('94.89');
    expect(roundtripLegacyCoveragePercent('100')).toBe('100');
    expect(roundtripLegacyCoveragePercent('0')).toBe('0');
    expect(legacyPercentToCanonicalRatio('NOT_APPLICABLE')).toBeNull();
    expect(legacyPercentToCanonicalRatio(null)).toBeNull();
  });

  it('rejeita ratio fora de [0,1]', () => {
    expect(() => legacyPercentToCanonicalRatio('101')).toThrow();
    expect(() => canonicalRatioToLegacyPercentString(1.01)).toThrow();
  });
});

describe('F13.8.5B executor registry', () => {
  it('registra exatamente os executorKeys das capabilities e deny-by-default', () => {
    const fromCaps = new Set(
      listAnalyticalCapabilities().map((capability) => capability.executorKey),
    );
    const registered = new Set(listAnalyticalExecutorKeys());
    for (const key of fromCaps) {
      expect(registered.has(key)).toBe(true);
      expect(getAnalyticalExecutor(key)).toBeTypeOf('function');
    }
    for (const key of ANALYTICAL_EXECUTOR_KEYS) {
      expect(getAnalyticalExecutor(key)).toBeDefined();
    }
  });

  it('continua negando capabilities futuras', () => {
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'OUTFLOW',
        period: {
          kind: 'YEAR',
          year: 2025,
          rangeKey: '2025',
          isPartialYear: false,
        },
        dimension: 'COUNTERPARTY',
        operation: 'RANKING_WINNER',
        limit: 1,
        filters: { categoryReference: 'x', partyProfile: 'SUPPLIER' },
      }).ok,
    ).toBe(false);
  });

  it('publica 31 capabilities, com TOPN, lookup, share e planejamento mensal', () => {
    expect(ANALYTICAL_CAPABILITY_REGISTRY).toHaveLength(31);
    expect(
      ANALYTICAL_CAPABILITY_REGISTRY.some((capability) => capability.key === 'revenue_goal.value.month'),
    ).toBe(true);
    expect(
      ANALYTICAL_CAPABILITY_REGISTRY.some(
        (capability) => capability.key === 'expense_ceiling.value.month',
      ),
    ).toBe(true);
    expect(
      ANALYTICAL_CAPABILITY_REGISTRY.some(
        (capability) => capability.key === 'realized_cash.counterparty.inflow.customer.ranking_winner',
      ),
    ).toBe(true);
    expect(
      ANALYTICAL_CAPABILITY_REGISTRY.some(
        (capability) => capability.key === 'realized_cash.counterparty.outflow.supplier.ranking_winner',
      ),
    ).toBe(true);
    const compare = ANALYTICAL_CAPABILITY_REGISTRY.find(
      (c) => c.key === 'realized_cash.counterparty.inflow.compare.month_pair',
    );
    expect(compare?.identityRequired).toBe(false);
    expect(compare?.maxLimit).toBe(20);
  });
});

describe('F13.8.5B query builders → capability allow', () => {
  it('builders publicados validam', () => {
    const cases = [
      buildCompareCashMonthsQuery({
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
      }),
      buildCashRealizedBreakdownQuery({
        monthKey: '2026-08',
        direction: 'INFLOW',
        limit: 5,
      }),
      buildCashMovementLinesQuery({
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        limit: 10,
      }),
      buildNominalRankingQuery({
        monthKey: '2026-08',
        categoryReference: 'Atendimentos Convenio',
        limit: 1,
      }),
      buildNominalRankingQuery({
        periodKind: 'YEAR',
        year: 2025,
        categoryReference: 'Atendimentos Convenio',
        limit: 5,
      }),
      buildNominalLookupQuery({
        monthKey: '2026-08',
        categoryReference: 'Atendimentos Convenio',
        entityQuery: 'Unimed',
      }),
      buildCostCenterRankingQuery({
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        limit: 5,
      }),
      buildCurrentSnapshotQuery(),
      buildFinancialFactsMonthQuery({ monthKey: '2026-08' }),
    ];
    for (const query of cases) {
      const result = validateAnalyticalCapability(query);
      expect(result.ok, JSON.stringify({ query, result })).toBe(true);
    }
  });
});

describe('F13.8.5B legacy fact adapter', () => {
  it('roundtrip preserva fact legado verbatim', () => {
    const legacyFact = {
      status: 'OK',
      factKind: 'REALIZED_CASH_NOMINAL_DIMENSION_RANKING',
      coverage: { amountPercent: '80', identifiedAmount: '80', populationAmount: '100' },
      ranking: [{ rank: 1, displayName: 'A', amount: '80' }],
    };
    const query = buildNominalRankingQuery({
      monthKey: '2026-08',
      categoryReference: 'cat',
      limit: 1,
    });
    const capability = listAnalyticalCapabilities().find(
      (c) => c.key === 'realized_cash.counterparty.inflow.ranking_winner',
    )!;
    const wrapped = wrapLegacyAnalyticalResult({ query, capability, legacyFact });
    expect(toLegacyAnalyticalFact(wrapped)).toEqual(legacyFact);
    expect(wrapped.status === 'PARTIAL' || wrapped.status === 'AVAILABLE').toBe(true);
  });
});

describe('F13.8.5B preload parity', () => {
  it('FINANCIAL_FACTS textual idêntico ao legado', () => {
    const input = {
      monthKey: '2026-08',
      flow: null,
      snapshot: null,
    };
    expect(buildFinancialFactsViaUniversal(input)).toBe(buildFinancialFactsContent(input));
  });

  it('snapshot facts idênticos ao legado', () => {
    const snapshot = {
      tenantId: 't1',
      today: new Date('2026-09-29T00:00:00.000Z'),
      receivables: { open: dec('10'), overdue: dec('2') },
      payables: { open: dec('5'), overdue: dec('1') },
      receivableDelinquency: {
        overdueUnpaid: dec('2'),
        openUnpaid: dec('10'),
        rate: dec('20'),
      },
    } as unknown as FinancialStockSnapshot;
    expect(serializeCurrentSnapshotViaUniversal(snapshot)).toEqual(
      serializeAdvisorCurrentSnapshotFacts(snapshot),
    );
  });
});

describe('F13.8.5B execute deny / security', () => {
  it('query sem tenant; runtime carrega tenant; executor ausente nega', async () => {
    const query = buildCompareCashMonthsQuery({
      monthKey: '2026-08',
      comparisonMonthKey: '2026-07',
    });
    expect('tenantId' in query).toBe(false);
    const outcome = await executeAnalyticalQuery({
      query,
      runtime: { tenantId: 'tenant-a' },
    });
    expect(outcome.ok).toBe(false);
    if (!outcome.ok) {
      expect(outcome.reason).toBe('EXECUTOR_DEPENDENCY_MISSING');
    }
  });
});

describe('F13.8.5B parity harness — compare_cash_months', () => {
  it('universal wrapper = serialize legado direto', async () => {
    const { createAdvisorCashComparisonService } = await import(
      '../src/modules/advisor/domain/advisor-analytical-tools.js'
    );
    const { serializeAdvisorCashMonthComparison, compareAdvisorCashMonths } = await import(
      '../src/modules/advisor/domain/compare-advisor-cash-months.js'
    );

    function flow(tenantId: string, monthKey: string, inflows: string) {
      return {
        tenantId,
        today: new Date('2026-09-24T00:00:00.000Z'),
        monthKey,
        from: new Date(`${monthKey}-01T00:00:00.000Z`),
        to: new Date(`${monthKey}-28T00:00:00.000Z`),
        costCenterCashSplit: true,
        realized: {
          inflows: dec(inflows),
          outflows: dec('0'),
          result: dec(inflows),
        },
        realizedByCategory: { inflows: null, outflows: null },
        expected: {
          receivables: dec('0'),
          payables: dec('0'),
          result: dec('0'),
        },
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

    const cashComparison = createAdvisorCashComparisonService({
      cashFlow: {
        async getMonthlyCashFlow(input) {
          return flow(
            input.tenantId,
            input.monthKey ?? '2026-09',
            input.monthKey === '2026-08' ? '224790.3' : '136659.99',
          ) as never;
        },
      },
    });

    const direct = serializeAdvisorCashMonthComparison(
      await cashComparison.compare({
        tenantId: 'tenant-a',
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
      }),
    );

    const outcome = await executeAnalyticalQuery({
      query: buildCompareCashMonthsQuery({
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
      }),
      runtime: { tenantId: 'tenant-a', cashComparison },
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.legacyFact).toEqual(direct);
      expect(toLegacyAnalyticalFact(outcome.result)).toEqual(direct);
      expect(outcome.executorKey).toBe('compareCashMonths');
      expect(outcome.capability.key).toBe('billing.compare.month_pair');
    }
    void compareAdvisorCashMonths;
  });
});
