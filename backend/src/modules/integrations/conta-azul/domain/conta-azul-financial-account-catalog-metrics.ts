/**
 * Métricas do sync de catálogo de contas financeiras (Correção 11-B).
 * Contadores só refletem operações observáveis no upsert/reconcile.
 */

export type FinancialAccountCatalogUpsertCounters = {
  readonly created: number;
  readonly updated: number;
  readonly reactivated: number;
  readonly inactivatedByUpstream: number;
  readonly alreadyInactive: number;
};

export type FinancialAccountCatalogSkipReason =
  | 'empty_snapshot'
  | 'pagination_inconsistent'
  | 'max_pages'
  | 'page_error'
  | 'invalid_payload'
  | null;

export type FinancialAccountCatalogReconcileCounters = {
  readonly fetched: number;
  readonly created: number;
  readonly updated: number;
  readonly reactivated: number;
  readonly inactivatedByUpstream: number;
  readonly inactivatedByAbsence: number;
  readonly alreadyInactive: number;
  readonly activeUpstream: number;
  readonly inactiveUpstream: number;
  readonly pageCount: number;
  readonly emptySnapshot: boolean;
  readonly reconcileExecuted: boolean;
  readonly reconcileSkipped: boolean;
  readonly skipReason: FinancialAccountCatalogSkipReason;
};

export function emptyFinancialAccountCatalogUpsertCounters(): FinancialAccountCatalogUpsertCounters {
  return {
    created: 0,
    updated: 0,
    reactivated: 0,
    inactivatedByUpstream: 0,
    alreadyInactive: 0,
  };
}

export function mergeFinancialAccountCatalogUpsertCounters(
  left: FinancialAccountCatalogUpsertCounters,
  right: FinancialAccountCatalogUpsertCounters,
): FinancialAccountCatalogUpsertCounters {
  return {
    created: left.created + right.created,
    updated: left.updated + right.updated,
    reactivated: left.reactivated + right.reactivated,
    inactivatedByUpstream: left.inactivatedByUpstream + right.inactivatedByUpstream,
    alreadyInactive: left.alreadyInactive + right.alreadyInactive,
  };
}
