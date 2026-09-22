/**
 * 11-E.3 — validade analítica corrente de rateio de centro de custo.
 *
 * Persistência física (`InstallmentCostCenterAllocation`) pode existir para
 * histórico/diagnóstico mesmo quando o detalhe da parcela não está confirmado.
 * Leituras CURRENT/STOCK/FORECAST/competência só usam allocation quando o
 * `costCenterDetailStatus` da parcela é analiticamente confirmado.
 *
 * PARTIAL (normalizer CC1.1) persiste como `FETCHED` e permanece elegível —
 * semântica homologada preservada (rateio parcial utilizável).
 *
 * `UNRESOLVED` / `ERROR` / `UNKNOWN` / `NO_ALLOCATION` não confirmam allocation
 * corrente. `NO_ALLOCATION` tipicamente não tem rows (replace []).
 */

export const ANALYTICALLY_CONFIRMED_COST_CENTER_DETAIL_STATUSES = ['FETCHED'] as const;

export type AnalyticallyConfirmedCostCenterDetailStatus =
  (typeof ANALYTICALLY_CONFIRMED_COST_CENTER_DETAIL_STATUSES)[number];

export function isAnalyticallyConfirmedCostCenterDetailStatus(
  status: string,
): status is AnalyticallyConfirmedCostCenterDetailStatus {
  return (ANALYTICALLY_CONFIRMED_COST_CENTER_DETAIL_STATUSES as readonly string[]).includes(
    status,
  );
}
