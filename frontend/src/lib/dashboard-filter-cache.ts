import type { DashboardSituation } from './dashboard-situation';

/**
 * Cache de sessão para filtros da Home (mês × centro × situação × categoria).
 * Evita flash ao voltar para uma visão já consultada (CC1.3.1).
 * Sem TTL de produto — invalidação = nova resposta de rede.
 * Ausente = string vazia, chave determinística.
 */

export function dashboardOverviewCacheKey(
  tenantId: string,
  costCenterId: string | null,
): string {
  return `${tenantId}|${costCenterId ?? ''}`;
}

export function dashboardFilterCacheKey(
  tenantId: string,
  monthKey: string,
  costCenterId: string | null,
  situation: DashboardSituation | null = null,
  categoryId: string | null = null,
): string {
  return `${tenantId}|${monthKey}|${costCenterId ?? ''}|${situation ?? ''}|${categoryId ?? ''}`;
}

/** Forecast / pressão: category distingue; situation não entra (não altera semântica). */
export function dashboardCashWindowCacheKey(
  tenantId: string,
  costCenterId: string | null,
  categoryId: string | null = null,
): string {
  return `${tenantId}|${costCenterId ?? ''}|${categoryId ?? ''}`;
}

/**
 * MonthlyCashFlow (CASH-3B): month × centro × categoria.
 * situation NÃO entra — o realizado histórico não é filtrado por situação.
 */
export function dashboardCashFlowCacheKey(
  tenantId: string,
  monthKey: string,
  costCenterId: string | null,
  categoryId: string | null = null,
): string {
  return `${tenantId}|${monthKey}|${costCenterId ?? ''}|${categoryId ?? ''}`;
}

/**
 * Cash-movement-history (Correção 08-B): mesma chave que MonthlyCashFlow
 * (tenant × month × centro × categoria; situation não entra).
 */
export const dashboardCashMovementHistoryCacheKey = dashboardCashFlowCacheKey;

/** Previsto multi-mês: tenant × âncora × horizon × centro × categoria. */
export function dashboardCashExpectedHorizonCacheKey(
  tenantId: string,
  monthKey: string,
  horizon: 3 | 6 | 12,
  costCenterId: string | null,
  categoryId: string | null = null,
): string {
  return `${tenantId}|${monthKey}|${horizon}|${costCenterId ?? ''}|${categoryId ?? ''}`;
}

/**
 * Cash-balance-history (Correção 08-C): tenant × month.
 * Category/CC não entram — endpoint rejeita esses filtros; UI só oculta a linha.
 */
export function dashboardCashBalanceHistoryCacheKey(
  tenantId: string,
  monthKey: string,
): string {
  return `${tenantId}|${monthKey}`;
}

export function createDashboardFilterCache<T>() {
  const map = new Map<string, T>();
  return {
    get(key: string): T | undefined {
      return map.get(key);
    },
    set(key: string, value: T): void {
      map.set(key, value);
    },
    clear(): void {
      map.clear();
    },
    has(key: string): boolean {
      return map.has(key);
    },
  };
}
