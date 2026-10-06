import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { AnalyticalEntityRecord } from './resolve-analytical-entity.js';

/**
 * Catálogo de centros ativos do tenant corrente.
 * O tenant chega do runtime. A listagem já recusa tenant vazio e não aceita filtro vindo do modelo.
 * Centro inativo fica de fora: o seletor operacional também só oferece ativos no mês corrente.
 */
export async function loadAnalyticalCostCenterCatalog(
  tenantId: string,
  costCenters: Pick<CostCenterReadRepository, 'listByTenant'>,
): Promise<readonly AnalyticalEntityRecord[]> {
  const rows = await costCenters.listByTenant(tenantId);
  return rows
    .filter((row) => row.active)
    .map((row) => ({
      id: row.id,
      dimension: 'COST_CENTER' as const,
      name: row.name,
      code: row.code,
    }));
}
