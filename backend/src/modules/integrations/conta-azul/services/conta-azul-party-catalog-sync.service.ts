import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import {
  emptyPartyCatalogUpsertCounters,
  type PartyCatalogReconcileCounters,
  type PartyCatalogSkipReason,
  type PartyCatalogUpsertCounters,
} from '../domain/conta-azul-party-catalog-metrics.js';
import {
  mapPartyPage,
  type MappedParty,
} from '../domain/conta-azul-financial-mappers.js';
import { ContaAzulMappingError } from '../domain/conta-azul-mapping.js';
import {
  formatPayloadDiagnostic,
  type ContaAzulPayloadDiagnostic,
} from '../domain/conta-azul-payload-diagnostic.js';
import {
  CONTA_AZUL_PARTY_CATALOG_MAX_PAGES,
  CONTA_AZUL_SYNC_PAGE_SIZE,
} from '../domain/conta-azul-sync.js';
import type {
  ContaAzulFinancialRepository,
  FinancialSyncScope,
} from '../repositories/financial.repository.js';

export type ContaAzulPartyCatalogSyncService = {
  /**
   * Snapshot completo GET /v1/pessoas (sem data_alteracao_*).
   * Única fonte de evidência para reconciliação por ausência (11-D).
   */
  syncCatalog(input: {
    readonly scope: FinancialSyncScope;
    readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
    readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
    readonly heartbeat: () => Promise<void>;
  }): Promise<number>;
};

function isCatalogAbortError(error: unknown): boolean {
  if (error instanceof ContaAzulMappingError) {
    return true;
  }
  if (!(error instanceof ContaAzulApiError)) {
    return false;
  }
  return (
    error.kind === 'unauthorized' ||
    error.kind === 'rate_limited' ||
    error.kind === 'timeout' ||
    error.kind === 'invalid_response' ||
    error.kind === 'unavailable'
  );
}

function isPaginationInconsistent(input: {
  readonly pageItemCount: number;
  readonly processed: number;
  readonly totalItems: number | null;
  readonly pageSize: number;
}): boolean {
  const { pageItemCount, processed, totalItems, pageSize } = input;
  if (pageItemCount > pageSize) {
    return true;
  }
  if (totalItems === null) {
    return false;
  }
  if (totalItems < 0) {
    return true;
  }
  if (processed > totalItems) {
    return true;
  }
  return false;
}

function snapshotExhausted(input: {
  readonly pageItemCount: number;
  readonly pageSize: number;
}): boolean {
  return input.pageItemCount < input.pageSize;
}

export class ContaAzulPartyCatalogPaginationError extends ContaAzulMappingError {
  constructor(message: string) {
    super(message);
    this.name = 'ContaAzulPartyCatalogPaginationError';
  }
}

/** Equivalência lifecycle/identidade (sem logar document). */
export function partiesSemanticallyEquivalent(left: MappedParty, right: MappedParty): boolean {
  if (left.active !== right.active) {
    return false;
  }
  if (left.name !== right.name) {
    return false;
  }
  if (left.document !== right.document) {
    return false;
  }
  const leftProfiles = [...left.profiles].map(String).sort().join(',');
  const rightProfiles = [...right.profiles].map(String).sort().join(',');
  return leftProfiles === rightProfiles;
}

function logCatalogReconcile(
  input: PartyCatalogReconcileCounters & {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly durationMs: number;
  },
): void {
  process.stdout.write(
    `${JSON.stringify({
      event: 'conta_azul_party_catalog_reconcile',
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      pagesFetched: input.pagesFetched,
      rawItems: input.rawItems,
      uniqueItems: input.uniqueItems,
      upstreamActive: input.upstreamActive,
      upstreamInactive: input.upstreamInactive,
      duplicateItems: input.duplicateItems,
      duplicateExternalIds: input.duplicateExternalIds,
      conflictingDuplicateExternalIds: input.conflictingDuplicateExternalIds,
      created: input.created,
      updated: input.updated,
      reactivated: input.reactivated,
      inactivatedByUpstream: input.inactivatedByUpstream,
      inactivatedByAbsence: input.inactivatedByAbsence,
      alreadyInactive: input.alreadyInactive,
      snapshotComplete: input.snapshotComplete,
      absenceReconcileApplied: input.absenceReconcileApplied,
      reconcileSkipped: input.reconcileSkipped,
      skipReason: input.skipReason,
      durationMs: input.durationMs,
    })}\n`,
  );
}

