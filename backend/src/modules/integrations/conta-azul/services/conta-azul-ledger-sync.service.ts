import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { CONTA_AZUL_LEDGER_AUTO_TOMBSTONE } from '../domain/conta-azul-ledger.js';
import { ContaAzulMappingError } from '../domain/conta-azul-mapping.js';
import {
  extractSearchInstallmentIds,
  mapSettlementList,
  type LedgerInstallmentCandidate,
} from '../domain/conta-azul-settlement-mappers.js';
import {
  addLedgerLifecycleCounters,
  emptyLedgerLifecycleCounters,
  type LedgerLifecycleCounters,
} from '../domain/conta-azul-ledger-lifecycle.js';
import { CONTA_AZUL_SYNC_PAGE_SIZE } from '../domain/conta-azul-sync.js';
import type { FinancialSyncScope } from '../repositories/financial.repository.js';
import {
  reconcileInstallmentLedger,
  type ContaAzulLedgerRepository,
  type LedgerReconciliationRow,
} from '../repositories/ledger.repository.js';
import { createContaAzulLedgerLifecycleService } from './conta-azul-ledger-lifecycle.service.js';
import type { PrismaClient } from '../../../../generated/prisma/client.js';

export type LedgerSyncSummary = {
  readonly candidates: number;
  readonly fetched: number;
  readonly upserted: number;
  readonly skippedInvalid: number;
  readonly skippedIdentityMismatch: number;
  readonly parcelFailures: number;
  readonly reconciliations: readonly LedgerReconciliationRow[];
  readonly autoTombstone: boolean;
  readonly lifecycle: LedgerLifecycleCounters;
};

export type ContaAzulLedgerSyncService = {
  sync(input: {
    readonly scope: FinancialSyncScope;
    readonly mode: 'bootstrap' | 'incremental';
    readonly changedInstallments: readonly LedgerInstallmentCandidate[];
    readonly paymentDiscoveryWindow: { readonly de: string; readonly ate: string } | null;
    readonly dueHorizon: { readonly de: string; readonly ate: string };
    readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
    readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
    readonly heartbeat: () => Promise<void>;
  }): Promise<LedgerSyncSummary>;
};

function isAbortingApiError(error: unknown): boolean {
  return (
    error instanceof ContaAzulApiError &&
    (error.kind === 'unauthorized' || error.kind === 'rate_limited' || error.kind === 'timeout')
  );
}

function emptySummary(candidates: number): LedgerSyncSummary {
  return {
    candidates,
    fetched: 0,
    upserted: 0,
    skippedInvalid: 0,
    skippedIdentityMismatch: 0,
    parcelFailures: 0,
    reconciliations: [],
    autoTombstone: CONTA_AZUL_LEDGER_AUTO_TOMBSTONE,
    lifecycle: emptyLedgerLifecycleCounters(),
  };
}

function logIdentityMismatch(input: {
  readonly installmentExternalId: string;
  readonly skippedIdentityMismatch: number;
}): void {
  process.stdout.write(
    `${JSON.stringify({
      event: 'conta_azul_ledger_identity_mismatch',
      installmentExternalId: input.installmentExternalId,
      skippedIdentityMismatch: input.skippedIdentityMismatch,
      note: 'baixa_não_persistida_composição_não_corrigida',
    })}\n`,
  );
}

