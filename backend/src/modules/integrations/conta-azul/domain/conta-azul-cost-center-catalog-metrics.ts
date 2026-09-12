/**
 * Métricas do sync de catálogo de centros de custo (Correção 11-A).
 * Contadores só refletem operações observáveis no upsert/reconcile.
 */

export type CostCenterCatalogUpsertCounters = {
  readonly created: number;
  readonly updated: number;
  readonly reactivated: number;
  readonly inactivatedByUpstream: number;
  readonly alreadyInactive: number;
};

export type CostCenterCatalogReconcileCounters = {
  readonly fetched: number;
  readonly created: number;
  readonly updated: number;
  readonly reactivated: number;
  readonly inactivatedByUpstream: number;
  readonly inactivatedByAbsence: number;
  readonly alreadyInactive: number;
  readonly reconcileExecuted: boolean;
  readonly reconcileSkipped: boolean;
  readonly activeUpstream: number;
  readonly inactiveUpstream: number;
};

export function emptyCostCenterCatalogUpsertCounters(): CostCenterCatalogUpsertCounters {
  return {
    created: 0,
    updated: 0,
    reactivated: 0,
    inactivatedByUpstream: 0,
    alreadyInactive: 0,
  };
}

export function mergeCostCenterCatalogUpsertCounters(
  left: CostCenterCatalogUpsertCounters,
  right: CostCenterCatalogUpsertCounters,
): CostCenterCatalogUpsertCounters {
  return {
    created: left.created + right.created,
    updated: left.updated + right.updated,
    reactivated: left.reactivated + right.reactivated,
    inactivatedByUpstream: left.inactivatedByUpstream + right.inactivatedByUpstream,
    alreadyInactive: left.alreadyInactive + right.alreadyInactive,
  };
}
