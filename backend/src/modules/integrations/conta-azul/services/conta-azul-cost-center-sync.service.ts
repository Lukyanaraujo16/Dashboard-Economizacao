import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { normalizeInstallmentCostCenterAllocations } from '../domain/conta-azul-cost-center-allocation-normalize.js';
import {
  emptyCostCenterCatalogUpsertCounters,
  mergeCostCenterCatalogUpsertCounters,
  type CostCenterCatalogReconcileCounters,
  type CostCenterCatalogUpsertCounters,
} from '../domain/conta-azul-cost-center-catalog-metrics.js';
import {
  COST_CENTER_DETAIL_RULE_VERSION,
  detailStatusFromNormalizeKind,
  emptyCostCenterEnrichmentCounters,
  type CostCenterEnrichmentCounters,
} from '../domain/conta-azul-cost-center-detail-fetch.js';
import {
  mapCostCenterPage,
  mapInstallmentCostCenterAllocations,
  reconcileCostCenterAllocationAmounts,
} from '../domain/conta-azul-cost-center-mappers.js';
import { ContaAzulMappingError } from '../domain/conta-azul-mapping.js';
import {
  CONTA_AZUL_COST_CENTER_CATALOG_MAX_PAGES,
  CONTA_AZUL_SYNC_PAGE_SIZE,
} from '../domain/conta-azul-sync.js';
import type { FinancialSyncScope } from '../repositories/financial.repository.js';
import type {
  ContaAzulCostCenterRepository,
  CostCenterAllocationCandidate,
} from '../repositories/cost-center.repository.js';
import { Prisma } from '../../../../generated/prisma/client.js';

export type ContaAzulCostCenterSyncService = {
  syncCatalog(input: {
    readonly scope: FinancialSyncScope;
    readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
    readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
    readonly heartbeat: () => Promise<void>;
  }): Promise<number>;
  syncAllocationsForInstallments(input: {
    readonly scope: FinancialSyncScope;
    readonly installments?: readonly CostCenterAllocationCandidate[];
    readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
    readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
    readonly heartbeat: () => Promise<void>;
  }): Promise<CostCenterEnrichmentCounters>;
};

function isAbortingApiError(error: unknown): boolean {
  return (
    error instanceof ContaAzulApiError &&
    (error.kind === 'unauthorized' || error.kind === 'rate_limited' || error.kind === 'timeout')
  );
}

/** Qualquer falha de fetch/parse/paginação aborta reconcile de ausência. */
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
  // totalItems é sanity check: se processamos mais do que o total alegado, snapshot não é confiável.
  if (processed > totalItems) {
    return true;
  }
  return false;
}

/**
 * Fim de snapshot só por evidência da própria página.
 * Página cheia (=== pageSize) NUNCA encerra — mesmo se totalItems diga o contrário.
 */
function snapshotExhausted(input: {
  readonly pageItemCount: number;
  readonly pageSize: number;
}): boolean {
  return input.pageItemCount < input.pageSize;
}

export class ContaAzulCostCenterCatalogPaginationError extends ContaAzulMappingError {
  constructor(message: string) {
    super(message);
    this.name = 'ContaAzulCostCenterCatalogPaginationError';
  }
}

function logAllocationReconcile(input: {
  readonly kind: 'RECEIVABLE' | 'PAYABLE';
  readonly installmentExternalId: string;
  readonly status: string;
  readonly normalizeKind: string;
  readonly total: string;
  readonly allocated: string;
  readonly upstreamSum: string;
}): void {
  process.stdout.write(
    `${JSON.stringify({
      event: 'conta_azul_cost_center_reconcile',
      kind: input.kind,
      installmentExternalId: input.installmentExternalId,
      status: input.status,
      normalizeKind: input.normalizeKind,
      total: input.total,
      allocated: input.allocated,
      upstreamSum: input.upstreamSum,
    })}\n`,
  );
}

function logCatalogReconcile(
  input: CostCenterCatalogReconcileCounters & {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly durationMs: number;
  },
): void {
  process.stdout.write(
    `${JSON.stringify({
      event: 'conta_azul_cost_center_catalog_reconcile',
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
      reconcileExecuted: input.reconcileExecuted,
      reconcileSkipped: input.reconcileSkipped,
      durationMs: input.durationMs,
    })}\n`,
  );
}

