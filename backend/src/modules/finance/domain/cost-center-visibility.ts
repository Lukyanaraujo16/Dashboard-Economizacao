/**
 * 11-A.1 — modo de visibilidade do seletor de centros de custo.
 *
 * - historical: active ∨ competence ∨ due ∨ settlement.occurredOn no período
 *   (mês passado no Dashboard; sempre em Relatórios)
 * - active_only: somente active=true
 *   (mês atual ou futuro no Dashboard)
 */
export type CostCenterVisibilityMode = 'historical' | 'active_only';

export type CostCenterListVisibilityOptions = {
  readonly visibility: CostCenterVisibilityMode;
};
