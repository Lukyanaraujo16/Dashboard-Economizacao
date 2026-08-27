import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { CONTA_AZUL_LEDGER_AUTO_TOMBSTONE } from '../domain/conta-azul-ledger.js';
import { isInstallmentLedgerCovered } from '../domain/conta-azul-ledger-coverage.js';
import {
  addLedgerLifecycleCounters,
  emptyLedgerLifecycleCounters,
  type LedgerLifecycleCounters,
} from '../domain/conta-azul-ledger-lifecycle.js';
import { ContaAzulMappingError } from '../domain/conta-azul-mapping.js';
import { mapSettlementList } from '../domain/conta-azul-settlement-mappers.js';
import type { FinancialSyncScope } from '../repositories/financial.repository.js';
import {
  reconcileInstallmentLedger,
  type ContaAzulLedgerRepository,
} from '../repositories/ledger.repository.js';
import { createContaAzulLedgerLifecycleService } from './conta-azul-ledger-lifecycle.service.js';
import type { PrismaClient } from '../../../../generated/prisma/client.js';

export type LedgerBackfillSummary = {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly mode: 'bootstrap';
  readonly candidates: number;
  readonly skippedCovered: number;
  readonly requested: number;
  readonly fetchedSettlements: number;
  readonly upserted: number;
  readonly empty: number;
  readonly skippedInvalid: number;
  readonly identityMismatch: number;
  readonly parcelFailures: number;
  readonly notFound: number;
  readonly rateLimited: number;
  readonly retries: number;
  readonly durationMs: number;
  readonly autoTombstone: boolean;
  readonly lifecycle: LedgerLifecycleCounters;
};

export type ContaAzulLedgerBackfillService = {
  run(input: {
    readonly scope: FinancialSyncScope;
    readonly dryRun?: boolean;
    readonly forceReconcile?: boolean;
    readonly autoTombstone?: boolean;
    readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
    readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
    readonly heartbeat?: () => Promise<void>;
  }): Promise<LedgerBackfillSummary>;
};

function isAbortingApiError(error: unknown): boolean {
  return (
    error instanceof ContaAzulApiError &&
    (error.kind === 'unauthorized' || error.kind === 'timeout')
  );
}

function emptySummary(
  scope: FinancialSyncScope,
  candidates: number,
  skippedCovered: number,
  durationMs: number,
): LedgerBackfillSummary {
  return {
    tenantId: scope.tenantId,
    integrationId: scope.integrationId,
    mode: 'bootstrap',
    candidates,
    skippedCovered,
    requested: 0,
    fetchedSettlements: 0,
    upserted: 0,
    empty: 0,
    skippedInvalid: 0,
    identityMismatch: 0,
    parcelFailures: 0,
    notFound: 0,
    rateLimited: 0,
    retries: 0,
    durationMs,
    autoTombstone: CONTA_AZUL_LEDGER_AUTO_TOMBSTONE,
    lifecycle: emptyLedgerLifecycleCounters(),
  };
}

