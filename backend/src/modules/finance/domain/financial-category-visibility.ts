/**
 * 11-C — modo de visibilidade do seletor de categorias financeiras.
 *
 * - historical: active ∨ categoria (integrationId, externalId) usada no período
 *   via categoryExternalIds em AR/AP (competence, due ou settlement cash)
 * - active_only: somente active=true
 */
export type FinancialCategoryVisibilityMode = 'historical' | 'active_only';

export type FinancialCategoryListVisibilityOptions = {
  readonly visibility: FinancialCategoryVisibilityMode;
};