function buildSkippedCounters(input: {
  readonly upsert: PartyCatalogUpsertCounters;
  readonly pagesFetched: number;
  readonly rawItems: number;
  readonly uniqueItems: number;
  readonly upstreamActive: number;
  readonly upstreamInactive: number;
  readonly duplicateItems: number;
  readonly duplicateExternalIds: number;
  readonly conflictingDuplicateExternalIds: number;
  readonly snapshotComplete: boolean;
  readonly skipReason: PartyCatalogSkipReason;
}): PartyCatalogReconcileCounters {
  return {
    pagesFetched: input.pagesFetched,
    rawItems: input.rawItems,
    uniqueItems: input.uniqueItems,
    upstreamActive: input.upstreamActive,
    upstreamInactive: input.upstreamInactive,
    duplicateItems: input.duplicateItems,
    duplicateExternalIds: input.duplicateExternalIds,
    conflictingDuplicateExternalIds: input.conflictingDuplicateExternalIds,
    created: input.upsert.created,
    updated: input.upsert.updated,
    reactivated: input.upsert.reactivated,
    inactivatedByUpstream: input.upsert.inactivatedByUpstream,
    inactivatedByAbsence: 0,
    alreadyInactive: input.upsert.alreadyInactive,
    snapshotComplete: input.snapshotComplete,
    absenceReconcileApplied: false,
    reconcileSkipped: true,
    skipReason: input.skipReason,
  };
}

function skipReasonFromError(error: unknown): PartyCatalogSkipReason {
  if (error instanceof ContaAzulPartyCatalogPaginationError) {
    if (error.message.includes('limite')) {
      return 'max_pages';
    }
    return 'pagination_inconsistent';
  }
  if (error instanceof ContaAzulMappingError) {
    return 'invalid_payload';
  }
  return 'page_error';
}

/** Preserva diagnóstico sanitizado de pessoas (page + json_parse) — paridade com peopleWindow. */
function annotatePartyCatalogPageError(error: unknown, pagina: number): unknown {
  if (error instanceof ContaAzulApiError && error.kind === 'invalid_response') {
    const diagnostic: ContaAzulPayloadDiagnostic = {
      resource: 'pessoas',
      stage: 'json_parse',
      received: 'non_json_response',
      page: pagina,
    };
    return new ContaAzulMappingError(formatPayloadDiagnostic(diagnostic), { diagnostic });
  }
  if (error instanceof ContaAzulMappingError && error.diagnostic) {
    const diagnostic: ContaAzulPayloadDiagnostic = { ...error.diagnostic, page: pagina };
    return new ContaAzulMappingError(error.message, { diagnostic });
  }
  return error;
}

