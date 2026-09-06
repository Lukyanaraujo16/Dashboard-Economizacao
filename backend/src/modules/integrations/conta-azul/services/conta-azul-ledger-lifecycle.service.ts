import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import {
  addLedgerLifecycleCounters,
  emptyLedgerLifecycleCounters,
  evaluateR4bOrphan,
  explainR3Tombstone,
  readParcelaIdentity,
  type LedgerLifecycleCounters,
  type R4bParcelaLookup,
  type R4bSettlementLookup,
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

export type LedgerLifecycleReconcileResult = {
  readonly counters: LedgerLifecycleCounters;
  /**
   * true = probe concluiu com evidência suficiente para avançar checkpoint.
   * false = falha de transporte/auth parcial — NÃO avançar lastLifecycleCheckedAt.
   */
  readonly probeConclusive: boolean;
};

export type ContaAzulLedgerLifecycleService = {
  reconcileInstallment(input: LedgerLifecycleReconcileInput): Promise<LedgerLifecycleReconcileResult>;
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
          skippedFetchFailure: 1,
        });
        logLifecycle('conta_azul_ledger_reconciliation_failure', {
          installmentExternalId: input.installmentExternalId,
          note: 'list_fetch_failure_no_tombstone',
        });
        return { counters, probeConclusive: false };
      }

      if (input.listWasEmpty) {
        return reconcileEmptyListR4b({
          deps,
          input,
          counters,
        });
      }

      const missing = input.previousRows.filter(
        (row) => row.lifecycleStatus === 'ACTIVE' && !upstreamIds.has(row.externalId),
      );
      if (missing.length === 0) {
        return { counters, probeConclusive: true };
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
            skippedFetchFailure: 1,
          });
          logLifecycle('conta_azul_ledger_reconciliation_failure', {
            installmentExternalId: input.installmentExternalId,
            stage: 'parcela_detail',
            note: 'detail_failure_no_tombstone',
          });
          return { counters, probeConclusive: false };
        }
      }

      let hadSettlementLookupError = false;
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
          hadSettlementLookupError = true;
          counters = addLedgerLifecycleCounters(counters, {
            ...emptyLedgerLifecycleCounters(),
            failure: 1,
            skippedFetchFailure: 1,
          });
        }

        const explained = explainR3Tombstone({
          listOkNonEmpty: true,
          missingFromList: true,
          settlementLookup: lookup,
          parcela: parcelaIdentity,
          remainingGross,
          installmentExternalId: input.installmentExternalId,
        });
        if (explained.holdReason === 'remaining_under_paid') {
          counters = addLedgerLifecycleCounters(counters, {
            ...emptyLedgerLifecycleCounters(),
            skippedUnderCovered: 1,
          });
          logLifecycle('conta_azul_ledger_tombstone_skipped', {
            installmentExternalId: input.installmentExternalId,
            settlementExternalId: row.externalId,
            reason: 'remaining_under_paid',
          });
        }
        if (explained.decision !== 'confirmed_stale') {
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

      return { counters, probeConclusive: !hadSettlementLookupError };
    },
  };
}