function logMultiCenterUnresolved(input: {
  readonly kind: 'RECEIVABLE' | 'PAYABLE';
  readonly installmentExternalId: string;
  readonly total: string;
  readonly upstreamSum: string;
  readonly centerCount: number;
}): void {
  process.stdout.write(
    `${JSON.stringify({
      event: 'conta_azul_cost_center_multi_center_unresolved',
      kind: input.kind,
      installmentExternalId: input.installmentExternalId,
      total: input.total,
      upstreamSum: input.upstreamSum,
      centerCount: input.centerCount,
      note: 'EVENT_SCOPED_MULTI_CENTER_not_normalized_cc1_1',
    })}\n`,
  );
}

function logEnrichmentSummary(counters: CostCenterEnrichmentCounters, durationMs: number): void {
  process.stdout.write(
    `${JSON.stringify({
      event: 'conta_azul_cost_center_enrichment',
      ...counters,
      durationMs,
    })}\n`,
  );
}

function buildSkippedCounters(
  upsert: CostCenterCatalogUpsertCounters,
  fetched: number,
  activeUpstream: number,
  inactiveUpstream: number,
): CostCenterCatalogReconcileCounters {
  return {
    fetched,
    created: upsert.created,
    updated: upsert.updated,
    reactivated: upsert.reactivated,
    inactivatedByUpstream: upsert.inactivatedByUpstream,
    inactivatedByAbsence: 0,
    alreadyInactive: upsert.alreadyInactive,
    reconcileExecuted: false,
    reconcileSkipped: true,
    activeUpstream,
    inactiveUpstream,
  };
}