export function createContaAzulLedgerSyncService(deps: {
  readonly prisma: PrismaClient;
  readonly ledger: ContaAzulLedgerRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulLedgerSyncService {
  async function discoverPaymentCandidates(input: {
    readonly kind: 'RECEIVABLE' | 'PAYABLE';
    readonly window: { readonly de: string; readonly ate: string };
    readonly dueHorizon: { readonly de: string; readonly ate: string };
    readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
    readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
    readonly heartbeat: () => Promise<void>;
  }): Promise<string[]> {
    const search =
      input.kind === 'RECEIVABLE'
        ? deps.apiClient.searchReceivables.bind(deps.apiClient)
        : deps.apiClient.searchPayables.bind(deps.apiClient);
    const ids: string[] = [];
    let pagina = 1;
    for (;;) {
      const payload = await input.requestWithAuth((accessToken) =>
        input.gatedGet(() =>
          search(accessToken, {
            pagina,
            dataVencimentoDe: input.dueHorizon.de,
            dataVencimentoAte: input.dueHorizon.ate,
            dataPagamentoDe: input.window.de,
            dataPagamentoAte: input.window.ate,
          }),
        ),
      );
      const pageIds = extractSearchInstallmentIds(payload);
      ids.push(...pageIds);
      await input.heartbeat();
      if (pageIds.length === 0 || pageIds.length < CONTA_AZUL_SYNC_PAGE_SIZE) {
        return ids;
      }
      pagina += 1;
    }
  }

  return {
    async sync(input) {
      const lifecycleService = createContaAzulLedgerLifecycleService({
        prisma: deps.prisma,
        ledger: deps.ledger,
        apiClient: deps.apiClient,
      });

      const candidates = new Map<string, LedgerInstallmentCandidate>();
      const remember = (item: LedgerInstallmentCandidate) => {
        candidates.set(`${item.kind}:${item.externalId}`, item);
      };

      if (input.mode === 'bootstrap') {
        const paid = await deps.ledger.listPaidInstallments({
          tenantId: input.scope.tenantId,
          integrationId: input.scope.integrationId,
        });
        for (const row of paid) {
          remember({ kind: row.kind, externalId: row.externalId });
        }
      } else {
        for (const item of input.changedInstallments) {
          remember(item);
        }
        if (input.paymentDiscoveryWindow) {
          const arIds = await discoverPaymentCandidates({
            kind: 'RECEIVABLE',
            window: input.paymentDiscoveryWindow,
            dueHorizon: input.dueHorizon,
            requestWithAuth: input.requestWithAuth,
            gatedGet: input.gatedGet,
            heartbeat: input.heartbeat,
          });
          for (const id of arIds) {
            remember({ kind: 'RECEIVABLE', externalId: id });
          }
          const apIds = await discoverPaymentCandidates({
            kind: 'PAYABLE',
            window: input.paymentDiscoveryWindow,
            dueHorizon: input.dueHorizon,
            requestWithAuth: input.requestWithAuth,
            gatedGet: input.gatedGet,
            heartbeat: input.heartbeat,
          });
          for (const id of apIds) {
            remember({ kind: 'PAYABLE', externalId: id });
          }
        }
      }

      const list = [...candidates.values()];
      if (list.length === 0) {
        return emptySummary(0);
      }

      let fetched = 0;
      let upserted = 0;
      let skippedInvalid = 0;
      let skippedIdentityMismatch = 0;
      let parcelFailures = 0;
      const reconciliations: LedgerReconciliationRow[] = [];
      let lifecycle = emptyLedgerLifecycleCounters();

      for (const candidate of list) {
        const previousRows = await deps.ledger.listByInstallment(
          { tenantId: input.scope.tenantId, integrationId: input.scope.integrationId },
          candidate.externalId,
        );
        try {
          const payload = await input.requestWithAuth((accessToken) =>
            input.gatedGet(() =>
              deps.apiClient.getInstallmentSettlements(accessToken, candidate.externalId),
            ),
          );
          fetched += 1;
          const mapped = mapSettlementList(payload);
          skippedInvalid += mapped.skippedInvalid;
          skippedIdentityMismatch += mapped.skippedIdentityMismatch;
          if (mapped.skippedIdentityMismatch > 0) {
            logIdentityMismatch({
              installmentExternalId: candidate.externalId,
              skippedIdentityMismatch: mapped.skippedIdentityMismatch,
            });
          }
          const forThisParcel = mapped.items.filter(
            (item) => item.installmentExternalId === candidate.externalId,
          );
          skippedInvalid += mapped.items.length - forThisParcel.length;
          await deps.ledger.upsertSettlements(input.scope, candidate.kind, forThisParcel);
          upserted += forThisParcel.length;

          const row = await reconcileInstallmentLedger(deps.prisma, {
            tenantId: input.scope.tenantId,
            integrationId: input.scope.integrationId,
            installmentExternalId: candidate.externalId,
            installmentKind: candidate.kind,
            upstreamExternalIds: forThisParcel.map((item) => item.externalId),
          });
          if (row) {
            reconciliations.push(row);
          }
          lifecycle = addLedgerLifecycleCounters(
            lifecycle,
            await lifecycleService.reconcileInstallment({
              scope: input.scope,
              installmentExternalId: candidate.externalId,
              installmentKind: candidate.kind,
              previousRows,
              upstreamItems: forThisParcel,
              listWasEmpty: Array.isArray(payload) && payload.length === 0,
              listOk: true,
              autoTombstone: CONTA_AZUL_LEDGER_AUTO_TOMBSTONE,
              requestWithAuth: input.requestWithAuth,
              gatedGet: input.gatedGet,
            }),
          );
        } catch (error) {
          if (isAbortingApiError(error)) {
            throw error;
          }
          if (error instanceof ContaAzulApiError || error instanceof ContaAzulMappingError) {
            parcelFailures += 1;
            if (error instanceof ContaAzulApiError) {
              lifecycle = addLedgerLifecycleCounters(
                lifecycle,
                await lifecycleService.reconcileInstallment({
                  scope: input.scope,
                  installmentExternalId: candidate.externalId,
                  installmentKind: candidate.kind,
                  previousRows,
                  upstreamItems: [],
                  listWasEmpty: false,
                  listOk: false,
                  autoTombstone: CONTA_AZUL_LEDGER_AUTO_TOMBSTONE,
                  requestWithAuth: input.requestWithAuth,
                  gatedGet: input.gatedGet,
                }),
              );
            }
          } else {
            throw error;
          }
        }
        await input.heartbeat();
      }

      process.stdout.write(
        `${JSON.stringify({
          event: 'conta_azul_ledger_lifecycle_summary',
          tenantId: input.scope.tenantId,
          integrationId: input.scope.integrationId,
          mode: input.mode,
          autoTombstone: CONTA_AZUL_LEDGER_AUTO_TOMBSTONE,
          installmentsReconciled: lifecycle.checked,
          tombstoned: lifecycle.deleted,
          wouldTombstone: lifecycle.wouldDelete,
          skippedUnderCovered: lifecycle.skippedUnderCovered,
          skippedFetchFailure: lifecycle.skippedFetchFailure,
          overCovered: lifecycle.overCovered,
          underCovered: lifecycle.underCovered,
          reactivated: lifecycle.reactivated,
          confirmedStale: lifecycle.confirmedStale,
          missingSettlement: lifecycle.missingSettlement,
        })}\n`,
      );

      return {
        candidates: list.length,
        fetched,
        upserted,
        skippedInvalid,
        skippedIdentityMismatch,
        parcelFailures,
        reconciliations,
        autoTombstone: CONTA_AZUL_LEDGER_AUTO_TOMBSTONE,
        lifecycle,
      };
    },
  };
}
