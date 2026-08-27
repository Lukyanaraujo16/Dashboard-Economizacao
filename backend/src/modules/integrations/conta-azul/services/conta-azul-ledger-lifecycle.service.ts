import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import {
  addLedgerLifecycleCounters,
  emptyLedgerLifecycleCounters,
  evaluateR3Tombstone,
  readParcelaIdentity,
  type LedgerLifecycleCounters,
} from '../domain/conta-azul-ledger-lifecycle.js';
import { classifyInstallmentLedgerCoverage } from '../domain/conta-azul-ledger-coverage.js';
import type { MappedSettlement } from '../domain/conta-azul-settlement-mappers.js';
import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import type { FinancialSyncScope } from '../repositories/financial.repository.js';
import type { ContaAzulLedgerRepository } from '../repositories/ledger.repository.js';

export type LedgerLifecycleReconcileInput = {
  readonly scope: FinancialSyncScope;
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly previousRows: ReadonlyArray<{
    readonly externalId: string;
    readonly lifecycleStatus: 'ACTIVE' | 'DELETED';
    readonly grossAmount: Prisma.Decimal;
  }>;
  readonly upstreamItems: readonly MappedSettlement[];
  readonly listWasEmpty: boolean;
  readonly listOk: boolean;
  readonly autoTombstone: boolean;
  readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
  readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
};

export type ContaAzulLedgerLifecycleService = {
  reconcileInstallment(input: LedgerLifecycleReconcileInput): Promise<LedgerLifecycleCounters>;
};