async function reconcileEmptyListR4b(input: {
  readonly deps: {
    readonly ledger: ContaAzulLedgerRepository;
    readonly apiClient: ContaAzulApiClient;
  };
  readonly input: LedgerLifecycleReconcileInput;
  readonly counters: LedgerLifecycleCounters;
}): Promise<LedgerLifecycleReconcileResult> {
  let counters = input.counters;
  const actives = input.input.previousRows.filter((row) => row.lifecycleStatus === 'ACTIVE');

  if (actives.length === 0) {
    counters = addLedgerLifecycleCounters(counters, {
      ...emptyLedgerLifecycleCounters(),
      upstreamEmpty: 1,
    });
    logLifecycle('conta_azul_ledger_upstream_empty', {
      installmentExternalId: input.input.installmentExternalId,
      note: 'R4_EMPTY_HOLD',
      reason: 'no_active_locals',
    });
    return { counters, probeConclusive: true };
  }

  const settlementLookups: R4bSettlementLookup[] = [];
  for (const row of actives) {
    try {
      const result = await input.input.requestWithAuth((accessToken) =>
        input.input.gatedGet(() =>
          input.deps.apiClient.getSettlementById(accessToken, row.externalId),
        ),
      );
      settlementLookups.push(result.kind === 'not_found' ? 'not_found' : 'found');
    } catch (error) {
      if (isAbortingApiError(error)) {
        throw error;
      }
      settlementLookups.push('error');
      counters = addLedgerLifecycleCounters(counters, {
        ...emptyLedgerLifecycleCounters(),
        failure: 1,
        skippedFetchFailure: 1,
        orphanProbeFailed: 1,
        upstreamEmpty: 1,
      });
      logLifecycle('conta_azul_ledger_upstream_orphan_probe_failed', {
        installmentExternalId: input.input.installmentExternalId,
        settlementExternalId: row.externalId,
        stage: 'settlement_lookup',
        note: 'UPSTREAM_ORPHAN_PROBE_FAILED',
      });
      return { counters, probeConclusive: false };
    }
  }

  let parcela: R4bParcelaLookup;
  try {
    await input.input.requestWithAuth((accessToken) =>
      input.input.gatedGet(() =>
        input.deps.apiClient.getInstallmentDetail(
          accessToken,
          input.input.installmentExternalId,
        ),
      ),
    );
    parcela = 'found';
  } catch (error) {
    if (isAbortingApiError(error)) {
      throw error;
    }
    if (error instanceof ContaAzulApiError && error.httpStatus === 404) {
      parcela = 'not_found';
    } else {
      counters = addLedgerLifecycleCounters(counters, {
        ...emptyLedgerLifecycleCounters(),
        failure: 1,
        skippedFetchFailure: 1,
        orphanProbeFailed: 1,
        upstreamEmpty: 1,
      });
      logLifecycle('conta_azul_ledger_upstream_orphan_probe_failed', {
        installmentExternalId: input.input.installmentExternalId,
        stage: 'parcela_detail',
        note: 'UPSTREAM_ORPHAN_PROBE_FAILED',
      });
      return { counters, probeConclusive: false };
    }
  }

  const explained = evaluateR4bOrphan({
    listOk: true,
    listWasEmpty: true,
    hasActiveLocals: true,
    settlementLookups,
    parcela,
  });

  if (explained.decision !== 'confirmed_orphan') {
    counters = addLedgerLifecycleCounters(counters, {
      ...emptyLedgerLifecycleCounters(),
      upstreamEmpty: 1,
    });
    logLifecycle('conta_azul_ledger_upstream_empty', {
      installmentExternalId: input.input.installmentExternalId,
      note: 'R4_EMPTY_HOLD',
      reason: explained.holdReason,
    });
    return { counters, probeConclusive: true };
  }

  counters = addLedgerLifecycleCounters(counters, {
    ...emptyLedgerLifecycleCounters(),
    confirmedUpstreamOrphan: actives.length,
  });
  logLifecycle('conta_azul_ledger_confirmed_upstream_orphan', {
    installmentExternalId: input.input.installmentExternalId,
    activeCount: actives.length,
    note: 'CONFIRMED_UPSTREAM_ORPHAN',
  });

  for (const row of actives) {
    if (!input.input.autoTombstone) {
      counters = addLedgerLifecycleCounters(counters, {
        ...emptyLedgerLifecycleCounters(),
        wouldDelete: 1,
        orphanWouldTombstone: 1,
      });
      logLifecycle('conta_azul_ledger_upstream_orphan_would_tombstone', {
        installmentExternalId: input.input.installmentExternalId,
        settlementExternalId: row.externalId,
        note: 'UPSTREAM_ORPHAN_WOULD_TOMBSTONE',
        mutated: false,
      });
      continue;
    }
    const marked = await input.deps.ledger.markDeleted(
      {
        tenantId: input.input.scope.tenantId,
        integrationId: input.input.scope.integrationId,
      },
      row.externalId,
    );
    if (marked) {
      counters = addLedgerLifecycleCounters(counters, {
        ...emptyLedgerLifecycleCounters(),
        deleted: 1,
        orphanTombstoned: 1,
      });
    }
    logLifecycle('conta_azul_ledger_upstream_orphan_tombstoned', {
      installmentExternalId: input.input.installmentExternalId,
      settlementExternalId: row.externalId,
      note: 'UPSTREAM_ORPHAN_TOMBSTONED',
      mutated: marked,
    });
  }

  return { counters, probeConclusive: true };
}