export function createContaAzulPartyCatalogSyncService(deps: {
  readonly financial: ContaAzulFinancialRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulPartyCatalogSyncService {
  return {
    async syncCatalog(input) {
      const startedAt = Date.now();
      let pagina = 1;
      let pagesFetched = 0;
      let rawItems = 0;
      let upsert = emptyPartyCatalogUpsertCounters();
      const authoritative = new Map<string, MappedParty>();
      const duplicateExternalIdSet = new Set<string>();
      const conflictingExternalIdSet = new Set<string>();
      let duplicateItems = 0;

      try {
        for (;;) {
          let page;
          try {
            const payload = await input.requestWithAuth((accessToken) =>
              input.gatedGet(() =>
                deps.apiClient.getPeople(accessToken, {
                  pagina,
                  tamanhoPagina: CONTA_AZUL_SYNC_PAGE_SIZE,
                }),
              ),
            );
            page = mapPartyPage(payload);
          } catch (error) {
            throw annotatePartyCatalogPageError(error, pagina);
          }
          pagesFetched += 1;

          if (
            isPaginationInconsistent({
              pageItemCount: page.items.length,
              processed: rawItems + page.items.length,
              totalItems: page.totalItems,
              pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
            })
          ) {
            throw new ContaAzulPartyCatalogPaginationError(
              'Paginação de pessoas inconsistente com itens_totais.',
            );
          }

          for (const item of page.items) {
            rawItems += 1;
            const prior = authoritative.get(item.externalId);
            if (!prior) {
              authoritative.set(item.externalId, item);
              continue;
            }
            duplicateItems += 1;
            duplicateExternalIdSet.add(item.externalId);
            if (!partiesSemanticallyEquivalent(prior, item)) {
              conflictingExternalIdSet.add(item.externalId);
            }
          }

          await input.heartbeat();

          if (
            snapshotExhausted({
              pageItemCount: page.items.length,
              pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
            })
          ) {
            break;
          }

          if (pagina >= CONTA_AZUL_PARTY_CATALOG_MAX_PAGES) {
            throw new ContaAzulPartyCatalogPaginationError(
              `Catálogo de pessoas excedeu o limite de ${CONTA_AZUL_PARTY_CATALOG_MAX_PAGES} páginas sem página terminal.`,
            );
          }

          pagina += 1;
        }

        let upstreamActive = 0;
        let upstreamInactive = 0;
        for (const item of authoritative.values()) {
          if (item.active) {
            upstreamActive += 1;
          } else {
            upstreamInactive += 1;
          }
        }

        const uniqueItems = authoritative.size;
        const duplicateExternalIds = duplicateExternalIdSet.size;
        const conflictingDuplicateExternalIds = conflictingExternalIdSet.size;

        // Snapshot vazio completo: NÃO mass-inativar (11-D conservador).
        if (uniqueItems === 0) {
          logCatalogReconcile({
            tenantId: input.scope.tenantId,
            integrationId: input.scope.integrationId,
            ...buildSkippedCounters({
              upsert,
              pagesFetched,
              rawItems,
              uniqueItems: 0,
              upstreamActive: 0,
              upstreamInactive: 0,
              duplicateItems,
              duplicateExternalIds,
              conflictingDuplicateExternalIds,
              snapshotComplete: true,
              skipReason: 'empty_snapshot',
            }),
            durationMs: Date.now() - startedAt,
          });
          return 0;
        }

        // Conflito de duplicatas: não usar snapshot para ausência.
        // Upsert apenas IDs não conflitantes (evita escolher vencedor ambíguo).
        const upsertItems = [...authoritative.values()].filter(
          (item) => !conflictingExternalIdSet.has(item.externalId),
        );
        upsert = await deps.financial.upsertParties(input.scope, upsertItems);

        if (conflictingDuplicateExternalIds > 0) {
          logCatalogReconcile({
            tenantId: input.scope.tenantId,
            integrationId: input.scope.integrationId,
            ...buildSkippedCounters({
              upsert,
              pagesFetched,
              rawItems,
              uniqueItems,
              upstreamActive,
              upstreamInactive,
              duplicateItems,
              duplicateExternalIds,
              conflictingDuplicateExternalIds,
              snapshotComplete: true,
              skipReason: 'conflicting_duplicates',
            }),
            durationMs: Date.now() - startedAt,
          });
          return uniqueItems;
        }

        const presentExternalIds = [...authoritative.keys()];
        const inactivatedByAbsence = await deps.financial.markAbsentPartiesInactive({
          tenantId: input.scope.tenantId,
          integrationId: input.scope.integrationId,
          presentExternalIds,
        });

        logCatalogReconcile({
          tenantId: input.scope.tenantId,
          integrationId: input.scope.integrationId,
          pagesFetched,
          rawItems,
          uniqueItems,
          upstreamActive,
          upstreamInactive,
          duplicateItems,
          duplicateExternalIds,
          conflictingDuplicateExternalIds,
          created: upsert.created,
          updated: upsert.updated,
          reactivated: upsert.reactivated,
          inactivatedByUpstream: upsert.inactivatedByUpstream,
          inactivatedByAbsence,
          alreadyInactive: upsert.alreadyInactive,
          snapshotComplete: true,
          absenceReconcileApplied: true,
          reconcileSkipped: false,
          skipReason: null,
          durationMs: Date.now() - startedAt,
        });
        return uniqueItems;
      } catch (error) {
        if (isCatalogAbortError(error)) {
          let upstreamActive = 0;
          let upstreamInactive = 0;
          for (const item of authoritative.values()) {
            if (item.active) {
              upstreamActive += 1;
            } else {
              upstreamInactive += 1;
            }
          }
          logCatalogReconcile({
            tenantId: input.scope.tenantId,
            integrationId: input.scope.integrationId,
            ...buildSkippedCounters({
              upsert,
              pagesFetched,
              rawItems,
              uniqueItems: authoritative.size,
              upstreamActive,
              upstreamInactive,
              duplicateItems,
              duplicateExternalIds: duplicateExternalIdSet.size,
              conflictingDuplicateExternalIds: conflictingExternalIdSet.size,
              snapshotComplete: false,
              skipReason: skipReasonFromError(error),
            }),
            durationMs: Date.now() - startedAt,
          });
        }
        throw error;
      }
    },
  };
}
