import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { normalizeInstallmentCostCenterAllocations } from '../domain/conta-azul-cost-center-allocation-normalize.js';
import {
  mapCostCenterPage,
  mapInstallmentCostCenterAllocations,
  reconcileCostCenterAllocationAmounts,
} from '../domain/conta-azul-cost-center-mappers.js';
import { ContaAzulMappingError } from '../domain/conta-azul-mapping.js';
import { CONTA_AZUL_SYNC_PAGE_SIZE } from '../domain/conta-azul-sync.js';
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
  }): Promise<{ readonly allocations: number; readonly candidates: number; readonly parcelFailures: number }>;
};

function isAbortingApiError(error: unknown): boolean {
  return (
    error instanceof ContaAzulApiError &&
    (error.kind === 'unauthorized' || error.kind === 'rate_limited' || error.kind === 'timeout')
  );
}

function logReconcile(input: {
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

export function createContaAzulCostCenterSyncService(deps: {
  readonly costCenters: ContaAzulCostCenterRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulCostCenterSyncService {
  return {
    async syncCatalog(input) {
      let pagina = 1;
      let processed = 0;
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
        await deps.costCenters.upsertCostCenters(input.scope, page.items);
        processed += page.items.length;
        await input.heartbeat();
        const exhausted =
          page.items.length === 0 ||
          page.items.length < CONTA_AZUL_SYNC_PAGE_SIZE ||
          (page.totalItems !== null && processed >= page.totalItems);
        if (exhausted) {
          return processed;
        }
        pagina += 1;
      }
    },

    async syncAllocationsForInstallments(input) {
      const installments =
        input.installments ??
        (await deps.costCenters.listInstallmentsNeedingAllocationSync({
          tenantId: input.scope.tenantId,
          integrationId: input.scope.integrationId,
        }));

      let allocations = 0;
      let parcelFailures = 0;

      for (const installment of installments) {
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

          allocations += writes.length;

          const allocated = writes.reduce(
            (sum, row) => sum.plus(row.amount),
            new Prisma.Decimal(0),
          );
          const status = reconcileCostCenterAllocationAmounts({
            total: installment.total,
            allocated,
          });
          logReconcile({
            kind: installment.kind,
            installmentExternalId: installment.externalId,
            status,
            normalizeKind: normalized.kind,
            total: installment.total.toFixed(),
            allocated: allocated.toFixed(),
            upstreamSum: normalized.upstreamSum.toFixed(),
          });
        } catch (error) {
          if (isAbortingApiError(error)) {
            throw error;
          }
          if (error instanceof ContaAzulApiError || error instanceof ContaAzulMappingError) {
            parcelFailures += 1;
          } else {
            throw error;
          }
        }
        await input.heartbeat();
      }

      return {
        allocations,
        candidates: installments.length,
        parcelFailures,
      };
    },
  };
}
