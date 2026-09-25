export const ADVISOR_COST_CENTER_RANKING_FACT_KIND = 'REALIZED_CASH_COST_CENTER_DIMENSION_RANKING';
export const ADVISOR_COST_CENTER_LOOKUP_FACT_KIND = 'REALIZED_CASH_COST_CENTER_DIMENSION_LOOKUP';
export const ADVISOR_COST_CENTER_COMPARE_FACT_KIND = 'REALIZED_CASH_COST_CENTER_DIMENSION_COMPARE';
export const ADVISOR_COST_CENTER_MOVEMENT_FACT_KIND = 'REALIZED_CASH_COST_CENTER_MOVEMENT_LINES';

export const ADVISOR_COST_CENTER_RANKING_PROVES = [
  'IDENTIFIED_COST_CENTER_AGGREGATION',
  'COST_CENTER_RANKING_WITHIN_PERIOD_DIRECTION',
  'COVERAGE',
  'IDENTIFIED_AMOUNTS',
  'SHARES',
  'IDENTIFIED_ENTITY_COUNT',
] as const;

export const ADVISOR_COST_CENTER_DOES_NOT_PROVE = [
  'COMPETENCE',
  'DUE_DATE',
  'CURRENT_SNAPSHOT',
  'PROFIT',
  'CAUSALITY',
  'COST_CENTER_COMPARISON',
  'COST_CENTER_MOVEMENT_LINES',
  'COST_CENTER_ANAPHORA',
  'MARGIN',
  'EBITDA',
  'SECTOR_BENCHMARK',
  'RECOMMENDATION',
  'TOTAL_GROWTH_ATTRIBUTION',
] as const;

export const ADVISOR_COST_CENTER_COMPARE_DOES_NOT_PROVE = [
  'COMPETENCE',
  'DUE_DATE',
  'CURRENT_SNAPSHOT',
  'PROFIT',
  'CAUSALITY',
  'MARGIN',
  'EBITDA',
  'SECTOR_BENCHMARK',
  'RECOMMENDATION',
  'TOTAL_GROWTH_ATTRIBUTION',
] as const;

export const ADVISOR_COST_CENTER_DENOMINATOR_DEFINITIONS = {
  populationAmount:
    'Total oficial de entradas ou saídas realizadas de caixa do mês (MonthlyCashFlow). Não é a soma dos centros.',
  identifiedAmount: 'Soma somente dos valores atribuídos com segurança a um CostCenter FETCHED.',
  unidentifiedAmount:
    'populationAmount - identifiedAmount. Inclui ausência de rateio, UNRESOLVED, ERROR e split UNAVAILABLE.',
  shareOfPopulation:
    'centerAmount / populationAmount. Participação no total oficial do mês. Usar este denominador na resposta genérica.',
  shareOfIdentified:
    'centerAmount / identifiedAmount. Somente entre valores identificados por centro. Se citar, dizer "dos valores identificados por centro".',
  coverage:
    'identifiedAmount / populationAmount. Quanto do caixa realizado pôde ser atribuído a centros. NÃO é share do vencedor.',
} as const;

export function advisorCostCenterRankingFactContract(): Record<string, unknown> {
  return {
    factKind: ADVISOR_COST_CENTER_RANKING_FACT_KIND,
    scope: 'PERIOD',
    populationComplete: true,
    proves: [...ADVISOR_COST_CENTER_RANKING_PROVES],
    doesNotProve: [...ADVISOR_COST_CENTER_DOES_NOT_PROVE],
    rankingContainsOnlyIdentified: true,
    requestedLimitIsNotEntityCount: true,
    preferredShareForGenericQuestion: 'shareOfPopulation',
    unidentifiedIsNotAmbiguous: true,
    denominators: { ...ADVISOR_COST_CENTER_DENOMINATOR_DEFINITIONS },
  };
}

export function advisorCostCenterCompareFactContract(): Record<string, unknown> {
  return {
    factKind: ADVISOR_COST_CENTER_COMPARE_FACT_KIND,
    scope: 'PERIOD_COMPARISON',
    populationComplete: true,
    proves: [
      'IDENTIFIED_COST_CENTER_PERIOD_COMPARISON',
      'IDENTIFIED_AMOUNTS',
      'SHARES',
      'COVERAGE',
      'ABSOLUTE_DELTA',
      'PERCENTAGE_DELTA',
    ],
    doesNotProve: [...ADVISOR_COST_CENTER_COMPARE_DOES_NOT_PROVE],
    preferredShareForGenericQuestion: 'shareOfPopulation',
    unidentifiedIsNotAmbiguous: true,
    zeroIsNotNotFound: true,
    denominators: { ...ADVISOR_COST_CENTER_DENOMINATOR_DEFINITIONS },
  };
}

export function advisorCostCenterMovementFactContract(): Record<string, unknown> {
  return {
    factKind: ADVISOR_COST_CENTER_MOVEMENT_FACT_KIND,
    scope: 'PERIOD',
    populationComplete: true,
    proves: [
      'ATTRIBUTED_COST_CENTER_MOVEMENT_LINES',
      'IDENTIFIED_COST_CENTER_AGGREGATE',
      'COVERAGE',
    ],
    doesNotProve: [
      ...ADVISOR_COST_CENTER_COMPARE_DOES_NOT_PROVE,
      'COST_CENTER_COMPARISON',
    ],
    topNIsNotTotal: true,
    movementPopulationIsCenterAmount: true,
    preferredShareForGenericQuestion: 'shareOfPopulation',
    unidentifiedIsNotAmbiguous: true,
    denominators: { ...ADVISOR_COST_CENTER_DENOMINATOR_DEFINITIONS },
  };
}

export function advisorCostCenterLookupFactContract(): Record<string, unknown> {
  return {
    factKind: ADVISOR_COST_CENTER_LOOKUP_FACT_KIND,
    scope: 'PERIOD',
    populationComplete: true,
    proves: ['IDENTIFIED_COST_CENTER_AGGREGATE', 'COVERAGE', 'SHARES'],
    doesNotProve: [...ADVISOR_COST_CENTER_DOES_NOT_PROVE],
    preferredShareForGenericQuestion: 'shareOfPopulation',
    unidentifiedIsNotAmbiguous: true,
    denominators: { ...ADVISOR_COST_CENTER_DENOMINATOR_DEFINITIONS },
  };
}
