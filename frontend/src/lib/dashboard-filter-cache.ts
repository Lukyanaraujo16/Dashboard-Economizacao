import type { DashboardSituation } from './dashboard-situation';

/**
 * Cache de sessão para filtros da Home (mês × centro × situação × categoria).
 * Evita flash ao voltar para uma visão já consultada (CC1.3.1).
 * Sem TTL de produto — invalidação = nova resposta de rede.
 * Ausente = string vazia, chave determinística.
 */

export function dashboardFilterCacheKey(
  monthKey: string,
  costCenterId: string | null,
  situation: DashboardSituation | null = null,
  categoryId: string | null = null,
): string {
  return `${monthKey}|${costCenterId ?? ''}|${situation ?? ''}|${categoryId ?? ''}`;
}

/** Forecast / pressão: category distingue; situation não entra (não altera semântica). */
export function dashboardCashWindowCacheKey(
  costCenterId: string | null,
  categoryId: string | null = null,
): string {
  return `${costCenterId ?? ''}|${categoryId ?? ''}`;
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
