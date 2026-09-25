export const ADVISOR_NOMINAL_RANKING_FACT_KIND = 'REALIZED_CASH_NOMINAL_DIMENSION_RANKING';
export const ADVISOR_NOMINAL_LOOKUP_FACT_KIND = 'REALIZED_CASH_NOMINAL_DIMENSION_LOOKUP';
export const ADVISOR_NOMINAL_COMPARE_FACT_KIND = 'REALIZED_CASH_NOMINAL_DIMENSION_COMPARISON';

export const ADVISOR_NOMINAL_RANKING_PROVES = [
  'IDENTIFIED_NOMINAL_AGGREGATION',
  'NOMINAL_RANKING_WITHIN_CATEGORY_PERIOD',
  'COVERAGE',
  'TOP_N_SHARE',
  'IDENTIFIED_AMOUNTS',
  'SHARES',
  'MOVEMENT_COUNTS',
  'IDENTIFIED_ENTITY_COUNT',
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
  'CONCENTRATION_QUALITY',
  'OPERATIONAL_AMBIGUITY_REASON',
] as const;

/** Definições explícitas para o provider não inferir significado pelo nome do campo. */
export const ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS = {
  populationAmount:
    'Total da população financeira da categoria no período (identified + unknown + ambiguous).',
  identifiedAmount: 'Soma somente dos grupos com identityStatus=IDENTIFIED.',
  shareOfPopulation:
    'entityAmount / populationAmount. Participação em TODA a população da categoria, incluindo valor não identificado/ambíguo. NÃO rotular como total identificado.',
  shareOfIdentified:
    'entityAmount / identifiedAmount. Participação somente entre valores nominalmente IDENTIFIED. Se citar este número, dizer explicitamente "entre os valores identificados". NÃO rotular como total da categoria/população.',
  coverage:
    'identifiedAmount / populationAmount. Quanto da população pôde ser identificado nominalmente. NÃO é topN share. NÃO é shareOfIdentified.',
} as const;

export const ADVISOR_NOMINAL_CARDINALITY_DEFINITIONS = {
  requestedLimit:
    'Pedido do usuário/tool. NÃO é cardinalidade factual. requestedLimit=5 NÃO significa que existem 5 entidades.',
  returnedCount: 'Quantidade de linhas IDENTIFIED efetivamente retornadas neste ranking.',
  identifiedEntityCount: 'Cardinalidade factual de entidades IDENTIFIED na população.',
  hasMore: 'true se existem mais entidades IDENTIFIED além do returnedCount.',
} as const;

export const ADVISOR_NOMINAL_AMBIGUITY_DEFINITIONS = {
  ambiguousAmount:
    'Valor sem identificador estruturado compartilhado suficiente para confirmar a mesma entidade. NÃO somar a um grupo IDENTIFIED. NÃO inventar motivo operacional (tipos de atendimento, subcategorias, filiais, contratos, planos).',
  unknownAmount: 'Movimentos sem identidade nominal utilizável.',
  officialExplanation:
    'A identidade não pode ser comprovada porque não há identificador estruturado compartilhado. Isso não prova que são a mesma entidade nem que são entidades diferentes.',
} as const;

export const ADVISOR_NOMINAL_PREFERRED_SHARE_FOR_GENERIC_QUESTION = 'shareOfPopulation';

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
    coverageIsNotTopNShare: true,
    rankingContainsOnlyIdentified: true,
    displayNameMustNotBeInvented: true,
    tenantSegmentIsNotBenchmark: true,
    requestedLimitIsNotEntityCount: true,
    preferredShareForGenericQuestion: ADVISOR_NOMINAL_PREFERRED_SHARE_FOR_GENERIC_QUESTION,
    denominators: { ...ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS },
    cardinalityMeanings: { ...ADVISOR_NOMINAL_CARDINALITY_DEFINITIONS },
    identityCoverageMeanings: { ...ADVISOR_NOMINAL_AMBIGUITY_DEFINITIONS },
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
    preferredShareForGenericQuestion: ADVISOR_NOMINAL_PREFERRED_SHARE_FOR_GENERIC_QUESTION,
    denominators: { ...ADVISOR_NOMINAL_DENOMINATOR_DEFINITIONS },
    identityCoverageMeanings: { ...ADVISOR_NOMINAL_AMBIGUITY_DEFINITIONS },
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
