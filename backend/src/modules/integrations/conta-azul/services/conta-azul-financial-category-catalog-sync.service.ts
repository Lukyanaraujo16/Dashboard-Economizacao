import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import {
  emptyFinancialCategoryCatalogUpsertCounters,
  mergeFinancialCategoryCatalogUpsertCounters,
  type FinancialCategoryCatalogReconcileCounters,
  type FinancialCategoryCatalogSkipReason,
  type FinancialCategoryCatalogUpsertCounters,
} from '../domain/conta-azul-financial-category-catalog-metrics.js';
import { mapFinancialCategoryPage } from '../domain/conta-azul-financial-mappers.js';
import { ContaAzulMappingError } from '../domain/conta-azul-mapping.js';
import {
  CONTA_AZUL_FINANCIAL_CATEGORY_CATALOG_MAX_PAGES,
  CONTA_AZUL_SYNC_PAGE_SIZE,
} from '../domain/conta-azul-sync.js';
import type {
  ContaAzulFinancialRepository,
  FinancialSyncScope,
} from '../repositories/financial.repository.js';

export type ContaAzulFinancialCategoryCatalogSyncService = {
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

/** Fim de snapshot só por evidência da própria página (nunca por totalItems). */
function snapshotExhausted(input: {
  readonly pageItemCount: number;
  readonly pageSize: number;
}): boolean {
  return input.pageItemCount < input.pageSize;
}

export class ContaAzulFinancialCategoryCatalogPaginationError extends ContaAzulMappingError {
  constructor(message: string) {
    super(message);
    this.name = 'ContaAzulFinancialCategoryCatalogPaginationError';
  }
}

function logCatalogReconcile(
  input: FinancialCategoryCatalogReconcileCounters & {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly durationMs: number;
  },
): void {
  process.stdout.write(
    `${JSON.stringify({
      event: 'conta_azul_financial_category_catalog_reconcile',
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      fetched: input.fetched,
      created: input.created,
      updated: input.updated,
      reactivated: input.reactivated,
      inactivatedByAbsence: input.inactivatedByAbsence,
      alreadyInactive: input.alreadyInactive,
      pageCount: input.pageCount,
      emptySnapshot: input.emptySnapshot,
      reconcileExecuted: input.reconcileExecuted,
      reconcileSkipped: input.reconcileSkipped,
      skipReason: input.skipReason,
      durationMs: input.durationMs,
    })}\n`,
  );
}

function buildSkippedCounters(input: {
  readonly upsert: FinancialCategoryCatalogUpsertCounters;
  readonly fetched: number;
  readonly pageCount: number;
  readonly emptySnapshot: boolean;
  readonly skipReason: FinancialCategoryCatalogSkipReason;
}): FinancialCategoryCatalogReconcileCounters {
  return {
    fetched: input.fetched,
    created: input.upsert.created,
    updated: input.upsert.updated,
    reactivated: input.upsert.reactivated,
    inactivatedByAbsence: 0,
    alreadyInactive: input.upsert.alreadyInactive,
    pageCount: input.pageCount,
    emptySnapshot: input.emptySnapshot,
    reconcileExecuted: false,
    reconcileSkipped: true,
    skipReason: input.skipReason,
  };
}

function skipReasonFromError(error: unknown): FinancialCategoryCatalogSkipReason {
  if (error instanceof ContaAzulFinancialCategoryCatalogPaginationError) {
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

export function createContaAzulFinancialCategoryCatalogSyncService(deps: {
  readonly financial: ContaAzulFinancialRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulFinancialCategoryCatalogSyncService {
  return {
    async syncCatalog(input) {
      const startedAt = Date.now();
      let pagina = 1;
      let processed = 0;
      let pageCount = 0;
      let upsert = emptyFinancialCategoryCatalogUpsertCounters();
      const presentExternalIds = new Set<string>();

      try {
        for (;;) {
          const payload = await input.requestWithAuth((accessToken) =>
            input.gatedGet(() =>
              deps.apiClient.getCategories(accessToken, {
                pagina,
              }),
            ),
          );
          const page = mapFinancialCategoryPage(payload);
          pageCount += 1;

          if (
            isPaginationInconsistent({
              pageItemCount: page.items.length,
              processed: processed + page.items.length,
              totalItems: page.totalItems,
              pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
            })
          ) {
            throw new ContaAzulFinancialCategoryCatalogPaginationError(
              'Paginação de categorias financeiras inconsistente com itens_totais.',
            );
          }

          for (const item of page.items) {
            presentExternalIds.add(item.externalId);
          }

          const pageUpsert = await deps.financial.upsertCategories(input.scope, page.items);
          upsert = mergeFinancialCategoryCatalogUpsertCounters(upsert, pageUpsert);
          processed += page.items.length;
          await input.heartbeat();

          if (
            snapshotExhausted({
              pageItemCount: page.items.length,
              pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
            })
          ) {
            // Snapshot vazio completo: NÃO inativar em massa (11-C conservador).
            if (processed === 0) {
              logCatalogReconcile({
                tenantId: input.scope.tenantId,
                integrationId: input.scope.integrationId,
                ...buildSkippedCounters({
                  upsert,
                  fetched: 0,
                  pageCount,
                  emptySnapshot: true,
                  skipReason: 'empty_snapshot',
                }),
                durationMs: Date.now() - startedAt,
              });
              return 0;
            }

            const inactivatedByAbsence = await deps.financial.markAbsentCategoriesInactive({
              tenantId: input.scope.tenantId,
              integrationId: input.scope.integrationId,
              presentExternalIds: [...presentExternalIds],
            });

            logCatalogReconcile({
              tenantId: input.scope.tenantId,
              integrationId: input.scope.integrationId,
              fetched: processed,
              created: upsert.created,
              updated: upsert.updated,
              reactivated: upsert.reactivated,
              inactivatedByAbsence,
              alreadyInactive: upsert.alreadyInactive,
              pageCount,
              emptySnapshot: false,
              reconcileExecuted: true,
              reconcileSkipped: false,
              skipReason: null,
              durationMs: Date.now() - startedAt,
            });
            return processed;
          }

          if (pagina >= CONTA_AZUL_FINANCIAL_CATEGORY_CATALOG_MAX_PAGES) {
            throw new ContaAzulFinancialCategoryCatalogPaginationError(
              `Catálogo de categorias financeiras excedeu o limite de ${CONTA_AZUL_FINANCIAL_CATEGORY_CATALOG_MAX_PAGES} páginas sem página terminal.`,
            );
          }

          pagina += 1;
        }
      } catch (error) {
        if (isCatalogAbortError(error)) {
          logCatalogReconcile({
            tenantId: input.scope.tenantId,
            integrationId: input.scope.integrationId,
            ...buildSkippedCounters({
              upsert,
              fetched: processed,
              pageCount,
              emptySnapshot: processed === 0,
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