function logLifecycle(event: string, payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify({ event, ...payload })}\n`);
}

function isAbortingApiError(error: unknown): boolean {
  return (
    error instanceof ContaAzulApiError &&
    (error.kind === 'unauthorized' || error.kind === 'timeout')
  );
}

export function createContaAzulLedgerLifecycleService(deps: {
  readonly prisma: PrismaClient;
  readonly ledger: ContaAzulLedgerRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulLedgerLifecycleService {
  return {
    async reconcileInstallment(input) {
      let counters = emptyLedgerLifecycleCounters();
      counters = addLedgerLifecycleCounters(counters, { ...emptyLedgerLifecycleCounters(), checked: 1 });

      const paidRow =
        input.installmentKind === 'RECEIVABLE'
          ? await deps.prisma.receivable.findFirst({
              where: {
                tenantId: input.scope.tenantId,
                integrationId: input.scope.integrationId,
                externalId: input.installmentExternalId,
              },
              select: { paid: true },
            })
          : await deps.prisma.payable.findFirst({
              where: {
                tenantId: input.scope.tenantId,
                integrationId: input.scope.integrationId,
                externalId: input.installmentExternalId,
              },
              select: { paid: true },
            });
      const localPaid = paidRow?.paid ?? new Prisma.Decimal(0);
      const coverage = classifyInstallmentLedgerCoverage({
        paid: localPaid,
        rows: input.previousRows,
      });
      if (coverage === 'over_covered') {
        counters = addLedgerLifecycleCounters(counters, {
          ...emptyLedgerLifecycleCounters(),
          overCovered: 1,
        });
      } else if (coverage === 'under_covered') {
        counters = addLedgerLifecycleCounters(counters, {
          ...emptyLedgerLifecycleCounters(),
          underCovered: 1,
        });
      }

      const upstreamIds = new Set(input.upstreamItems.map((item) => item.externalId));
      const reactivated = input.previousRows.filter(
        (row) => row.lifecycleStatus === 'DELETED' && upstreamIds.has(row.externalId),
      ).length;
      if (reactivated > 0) {
        counters = addLedgerLifecycleCounters(counters, {
          ...emptyLedgerLifecycleCounters(),
          reactivated,
        });
      }

      if (!input.listOk) {
        counters = addLedgerLifecycleCounters(counters, {
          ...emptyLedgerLifecycleCounters(),
          failure: 1,
        });
        logLifecycle('conta_azul_ledger_reconciliation_failure', {
          installmentExternalId: input.installmentExternalId,
        });
        return counters;
      }

      if (input.listWasEmpty) {
        counters = addLedgerLifecycleCounters(counters, {
          ...emptyLedgerLifecycleCounters(),
          upstreamEmpty: 1,
        });
        logLifecycle('conta_azul_ledger_upstream_empty', {
          installmentExternalId: input.installmentExternalId,
          note: 'R4_hold_sem_tombstone',
        });
        return counters;
      }

      const missing = input.previousRows.filter(
        (row) => row.lifecycleStatus === 'ACTIVE' && !upstreamIds.has(row.externalId),
      );
      if (missing.length === 0) {
        return counters;
      }
      counters = addLedgerLifecycleCounters(counters, {
        ...emptyLedgerLifecycleCounters(),
        missingSettlement: missing.length,
      });

      const remainingGross = input.upstreamItems.reduce(
        (acc, item) => acc.add(item.grossAmount),
        new Prisma.Decimal(0),
      );

      let parcelaIdentity: ReturnType<typeof readParcelaIdentity> | { kind: 'not_found' };
      try {
        const detail = await input.requestWithAuth((accessToken) =>
          input.gatedGet(() =>
            deps.apiClient.getInstallmentDetail(accessToken, input.installmentExternalId),
          ),
        );
        parcelaIdentity = readParcelaIdentity(detail);
      } catch (error) {
        if (isAbortingApiError(error)) {
          throw error;
        }
        if (error instanceof ContaAzulApiError && error.httpStatus === 404) {
          parcelaIdentity = { kind: 'not_found' };
        } else {
          counters = addLedgerLifecycleCounters(counters, {
            ...emptyLedgerLifecycleCounters(),
            failure: 1,
          });
          logLifecycle('conta_azul_ledger_reconciliation_failure', {
            installmentExternalId: input.installmentExternalId,
            stage: 'parcela_detail',
          });
          return counters;
        }
      }

      for (const row of missing) {
        let lookup: 'not_found' | 'found' | 'error';
        try {
          const result = await input.requestWithAuth((accessToken) =>
            input.gatedGet(() => deps.apiClient.getSettlementById(accessToken, row.externalId)),
          );
          lookup = result.kind === 'not_found' ? 'not_found' : 'found';
        } catch (error) {
          if (isAbortingApiError(error)) {
            throw error;
          }
          lookup = 'error';
          counters = addLedgerLifecycleCounters(counters, {
            ...emptyLedgerLifecycleCounters(),
            failure: 1,
          });
        }

        const decision = evaluateR3Tombstone({
          listOkNonEmpty: true,
          missingFromList: true,
          settlementLookup: lookup,
          parcela: parcelaIdentity,
          remainingGross,
          installmentExternalId: input.installmentExternalId,
        });
        if (decision !== 'confirmed_stale') {
          continue;
        }
        counters = addLedgerLifecycleCounters(counters, {
          ...emptyLedgerLifecycleCounters(),
          confirmedStale: 1,
        });
        if (!input.autoTombstone) {
          counters = addLedgerLifecycleCounters(counters, {
            ...emptyLedgerLifecycleCounters(),
            wouldDelete: 1,
          });
          logLifecycle('conta_azul_ledger_confirmed_stale', {
            installmentExternalId: input.installmentExternalId,
            settlementExternalId: row.externalId,
            mutated: false,
          });
          continue;
        }
        const marked = await deps.ledger.markDeleted(
          { tenantId: input.scope.tenantId, integrationId: input.scope.integrationId },
          row.externalId,
        );
        if (marked) {
          counters = addLedgerLifecycleCounters(counters, {
            ...emptyLedgerLifecycleCounters(),
            deleted: 1,
          });
        }
        logLifecycle('conta_azul_ledger_confirmed_stale', {
          installmentExternalId: input.installmentExternalId,
          settlementExternalId: row.externalId,
          mutated: marked,
        });
      }

      return counters;
    },
  };
}
