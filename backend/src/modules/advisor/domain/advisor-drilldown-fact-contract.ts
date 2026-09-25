/**
 * Contrato factual estruturado do drill-down (F13.8.1D2.2).
 * Viaja no tool result e, portanto, também na pré-carga PERIOD_DRILLDOWN.
 */

export const ADVISOR_BREAKDOWN_FACT_KIND = 'REALIZED_CASH_CATEGORY_RANKING';
export const ADVISOR_MOVEMENT_FACT_KIND = 'TOP_N_INDIVIDUAL_CASH_MOVEMENTS';

export const ADVISOR_BREAKDOWN_PROVES = [
  'REALIZED_CATEGORY_RANKING',
  'CATEGORY_AMOUNT',
  'CATEGORY_SHARE_PERCENT',
  'CATEGORY_RANK',
] as const;

export const ADVISOR_BREAKDOWN_DOES_NOT_PROVE = [
  'FIXED_VARIABLE_COST_CLASSIFICATION',
  'SECTOR_BENCHMARK',
  'NORMALITY',
  'EFFICIENCY',
  'OPTIMIZATION_NEED',
  'CAUSALITY',
  'PARTY_RANKING',
  'CONVENIO_RANKING',
  'SUPPLIER_RANKING',
  'RECOMMENDATION',
] as const;

export const ADVISOR_MOVEMENT_PROVES = [
  'INDIVIDUAL_MOVEMENT_WINDOW',
  'MOVEMENT_AMOUNT',
  'MOVEMENT_DATE',
  'MOVEMENT_DESCRIPTION',
  'MOVEMENT_PARTY_NAME_IF_PRESENT',
  'MOVEMENT_CATEGORY_NAMES_IF_PRESENT',
  'MOVEMENT_COST_CENTER_NAMES_IF_PRESENT',
  'REQUESTED_TOP_N_ORDER',
] as const;

export const ADVISOR_MOVEMENT_DOES_NOT_PROVE = [
  'PARTY_AGGREGATE_RANKING',
  'CLIENT_AGGREGATE_RANKING',
  'CONVENIO_AGGREGATE_RANKING',
  'SUPPLIER_AGGREGATE_RANKING',
  'ENTITY_MONTH_SHARE',
  'CAUSALITY',
  'ACCOUNTING_CLASSIFICATION',
  'SECTOR_BENCHMARK',
  'RECOMMENDATION',
] as const;

export function advisorBreakdownFactContract(): Record<string, unknown> {
  return {
    factKind: ADVISOR_BREAKDOWN_FACT_KIND,
    scope: 'PERIOD',
    proves: [...ADVISOR_BREAKDOWN_PROVES],
    doesNotProve: [...ADVISOR_BREAKDOWN_DOES_NOT_PROVE],
    categoryLabelIsNotAccountingClass: true,
    tenantSegmentIsNotBenchmark: true,
  };
}

export function advisorMovementFactContract(): Record<string, unknown> {
  return {
    factKind: ADVISOR_MOVEMENT_FACT_KIND,
    scope: 'PERIOD',
    populationComplete: false,
    proves: [...ADVISOR_MOVEMENT_PROVES],
    doesNotProve: [...ADVISOR_MOVEMENT_DOES_NOT_PROVE],
    notAPartyRanking: true,
    notAConvenioRanking: true,
    descriptionIsLineMetadata: true,
    unknownIsValidAnswer: true,
  };
}