export function createContaAzulLedgerBackfillService(deps: {
  readonly prisma: PrismaClient;
  readonly ledger: ContaAzulLedgerRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulLedgerBackfillService {
  return {
    async run(input) {
      const autoTombstone = input.autoTombstone ?? CONTA_AZUL_LEDGER_AUTO_TOMBSTONE;
      const started = Date.now();
      const heartbeat = input.heartbeat ?? (async () => undefined);
      const lifecycleService = createContaAzulLedgerLifecycleService({
        prisma: deps.prisma,
        ledger: deps.ledger,
        apiClient: deps.apiClient,
      });
      const paid = await deps.ledger.listPaidInstallments({
        tenantId: input.scope.tenantId,
        integrationId: input.scope.integrationId,
      });

      const uncovered: typeof paid = [];
      let skippedCovered = 0;
      for (const row of paid) {
        const existing = await deps.ledger.listByInstallment(
          { tenantId: input.scope.tenantId, integrationId: input.scope.integrationId },
          row.externalId,
        );
        if (!input.forceReconcile && isInstallmentLedgerCovered({ paid: row.paid, rows: existing })) {
          skippedCovered += 1;
        } else {
          uncovered.push(row);
        }
      }

      if (input.dryRun === true || uncovered.length === 0) {
        return emptySummary(input.scope, paid.length, skippedCovered, Date.now() - started);
      }

      let requested = 0;
      let fetchedSettlements = 0;
      let upserted = 0;
      let empty = 0;
      let skippedInvalid = 0;
      let identityMismatch = 0;
      let parcelFailures = 0;
      let notFound = 0;
      let rateLimited = 0;
      let retries = 0;
      let lifecycle = emptyLedgerLifecycleCounters();

      for (const candidate of uncovered) {
        const previousRows = await deps.ledger.listByInstallment(
          { tenantId: input.scope.tenantId, integrationId: input.scope.integrationId },
          candidate.externalId,
        );
        try {
          let payload: unknown;
          try {
            payload = await input.requestWithAuth((accessToken) =>
              input.gatedGet(() =>
                deps.apiClient.getInstallmentSettlements(accessToken, candidate.externalId),
              ),
            );
          } catch (error) {
            if (error instanceof ContaAzulApiError && error.kind === 'rate_limited') {
              rateLimited += 1;
              retries += 1;
              await input.gatedGet(async () => undefined);
              payload = await input.requestWithAuth((accessToken) =>
                input.gatedGet(() =>
                  deps.apiClient.getInstallmentSettlements(accessToken, candidate.externalId),
                ),
              );
            } else {
              throw error;
            }
          }
          requested += 1;
          const mapped = mapSettlementList(payload);
          skippedInvalid += mapped.skippedInvalid;
          identityMismatch += mapped.skippedIdentityMismatch;
          const forThisParcel = mapped.items.filter(
            (item) => item.installmentExternalId === candidate.externalId,
          );
          skippedInvalid += mapped.items.length - forThisParcel.length;
          fetchedSettlements += forThisParcel.length;
          const listWasEmpty = Array.isArray(payload) && payload.length === 0;
          if (forThisParcel.length === 0) {
            empty += 1;
          }
          await deps.ledger.upsertSettlements(input.scope, candidate.kind, forThisParcel);
          upserted += forThisParcel.length;
          await reconcileInstallmentLedger(deps.prisma, {
            tenantId: input.scope.tenantId,
            integrationId: input.scope.integrationId,
            installmentExternalId: candidate.externalId,
            installmentKind: candidate.kind,
            upstreamExternalIds: forThisParcel.map((item) => item.externalId),
          });
          lifecycle = addLedgerLifecycleCounters(
            lifecycle,
            await lifecycleService.reconcileInstallment({
              scope: input.scope,
              installmentExternalId: candidate.externalId,
              installmentKind: candidate.kind,
              previousRows,
              upstreamItems: forThisParcel,
              listWasEmpty,
              listOk: true,
              autoTombstone,
              requestWithAuth: input.requestWithAuth,
              gatedGet: input.gatedGet,
            }),
          );
        } catch (error) {
          if (isAbortingApiError(error)) {
            throw error;
          }
          if (error instanceof ContaAzulApiError && error.kind === 'rate_limited') {
            throw error;
          }
          if (error instanceof ContaAzulApiError) {
            requested += 1;
            parcelFailures += 1;
            if (error.httpStatus === 404) {
              notFound += 1;
            }
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
                autoTombstone,
                requestWithAuth: input.requestWithAuth,
                gatedGet: input.gatedGet,
              }),
            );
          } else if (error instanceof ContaAzulMappingError) {
            parcelFailures += 1;
          } else {
            throw error;
          }
        }
        await heartbeat();
      }

      return {
        tenantId: input.scope.tenantId,
        integrationId: input.scope.integrationId,
        mode: 'bootstrap',
        candidates: paid.length,
        skippedCovered,
        requested,
        fetchedSettlements,
        upserted,
        empty,
        skippedInvalid,
        identityMismatch,
        parcelFailures,
        notFound,
        rateLimited,
        retries,
        durationMs: Date.now() - started,
        autoTombstone,
        lifecycle,
      };
    },
  };
}
