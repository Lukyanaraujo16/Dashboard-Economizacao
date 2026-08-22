/**
 * Cache de sessão para filtros da Home (mês × centro).
 * Evita flash ao voltar para uma visão já consultada (CC1.3.1).
 * Sem TTL de produto — invalidação = nova resposta de rede.
 */

export function dashboardFilterCacheKey(
  monthKey: string,
  costCenterId: string | null,
): string {
  return `${monthKey}|${costCenterId ?? ''}`;
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
