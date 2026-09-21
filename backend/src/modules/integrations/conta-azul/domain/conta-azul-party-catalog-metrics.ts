/**
 * Métricas do sync de catálogo de pessoas / parties (Correção 11-D).
 * Incremental NÃO produz estes eventos de ausência; só o snapshot completo.
 */

export type PartyCatalogUpsertCounters = {
  readonly created: number;
  readonly updated: number;
  readonly reactivated: number;
  readonly inactivatedByUpstream: number;
  readonly alreadyInactive: number;
};

export type PartyCatalogSkipReason =
  | 'empty_snapshot'
  | 'pagination_inconsistent'
  | 'max_pages'
  | 'page_error'
  | 'invalid_payload'
  | 'conflicting_duplicates'
  | null;

export type PartyCatalogReconcileCounters = {
  readonly pagesFetched: number;
  readonly rawItems: number;
  readonly uniqueItems: number;
  readonly upstreamActive: number;
  readonly upstreamInactive: number;
  readonly duplicateItems: number;
  readonly duplicateExternalIds: number;
  readonly conflictingDuplicateExternalIds: number;
  readonly created: number;
  readonly updated: number;
  readonly reactivated: number;
  readonly inactivatedByUpstream: number;
  readonly inactivatedByAbsence: number;
  readonly alreadyInactive: number;
  readonly snapshotComplete: boolean;
  readonly absenceReconcileApplied: boolean;
  readonly reconcileSkipped: boolean;
  readonly skipReason: PartyCatalogSkipReason;
};

export function emptyPartyCatalogUpsertCounters(): PartyCatalogUpsertCounters {
  return {
    created: 0,
    updated: 0,
    reactivated: 0,
    inactivatedByUpstream: 0,
    alreadyInactive: 0,
  };
}

export function mergePartyCatalogUpsertCounters(
  left: PartyCatalogUpsertCounters,
  right: PartyCatalogUpsertCounters,
): PartyCatalogUpsertCounters {
  return {
    created: left.created + right.created,
    updated: left.updated + right.updated,
    reactivated: left.reactivated + right.reactivated,
    inactivatedByUpstream: left.inactivatedByUpstream + right.inactivatedByUpstream,
    alreadyInactive: left.alreadyInactive + right.alreadyInactive,
  };
}
