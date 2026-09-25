export const ADVISOR_NOMINAL_RANKING_FACT_KIND = 'REALIZED_CASH_NOMINAL_DIMENSION_RANKING';
export const ADVISOR_NOMINAL_LOOKUP_FACT_KIND = 'REALIZED_CASH_NOMINAL_DIMENSION_LOOKUP';
export const ADVISOR_NOMINAL_COMPARE_FACT_KIND = 'REALIZED_CASH_NOMINAL_DIMENSION_COMPARISON';

export const ADVISOR_NOMINAL_RANKING_PROVES = [
  'IDENTIFIED_NOMINAL_AGGREGATION',
  'NOMINAL_RANKING_WITHIN_CATEGORY_PERIOD',
  'COVERAGE',
  'IDENTIFIED_AMOUNTS',
  'SHARES',
  'MOVEMENT_COUNTS',
] as const;

export const ADVISOR_NOMINAL_DOES_NOT_PROVE = [
  'COMPETENCE',
  'PROFIT',
  'CAUSALITY',
  'CONVENIO_QUALITY',
  'CONVENIO_PROFITABILITY',
  'PATIENT_COUNT',
  'MARGIN',
  'SECTOR_BENCHMARK',
  'COMMERCIAL_CONTRACT',
  'SATISFACTION',
  'VARIATION_REASON',
  'RECOMMENDATION',
] as const;

export function advisorNominalRankingFactContract(): Record<string, unknown> {
  return {
    factKind: ADVISOR_NOMINAL_RANKING_FACT_KIND,
    scope: 'PERIOD',
    direction: 'INFLOW',
    cashMeaning: 'ENTRADAS_REALIZADAS_DE_CAIXA',
    populationComplete: true,
    proves: [...ADVISOR_NOMINAL_RANKING_PROVES],
    doesNotProve: [...ADVISOR_NOMINAL_DOES_NOT_PROVE],
    topNIndividualMovementsAreNotThisFact: true,
    tenantSegmentIsNotBenchmark: true,
  };
}

export function advisorNominalLookupFactContract(): Record<string, unknown> {
  return {
    factKind: ADVISOR_NOMINAL_LOOKUP_FACT_KIND,
    scope: 'PERIOD',
    direction: 'INFLOW',
    cashMeaning: 'ENTRADAS_REALIZADAS_DE_CAIXA',
    populationComplete: true,
    proves: ['IDENTIFIED_ENTITY_AGGREGATE', 'COVERAGE', 'SHARES', 'MOVEMENT_COUNTS'],
    doesNotProve: [...ADVISOR_NOMINAL_DOES_NOT_PROVE],
    usesCompleteEntityAggregate: true,
    topNIndividualMovementsAreNotThisFact: true,
  };
}

export function advisorNominalCompareFactContract(): Record<string, unknown> {
  return {
    factKind: ADVISOR_NOMINAL_COMPARE_FACT_KIND,
    scope: 'COMPARISON',
    direction: 'INFLOW',
    cashMeaning: 'ENTRADAS_REALIZADAS_DE_CAIXA',
    proves: ['PERIOD_A_AMOUNT', 'PERIOD_B_AMOUNT', 'DELTA_AMOUNT', 'DELTA_PERCENT_WHEN_APPLICABLE'],
    doesNotProve: [...ADVISOR_NOMINAL_DOES_NOT_PROVE],
    alignedBySameNormalizer: true,
  };
}
