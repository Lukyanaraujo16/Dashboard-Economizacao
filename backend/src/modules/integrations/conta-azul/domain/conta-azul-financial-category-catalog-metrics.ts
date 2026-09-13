/**
 * Métricas do sync de catálogo de categorias financeiras (Correção 11-C).
 * Lifecycle só por presença/ausência — API não expõe ativo/status.
 */

export type FinancialCategoryCatalogUpsertCounters = {
  readonly created: number;
  readonly updated: number;
  readonly reactivated: number;
  readonly alreadyInactive: number;
};

export type FinancialCategoryCatalogSkipReason =
  | 'empty_snapshot'
  | 'pagination_inconsistent'
  | 'max_pages'
  | 'page_error'
  | 'invalid_payload'
  | null;

export type FinancialCategoryCatalogReconcileCounters = {
  readonly fetched: number;
  readonly created: number;
  readonly updated: number;
  readonly reactivated: number;
  readonly inactivatedByAbsence: number;
  readonly alreadyInactive: number;
  readonly pageCount: number;
  readonly emptySnapshot: boolean;
  readonly reconcileExecuted: boolean;
  readonly reconcileSkipped: boolean;
  readonly skipReason: FinancialCategoryCatalogSkipReason;
};

export function emptyFinancialCategoryCatalogUpsertCounters(): FinancialCategoryCatalogUpsertCounters {
  return {
    created: 0,
    updated: 0,
    reactivated: 0,
    alreadyInactive: 0,
  };
}

export function mergeFinancialCategoryCatalogUpsertCounters(
  left: FinancialCategoryCatalogUpsertCounters,
  right: FinancialCategoryCatalogUpsertCounters,
): FinancialCategoryCatalogUpsertCounters {
  return {
    created: left.created + right.created,
    updated: left.updated + right.updated,
    reactivated: left.reactivated + right.reactivated,
    alreadyInactive: left.alreadyInactive + right.alreadyInactive,
  };
}
