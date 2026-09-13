import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import {
  emptyFinancialAccountCatalogUpsertCounters,
  mergeFinancialAccountCatalogUpsertCounters,
  type FinancialAccountCatalogReconcileCounters,
  type FinancialAccountCatalogSkipReason,
  type FinancialAccountCatalogUpsertCounters,
} from '../domain/conta-azul-financial-account-catalog-metrics.js';
import { mapFinancialAccountPage } from '../domain/conta-azul-financial-mappers.js';
import { ContaAzulMappingError } from '../domain/conta-azul-mapping.js';
import {
  CONTA_AZUL_FINANCIAL_ACCOUNT_CATALOG_MAX_PAGES,
  CONTA_AZUL_SYNC_PAGE_SIZE,
} from '../domain/conta-azul-sync.js';
import type {
  ContaAzulFinancialRepository,
  FinancialSyncScope,
} from '../repositories/financial.repository.js';

export type ContaAzulFinancialAccountCatalogSyncService = {
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
  // totalItems é sanity check: processados > total alegado → snapshot não confiável.
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

export class ContaAzulFinancialAccountCatalogPaginationError extends ContaAzulMappingError {
  constructor(message: string) {
    super(message);
    this.name = 'ContaAzulFinancialAccountCatalogPaginationError';
  }
}

function logCatalogReconcile(
  input: FinancialAccountCatalogReconcileCounters & {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly durationMs: number;
  },
): void {
  process.stdout.write(
    `${JSON.stringify({
      event: 'conta_azul_financial_account_catalog_reconcile',
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      fetched: input.fetched,
      created: input.created,
      updated: input.updated,
      reactivated: input.reactivated,
      inactivatedByUpstream: input.inactivatedByUpstream,
      inactivatedByAbsence: input.inactivatedByAbsence,
      alreadyInactive: input.alreadyInactive,
      activeUpstream: input.activeUpstream,
      inactiveUpstream: input.inactiveUpstream,
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
  readonly upsert: FinancialAccountCatalogUpsertCounters;
  readonly fetched: number;
  readonly activeUpstream: number;
  readonly inactiveUpstream: number;
  readonly pageCount: number;
  readonly emptySnapshot: boolean;
  readonly skipReason: FinancialAccountCatalogSkipReason;
}): FinancialAccountCatalogReconcileCounters {
  return {
    fetched: input.fetched,
    created: input.upsert.created,
    updated: input.upsert.updated,
    reactivated: input.upsert.reactivated,
    inactivatedByUpstream: input.upsert.inactivatedByUpstream,
    inactivatedByAbsence: 0,
    alreadyInactive: input.upsert.alreadyInactive,
    activeUpstream: input.activeUpstream,
    inactiveUpstream: input.inactiveUpstream,
    pageCount: input.pageCount,
    emptySnapshot: input.emptySnapshot,
    reconcileExecuted: false,
    reconcileSkipped: true,
    skipReason: input.skipReason,
  };
}

function skipReasonFromError(error: unknown): FinancialAccountCatalogSkipReason {
  if (error instanceof ContaAzulFinancialAccountCatalogPaginationError) {
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

export function createContaAzulFinancialAccountCatalogSyncService(deps: {
  readonly financial: ContaAzulFinancialRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulFinancialAccountCatalogSyncService {
  return {
    async syncCatalog(input) {
      const startedAt = Date.now();
      let pagina = 1;
      let processed = 0;
      let pageCount = 0;
      let upsert = emptyFinancialAccountCatalogUpsertCounters();
      let activeUpstream = 0;
      let inactiveUpstream = 0;
      const presentExternalIds = new Set<string>();

      try {
        for (;;) {
          const payload = await input.requestWithAuth((accessToken) =>
            input.gatedGet(() =>
              deps.apiClient.getFinancialAccounts(accessToken, {
                pagina,
              }),
            ),
          );
          const page = mapFinancialAccountPage(payload);
          pageCount += 1;

          if (
            isPaginationInconsistent({
              pageItemCount: page.items.length,
              processed: processed + page.items.length,
              totalItems: page.totalItems,
              pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
            })
          ) {
            throw new ContaAzulFinancialAccountCatalogPaginationError(
              'Paginação de contas financeiras inconsistente com itens_totais.',
            );
          }

          for (const item of page.items) {
            presentExternalIds.add(item.externalId);
            if (item.active) {
              activeUpstream += 1;
            } else {
              inactiveUpstream += 1;
            }
          }

          const pageUpsert = await deps.financial.upsertAccounts(input.scope, page.items);
          upsert = mergeFinancialAccountCatalogUpsertCounters(upsert, pageUpsert);
          processed += page.items.length;
          await input.heartbeat();

          if (
            snapshotExhausted({
              pageItemCount: page.items.length,
              pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
            })
          ) {
            // Snapshot vazio completo: NÃO inativar em massa (11-B conservador).
            if (processed === 0) {
              logCatalogReconcile({
                tenantId: input.scope.tenantId,
                integrationId: input.scope.integrationId,
                ...buildSkippedCounters({
                  upsert,
                  fetched: 0,
                  activeUpstream: 0,
                  inactiveUpstream: 0,
                  pageCount,
                  emptySnapshot: true,
                  skipReason: 'empty_snapshot',
                }),
                durationMs: Date.now() - startedAt,
              });
              return 0;
            }

            const inactivatedByAbsence = await deps.financial.markAbsentInactive({
              tenantId: input.scope.tenantId,
              integrationId: input.scope.integrationId,
              presentExternalIds: [...presentExternalIds],
              syncedAt: input.scope.syncedAt,
            });

            logCatalogReconcile({
              tenantId: input.scope.tenantId,
              integrationId: input.scope.integrationId,
              fetched: processed,
              created: upsert.created,
              updated: upsert.updated,
              reactivated: upsert.reactivated,
              inactivatedByUpstream: upsert.inactivatedByUpstream,
              inactivatedByAbsence,
              alreadyInactive: upsert.alreadyInactive,
              activeUpstream,
              inactiveUpstream,
              pageCount,
              emptySnapshot: false,
              reconcileExecuted: true,
              reconcileSkipped: false,
              skipReason: null,
              durationMs: Date.now() - startedAt,
            });
            return processed;
          }

          if (pagina >= CONTA_AZUL_FINANCIAL_ACCOUNT_CATALOG_MAX_PAGES) {
            throw new ContaAzulFinancialAccountCatalogPaginationError(
              `Catálogo de contas financeiras excedeu o limite de ${CONTA_AZUL_FINANCIAL_ACCOUNT_CATALOG_MAX_PAGES} páginas sem página terminal.`,
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
              activeUpstream,
              inactiveUpstream,
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