export function createContaAzulCostCenterSyncService(deps: {
  readonly costCenters: ContaAzulCostCenterRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulCostCenterSyncService {
  return {
    async syncCatalog(input) {
      const startedAt = Date.now();
      let pagina = 1;
      let processed = 0;
      let upsert = emptyCostCenterCatalogUpsertCounters();
      let activeUpstream = 0;
      let inactiveUpstream = 0;
      const presentExternalIds = new Set<string>();

      try {
        for (;;) {
          const payload = await input.requestWithAuth((accessToken) =>
            input.gatedGet(() =>
              deps.apiClient.getCostCenters(accessToken, {
                pagina,
                filtroRapido: 'TODOS',
              }),
            ),
          );
          const page = mapCostCenterPage(payload);

          if (
            isPaginationInconsistent({
              pageItemCount: page.items.length,
              processed: processed + page.items.length,
              totalItems: page.totalItems,
              pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
            })
          ) {
            throw new ContaAzulCostCenterCatalogPaginationError(
              'Paginação de centros de custo inconsistente com itens_totais.',
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

          const pageUpsert = await deps.costCenters.upsertCostCenters(input.scope, page.items);
          upsert = mergeCostCenterCatalogUpsertCounters(upsert, pageUpsert);
          processed += page.items.length;
          await input.heartbeat();

          if (
            snapshotExhausted({
              pageItemCount: page.items.length,
              pageSize: CONTA_AZUL_SYNC_PAGE_SIZE,
            })
          ) {
            // Snapshot completo e bem-sucedido → reconcile de ausência.
            const inactivatedByAbsence = await deps.costCenters.markAbsentInactive({
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
              reconcileExecuted: true,
              reconcileSkipped: false,
              durationMs: Date.now() - startedAt,
            });
            return processed;
          }

          if (pagina >= CONTA_AZUL_COST_CENTER_CATALOG_MAX_PAGES) {
            throw new ContaAzulCostCenterCatalogPaginationError(
              `Catálogo de centros de custo excedeu o limite de ${CONTA_AZUL_COST_CENTER_CATALOG_MAX_PAGES} páginas sem página terminal.`,
            );
          }

          pagina += 1;
        }
      } catch (error) {
        if (isCatalogAbortError(error)) {
          logCatalogReconcile({
            tenantId: input.scope.tenantId,
            integrationId: input.scope.integrationId,
            ...buildSkippedCounters(upsert, processed, activeUpstream, inactiveUpstream),
            durationMs: Date.now() - startedAt,
          });
        }
        throw error;
      }
    },

    async syncAllocationsForInstallments(input) {
      const startedAt = Date.now();
      const counters = emptyCostCenterEnrichmentCounters();

      let installments: readonly CostCenterAllocationCandidate[];
      if (input.installments) {
        installments = input.installments;
        counters.candidates = installments.length;
      } else {
        const listed = await deps.costCenters.listInstallmentsNeedingAllocationSync({
          tenantId: input.scope.tenantId,
          integrationId: input.scope.integrationId,
        });
        installments = listed.candidates;
        counters.candidates = listed.totalInstallments;
        counters.skippedFresh = listed.skippedFresh;
      }

      for (const installment of installments) {
        counters.requested += 1;
        try {
          const payload = await input.requestWithAuth((accessToken) =>
            input.gatedGet(() =>
              deps.apiClient.getInstallmentDetail(accessToken, installment.externalId),
            ),
          );
          const mapped = mapInstallmentCostCenterAllocations(payload);
          const normalized = normalizeInstallmentCostCenterAllocations({
            installmentTotal: installment.total,
            allocations: mapped,
          });

          if (normalized.kind === 'MULTI_CENTER_UNRESOLVED') {
            logMultiCenterUnresolved({
              kind: installment.kind,
              installmentExternalId: installment.externalId,
              total: installment.total.toFixed(),
              upstreamSum: normalized.upstreamSum.toFixed(),
              centerCount: normalized.allocations.length,
            });
          }

          const knownIds = await deps.costCenters.findCostCenterIdsByExternal(
            {
              tenantId: input.scope.tenantId,
              integrationId: input.scope.integrationId,
            },
            normalized.allocations.map((item) => item.externalCostCenterId),
          );

          const writes: Array<{ costCenterId: string; amount: Prisma.Decimal }> = [];
          for (const item of normalized.allocations) {
            let costCenterId = knownIds.get(item.externalCostCenterId);
            if (!costCenterId) {
              costCenterId = await deps.costCenters.upsertCostCenterByExternal(input.scope, {
                externalId: item.externalCostCenterId,
                name: item.name,
              });
              knownIds.set(item.externalCostCenterId, costCenterId);
            }
            writes.push({ costCenterId, amount: item.amount });
          }

          if (installment.kind === 'RECEIVABLE') {
            await deps.costCenters.replaceAllocationsForReceivable(
              input.scope.tenantId,
              installment.localId,
              writes,
              input.scope.syncedAt,
            );
          } else {
            await deps.costCenters.replaceAllocationsForPayable(
              input.scope.tenantId,
              installment.localId,
              writes,
              input.scope.syncedAt,
            );
          }

          const detailStatus = detailStatusFromNormalizeKind(normalized.kind);
          const detailState = {
            status: detailStatus,
            syncedAt: input.scope.syncedAt,
            ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
          };
          if (installment.kind === 'RECEIVABLE') {
            await deps.costCenters.markReceivableCostCenterDetailState(
              input.scope.tenantId,
              installment.localId,
              detailState,
            );
          } else {
            await deps.costCenters.markPayableCostCenterDetailState(
              input.scope.tenantId,
              installment.localId,
              detailState,
            );
          }

          counters.allocationsWritten += writes.length;
          counters.success += 1;
          if (normalized.kind === 'NO_ALLOCATION') {
            counters.noAllocation += 1;
          } else if (normalized.kind === 'PARTIAL') {
            counters.partial += 1;
          } else if (normalized.kind === 'MULTI_CENTER_UNRESOLVED') {
            counters.unresolved += 1;
          }

          const allocated = writes.reduce(
            (sum, row) => sum.plus(row.amount),
            new Prisma.Decimal(0),
          );
          const status = reconcileCostCenterAllocationAmounts({
            total: installment.total,
            allocated,
          });
          logAllocationReconcile({
            kind: installment.kind,
            installmentExternalId: installment.externalId,
            status,
            normalizeKind: normalized.kind,
            total: installment.total.toFixed(),
            allocated: allocated.toFixed(),
            upstreamSum: normalized.upstreamSum.toFixed(),
          });
        } catch (error) {
          const markAttemptedParcelError = async () => {
            // 11-E.3: tentativa já iniciada — invalidar confirmação CURRENT sem apagar rows.
            const errorState = {
              status: 'ERROR' as const,
              syncedAt: input.scope.syncedAt,
              ruleVersion: COST_CENTER_DETAIL_RULE_VERSION,
            };
            if (installment.kind === 'RECEIVABLE') {
              await deps.costCenters.markReceivableCostCenterDetailState(
                input.scope.tenantId,
                installment.localId,
                errorState,
              );
            } else {
              await deps.costCenters.markPayableCostCenterDetailState(
                input.scope.tenantId,
                installment.localId,
                errorState,
              );
            }
          };

          if (isAbortingApiError(error)) {
            await markAttemptedParcelError();
            counters.errors += 1;
            throw error;
          }
          if (error instanceof ContaAzulApiError || error instanceof ContaAzulMappingError) {
            counters.errors += 1;
            await markAttemptedParcelError();
          } else {
            throw error;
          }
        }
        await input.heartbeat();
      }

      logEnrichmentSummary(counters, Date.now() - startedAt);
      return counters;
    },
  };
}
