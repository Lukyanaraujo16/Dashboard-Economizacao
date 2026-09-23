import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { buildDueDateWindows, buildTransferSyncCivilWindow, ContaAzulDateError } from '../domain/conta-azul-dates.js';
import {
  buildIncrementalWindow,
  splitAlterationChunks,
  type InstantWindow,
} from '../domain/conta-azul-incremental.js';
import {
  mapPartyPage,
  mapPayablePage,
  mapReceivablePage,
  type MappedPage,
} from '../domain/conta-azul-financial-mappers.js';
import { ContaAzulMappingError } from '../domain/conta-azul-mapping.js';
import { ContaAzulMoneyError } from '../domain/conta-azul-money.js';
import {
  type ContaAzulPayloadDiagnostic,
  formatPayloadDiagnostic,
} from '../domain/conta-azul-payload-diagnostic.js';
import {
  CONTA_AZUL_SYNC_HEARTBEAT_MIN_INTERVAL_MS,
  CONTA_AZUL_SYNC_JOB_TIMEOUT_MS,
  CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
  CONTA_AZUL_SYNC_LOOKBACK_YEARS,
  CONTA_AZUL_SYNC_PAGE_SIZE,
  CONTA_AZUL_SYNC_WINDOW_DAYS,
  type ContaAzulSyncCounts,
  type ContaAzulSyncErrorCode,
} from '../domain/conta-azul-sync.js';
import { cursorsHaveIdentityMismatch } from '../domain/conta-azul-sync-identity.js';
import { formatSaoPauloDateTime } from '../domain/conta-azul-timezone.js';
import { IntegrationUnavailableError } from '../../../../shared/errors/application-error.js';
import type { ContaAzulFinancialRepository } from '../repositories/financial.repository.js';
import type {
  ContaAzulSyncCursorRepository,
  IntegrationSyncCursorRecord,
  IntegrationSyncCursorResource,
} from '../repositories/sync-cursor.repository.js';
import type { ContaAzulSyncRunRepository } from '../repositories/sync-run.repository.js';
import type { TenantRepository } from '../../../tenant/repositories/tenant.repository.js';
import type { ContaAzulIntegrationRepository } from '../repositories/integration.repository.js';
import type { ContaAzulRateLimiter } from './conta-azul-rate-limiter.js';
import type { ContaAzulCostCenterSyncService } from './conta-azul-cost-center-sync.service.js';
import type { ContaAzulLedgerSyncService } from './conta-azul-ledger-sync.service.js';
import type { ContaAzulTransferSyncService } from './conta-azul-transfer-sync.service.js';
import type { LedgerInstallmentCandidate } from '../domain/conta-azul-settlement-mappers.js';
import { captureActiveAccountBalanceSnapshots } from './conta-azul-balance-capture.js';
import { createContaAzulFinancialAccountCatalogSyncService } from './conta-azul-financial-account-catalog-sync.service.js';
import { createContaAzulFinancialCategoryCatalogSyncService } from './conta-azul-financial-category-catalog-sync.service.js';
import { createContaAzulPartyCatalogSyncService } from './conta-azul-party-catalog-sync.service.js';
import type { ReusedInstallmentDetail } from '../domain/conta-azul-installment-detail-reuse.js';
import type { ContaAzulInstallmentPresenceSyncService } from './conta-azul-installment-presence-sync.service.js';

export class ContaAzulSyncExecutionError extends Error {
  readonly code: ContaAzulSyncErrorCode;
  readonly diagnostic?: ContaAzulPayloadDiagnostic;

  constructor(
    code: ContaAzulSyncErrorCode,
    message: string,
    options?: { cause?: unknown; diagnostic?: ContaAzulPayloadDiagnostic },
  ) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = 'ContaAzulSyncExecutionError';
    this.code = code;
    this.diagnostic = options?.diagnostic;
  }
}

export type ContaAzulManualSyncEngine = {
  execute(input: {
    readonly syncRunId: string;
    readonly tenantId: string;
    readonly integrationId: string;
  }): Promise<void>;
};

function diagnosticFromCause(error: unknown): ContaAzulPayloadDiagnostic | undefined {
  if (error instanceof ContaAzulMappingError) {
    return error.diagnostic;
  }
  if (error instanceof ContaAzulSyncExecutionError) {
    return error.diagnostic;
  }
  return undefined;
}

function mapUpstreamError(error: unknown): ContaAzulSyncExecutionError {
  if (error instanceof ContaAzulSyncExecutionError) {
    return error;
  }
  const diagnostic = diagnosticFromCause(error);
  if (
    error instanceof ContaAzulMappingError ||
    error instanceof ContaAzulMoneyError ||
    error instanceof ContaAzulDateError
  ) {
    return new ContaAzulSyncExecutionError('sync_invalid_payload', error.message, {
      cause: error,
      diagnostic,
    });
  }
  if (error instanceof ContaAzulApiError) {
    if (error.kind === 'unauthorized') {
      return new ContaAzulSyncExecutionError('sync_unauthorized', error.message, { cause: error });
    }
    if (error.kind === 'rate_limited') {
      return new ContaAzulSyncExecutionError('sync_rate_limited', error.message, { cause: error });
    }
    if (error.kind === 'timeout') {
      return new ContaAzulSyncExecutionError('sync_timeout', error.message, { cause: error });
    }
    if (error.kind === 'invalid_response') {
      return new ContaAzulSyncExecutionError('sync_invalid_payload', error.message, {
        cause: error,
        diagnostic,
      });
    }
    return new ContaAzulSyncExecutionError('sync_upstream_unavailable', error.message, {
      cause: error,
    });
  }
  if (error instanceof IntegrationUnavailableError) {
    return new ContaAzulSyncExecutionError('sync_disconnected', error.message, { cause: error });
  }
  return new ContaAzulSyncExecutionError(
    'sync_persistence_failed',
    'Não foi possível persistir a sincronização.',
    { cause: error },
  );
}

function annotatePeopleError(error: unknown, pagina: number): unknown {
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

function isUnauthorized(error: unknown): boolean {
  return error instanceof ContaAzulApiError && error.kind === 'unauthorized';
}

function cursorByResource(
  cursors: readonly IntegrationSyncCursorRecord[],
  resource: IntegrationSyncCursorResource,
): IntegrationSyncCursorRecord | undefined {
  return cursors.find((cursor) => cursor.resource === resource);
}

export function createContaAzulManualSyncEngine(deps: {
  readonly tenants: TenantRepository;
  readonly integrations: ContaAzulIntegrationRepository;
  readonly syncRuns: ContaAzulSyncRunRepository;
  readonly financial: ContaAzulFinancialRepository;
  readonly apiClient: ContaAzulApiClient;
  readonly getValidAccessToken: (tenantId: string) => Promise<string>;
  readonly rateLimiter: ContaAzulRateLimiter;
  readonly cursors?: ContaAzulSyncCursorRepository;
  readonly forceRefresh?: (tenantId: string) => Promise<string>;
  readonly clock?: () => Date;
  readonly timeoutMs?: number;
  readonly heartbeatMinIntervalMs?: number;
  readonly costCenterSync?: ContaAzulCostCenterSyncService;
  readonly ledgerSync?: ContaAzulLedgerSyncService;
  readonly transferSync?: ContaAzulTransferSyncService;
  readonly installmentPresenceSync?: ContaAzulInstallmentPresenceSyncService;
  /**
   * 11-E.1 — valor já resolvido do EnvironmentFile.
   * Default seguro no serviço = false quando omitido.
   */
  readonly installmentPresenceAutoTombstone?: boolean;
}): ContaAzulManualSyncEngine {
  const now = deps.clock ?? (() => new Date());
  const timeoutMs = deps.timeoutMs ?? CONTA_AZUL_SYNC_JOB_TIMEOUT_MS;
  const heartbeatMinIntervalMs =
    deps.heartbeatMinIntervalMs ?? CONTA_AZUL_SYNC_HEARTBEAT_MIN_INTERVAL_MS;

  async function gatedGet<T>(work: () => Promise<T>): Promise<T> {
    await deps.rateLimiter.wait();
    return work();
  }

  async function paginate<T>(input: {
    readonly fetchPage: (pagina: number) => Promise<unknown>;
    readonly mapPage: (payload: unknown) => MappedPage<T>;
    readonly persist: (items: T[]) => Promise<void>;
    readonly heartbeat: () => Promise<void>;
    readonly annotateError?: (error: unknown, pagina: number) => unknown;
  }): Promise<number> {
    let pagina = 1;
    let processed = 0;
    for (;;) {
      try {
        const payload = await gatedGet(() => input.fetchPage(pagina));
        const page = input.mapPage(payload);
        await input.persist(page.items);
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
      } catch (error) {
        throw input.annotateError ? input.annotateError(error, pagina) : error;
      }
    }
  }

  return {
    async execute(input) {
      const run = await deps.syncRuns.findById(input.syncRunId);
      if (!run || run.tenantId !== input.tenantId || run.integrationId !== input.integrationId) {
        throw new ContaAzulSyncExecutionError(
          'sync_invalid_payload',
          'A execução de sincronização é inválida.',
        );
      }
      if (run.status === 'SUCCESS' || run.status === 'FAILED') {
        return;
      }
      const runId = run.id;
      const triggerType = run.triggerType;

      const processed = {
        categories: 0,
        financialAccounts: 0,
        parties: 0,
        receivables: 0,
        payables: 0,
        costCenters: 0,
        costCenterAllocations: 0,
        costCenterDetailCandidates: 0,
        costCenterDetailSkippedFresh: 0,
        costCenterDetailRequested: 0,
        costCenterDetailSuccess: 0,
        costCenterDetailNoAllocation: 0,
        costCenterDetailPartial: 0,
        costCenterDetailUnresolved: 0,
        costCenterDetailErrors: 0,
        ledgerCandidates: 0,
        ledgerFetched: 0,
        ledgerUpserted: 0,
        ledgerSkippedInvalid: 0,
        ledgerIdentityMismatches: 0,
        ledgerParcelFailures: 0,
        balanceSnapshotsAttempted: 0,
        balanceSnapshotsUpserted: 0,
        balanceSnapshotsFailed: 0,
        transferPages: 0,
        transferFetched: 0,
        transferUpserted: 0,
        transferSkippedInvalid: 0,
        transferMatched: 0,
        transferUnmatched: 0,
        transferAmbiguous: 0,
        installmentPresenceProbed: 0,
        installmentPresenceTombstoned: 0,
        installmentPresenceWouldTombstone: 0,
        installmentPresenceFound: 0,
        installmentPresenceFailed: 0,
      };

      try {
        const tenant = await deps.tenants.findById(input.tenantId);
        if (!tenant) {
          throw new ContaAzulSyncExecutionError('sync_disconnected', 'Empresa não encontrada.');
        }
        if (tenant.status !== 'ACTIVE') {
          throw new ContaAzulSyncExecutionError(
            'sync_tenant_disabled',
            'Empresa inativa não pode sincronizar a Conta Azul.',
          );
        }

        const loaded = await deps.integrations.findByTenantId(input.tenantId);
        if (
          !loaded ||
          loaded.integration.id !== input.integrationId ||
          loaded.integration.status !== 'CONNECTED' ||
          !loaded.credential
        ) {
          throw new ContaAzulSyncExecutionError(
            'sync_disconnected',
            'Esta empresa não está conectada à Conta Azul.',
          );
        }

        const incremental = triggerType === 'SCHEDULED';
        const existingCursors = incremental
          ? await (deps.cursors?.listByIntegrationId(input.integrationId) ?? Promise.resolve([]))
          : [];
        if (incremental) {
          if (!loaded.integration.lastSuccessfulSyncAt) {
            throw new ContaAzulSyncExecutionError(
              'sync_invalid_payload',
              'Sincronização automática exige uma carga inicial manual.',
            );
          }
          if (!loaded.integration.externalAccountId) {
            throw new ContaAzulSyncExecutionError(
              'sync_disconnected',
              'Esta empresa não está conectada à Conta Azul.',
            );
          }
          if (cursorsHaveIdentityMismatch(existingCursors, loaded.integration.externalAccountId)) {
            throw new ContaAzulSyncExecutionError(
              'sync_identity_changed',
              'A identidade da Conta Azul mudou. Execute uma sincronização manual.',
            );
          }
        }

        const startedAt = now();
        await deps.syncRuns.markRunning(runId, startedAt);
        let lastHeartbeatWrite = startedAt.getTime();

        const heartbeat = async () => {
          const at = now();
          if (at.getTime() - startedAt.getTime() >= timeoutMs) {
            throw new ContaAzulSyncExecutionError(
              'sync_timeout',
              'A sincronização excedeu o tempo máximo.',
            );
          }
          if (at.getTime() - lastHeartbeatWrite >= heartbeatMinIntervalMs) {
            lastHeartbeatWrite = at.getTime();
            await deps.syncRuns.heartbeat(runId, at);
          }
        };
        const scopeOf = () => ({
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          syncedAt: now(),
        });

        async function requestWithAuth<T>(work: (accessToken: string) => Promise<T>): Promise<T> {
          let accessToken = await deps.getValidAccessToken(input.tenantId);
          try {
            return await work(accessToken);
          } catch (error) {
            if (!isUnauthorized(error) || !deps.forceRefresh) {
              throw error;
            }
            accessToken = await deps.forceRefresh(input.tenantId);
            try {
              await deps.rateLimiter.wait();
              return await work(accessToken);
            } catch (retryError) {
              if (isUnauthorized(retryError)) {
                await deps.integrations.markError(input.tenantId, 'identity_unauthorized', now());
              }
              throw retryError;
            }
          }
        }

        // 11-C: catálogo de categorias com paginação segura + reconcile de ausência
        // (antes de contas/parcelas que referenciam categoryExternalIds).
        const financialCategoryCatalogSync = createContaAzulFinancialCategoryCatalogSyncService({
          financial: deps.financial,
          apiClient: deps.apiClient,
        });
        processed.categories = await financialCategoryCatalogSync.syncCatalog({
          scope: scopeOf(),
          requestWithAuth,
          gatedGet,
          heartbeat,
        });

        // 11-B: catálogo de contas com paginação segura + reconcile de ausência
        // (antes da captura de saldo, para inactive não receber saldo-atual).
        const financialAccountCatalogSync = createContaAzulFinancialAccountCatalogSyncService({
          financial: deps.financial,
          apiClient: deps.apiClient,
        });
        processed.financialAccounts = await financialAccountCatalogSync.syncCatalog({
          scope: scopeOf(),
          requestWithAuth,
          gatedGet,
          heartbeat,
        });

        // 08-C1: saldo-atual oficial por conta ativa (após catálogo de contas).
        // Falha de uma conta não aborta o sync nem grava zero.
        const balanceCapture = await captureActiveAccountBalanceSnapshots({
          scope: scopeOf(),
          apiClient: deps.apiClient,
          financial: deps.financial,
          requestWithAuth,
          gatedGet,
          heartbeat,
          now: now(),
        });
        processed.balanceSnapshotsAttempted = balanceCapture.balanceSnapshotsAttempted;
        processed.balanceSnapshotsUpserted = balanceCapture.balanceSnapshotsUpserted;
        processed.balanceSnapshotsFailed = balanceCapture.balanceSnapshotsFailed;

        const dueWindows = buildDueDateWindows(now(), {
          lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
          lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
          windowDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
        });
        const ledgerCandidates = new Map<string, LedgerInstallmentCandidate>();

        async function advanceCursor(
          resource: IntegrationSyncCursorResource,
          windowTo: Date,
          externalAccountId: string,
        ): Promise<void> {
          if (!deps.cursors) {
            return;
          }
          await deps.cursors.upsert({
            tenantId: input.tenantId,
            integrationId: input.integrationId,
            resource,
            cursorAt: windowTo,
            externalAccountId,
            lastRunId: runId,
          });
        }

        // Incremental only: janela com data_alteracao_* NÃO é evidência de ausência (11-D).
        async function peopleWindow(window: InstantWindow): Promise<number> {
          let count = 0;
          for (const chunk of splitAlterationChunks(window)) {
            count += await paginate({
              fetchPage: (pagina) =>
                requestWithAuth((accessToken) =>
                  deps.apiClient.getPeople(accessToken, {
                    pagina,
                    dataAlteracaoDe: formatSaoPauloDateTime(chunk.from),
                    dataAlteracaoAte: formatSaoPauloDateTime(chunk.to),
                  }),
                ),
              mapPage: mapPartyPage,
              persist: async (items) => {
                await deps.financial.upsertParties(scopeOf(), items);
              },
              heartbeat,
              annotateError: annotatePeopleError,
            });
          }
          return count;
        }

        const partyCatalogSync = createContaAzulPartyCatalogSyncService({
          financial: deps.financial,
          apiClient: deps.apiClient,
        });

        async function installmentWindows(
          kind: 'receivables' | 'payables',
          window: InstantWindow | null,
        ): Promise<number> {
          const search =
            kind === 'receivables'
              ? deps.apiClient.searchReceivables.bind(deps.apiClient)
              : deps.apiClient.searchPayables.bind(deps.apiClient);
          const persist =
            kind === 'receivables'
              ? (items: Parameters<typeof deps.financial.upsertReceivables>[1]) =>
                  deps.financial.upsertReceivables(scopeOf(), items)
              : (items: Parameters<typeof deps.financial.upsertPayables>[1]) =>
                  deps.financial.upsertPayables(scopeOf(), items);
          const mapPage = kind === 'receivables' ? mapReceivablePage : mapPayablePage;
          const installmentKind = kind === 'receivables' ? 'RECEIVABLE' : 'PAYABLE';
          const alterationChunks = window ? splitAlterationChunks(window) : [null];
          let count = 0;
          for (const chunk of alterationChunks) {
            for (const dueWindow of dueWindows) {
              count += await paginate({
                fetchPage: (pagina) =>
                  requestWithAuth((accessToken) =>
                    search(accessToken, {
                      pagina,
                      dataVencimentoDe: dueWindow.from,
                      dataVencimentoAte: dueWindow.to,
                      dataAlteracaoDe: chunk ? formatSaoPauloDateTime(chunk.from) : undefined,
                      dataAlteracaoAte: chunk ? formatSaoPauloDateTime(chunk.to) : undefined,
                    }),
                  ),
                mapPage,
                persist: async (items) => {
                  await persist(items);
                  for (const item of items) {
                    if (item.paid.gt(0)) {
                      ledgerCandidates.set(`${installmentKind}:${item.externalId}`, {
                        kind: installmentKind,
                        externalId: item.externalId,
                      });
                    }
                  }
                },
                heartbeat,
              });
            }
          }
          return count;
        }

        if (incremental) {
          const baselineAt = loaded.integration.lastSuccessfulSyncAt!;
          const externalAccountId = loaded.integration.externalAccountId!;
          const peopleRange = buildIncrementalWindow({
            cursorAt: cursorByResource(existingCursors, 'PEOPLE')?.cursorAt ?? null,
            baselineAt,
            executionStartedAt: startedAt,
          });
          processed.parties = await peopleWindow(peopleRange);
          await advanceCursor('PEOPLE', peopleRange.to, externalAccountId);
          // Snapshot completo após incremental+cursor: ausência só aqui (11-D).
          // Falha do snapshot não retroage o upsert incremental já persistido.
          await partyCatalogSync.syncCatalog({
            scope: scopeOf(),
            requestWithAuth,
            gatedGet,
            heartbeat,
          });

          const receivablesRange = buildIncrementalWindow({
            cursorAt: cursorByResource(existingCursors, 'RECEIVABLES')?.cursorAt ?? null,
            baselineAt,
            executionStartedAt: startedAt,
          });
          processed.receivables = await installmentWindows('receivables', receivablesRange);
          await advanceCursor('RECEIVABLES', receivablesRange.to, externalAccountId);

          const payablesRange = buildIncrementalWindow({
            cursorAt: cursorByResource(existingCursors, 'PAYABLES')?.cursorAt ?? null,
            baselineAt,
            executionStartedAt: startedAt,
          });
          processed.payables = await installmentWindows('payables', payablesRange);
          await advanceCursor('PAYABLES', payablesRange.to, externalAccountId);
        } else {
          // MANUAL/full: um único snapshot completo (substitui peopleWindow(null)).
          processed.parties = await partyCatalogSync.syncCatalog({
            scope: scopeOf(),
            requestWithAuth,
            gatedGet,
            heartbeat,
          });
          processed.receivables = await installmentWindows('receivables', null);
          processed.payables = await installmentWindows('payables', null);
        }

        // 11-E.1: manutenção bounded de presença AR/AP (GET /parcelas/{id}).
        // Após upserts (reativam) e antes do enrich CC, para não re-enriquecer DELETED.
        // Ausência no full/incremental NÃO tombstona — só HTTP 404 explícito.
        const reusedInstallmentDetails: ReusedInstallmentDetail[] = [];
        if (deps.installmentPresenceSync) {
          for (const kind of ['RECEIVABLE', 'PAYABLE'] as const) {
            const presence = await deps.installmentPresenceSync.maintainPresence({
              scope: scopeOf(),
              kind,
              requestWithAuth,
              gatedGet,
              heartbeat,
              autoTombstone: deps.installmentPresenceAutoTombstone ?? false,
            });
            processed.installmentPresenceProbed += presence.candidatesQueued;
            processed.installmentPresenceTombstoned += presence.tombstoned;
            processed.installmentPresenceWouldTombstone += presence.wouldTombstone;
            processed.installmentPresenceFound += presence.found200;
            processed.installmentPresenceFailed += presence.probeFailed;
            reusedInstallmentDetails.push(...presence.foundDetails);
          }
        }

        if (deps.costCenterSync) {
          processed.costCenters = await deps.costCenterSync.syncCatalog({
            scope: scopeOf(),
            requestWithAuth,
            gatedGet,
            heartbeat,
          });
          const allocationResult = await deps.costCenterSync.syncAllocationsForInstallments({
            scope: scopeOf(),
            reusedDetails: reusedInstallmentDetails,
            requestWithAuth,
            gatedGet,
            heartbeat,
          });
          processed.costCenterAllocations = allocationResult.allocationsWritten;
          processed.costCenterDetailCandidates = allocationResult.candidates;
          processed.costCenterDetailSkippedFresh = allocationResult.skippedFresh;
          processed.costCenterDetailRequested = allocationResult.requested;
          processed.costCenterDetailSuccess = allocationResult.success;
          processed.costCenterDetailNoAllocation = allocationResult.noAllocation;
          processed.costCenterDetailPartial = allocationResult.partial;
          processed.costCenterDetailUnresolved = allocationResult.unresolved;
          processed.costCenterDetailErrors = allocationResult.errors;
        }

        if (deps.ledgerSync) {
          const firstWindow = dueWindows[0];
          const lastWindow = dueWindows[dueWindows.length - 1];
          const ledgerResult = await deps.ledgerSync.sync({
            scope: scopeOf(),
            mode: 'incremental',
            changedInstallments: [...ledgerCandidates.values()],
            paymentDiscoveryWindow: null,
            dueHorizon: {
              de: firstWindow?.from ?? '1970-01-01',
              ate: lastWindow?.to ?? '1970-01-01',
            },
            requestWithAuth,
            gatedGet,
            heartbeat,
          });
          processed.ledgerCandidates = ledgerResult.candidates;
          processed.ledgerFetched = ledgerResult.fetched;
          processed.ledgerUpserted = ledgerResult.upserted;
          processed.ledgerSkippedInvalid = ledgerResult.skippedInvalid;
          processed.ledgerIdentityMismatches = ledgerResult.skippedIdentityMismatch;
          processed.ledgerParcelFailures = ledgerResult.parcelFailures;
        }

        // CASH-9C / 10-B: catálogo de transferências + rematch direcional (10-A).
        // Depois do ledger para que ghosts tipados já existam quando applyMatches roda.
        // Falha propaga como as demais etapas (não engolir).
        if (deps.transferSync) {
          const transferWindow = buildTransferSyncCivilWindow({
            now: now(),
            mode: incremental ? 'recurring' : 'full',
            lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
            lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
            recurringLookbackDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
          });
          const transferResult = await deps.transferSync.sync({
            scope: scopeOf(),
            from: transferWindow.from,
            to: transferWindow.to,
            requestWithAuth,
            gatedGet,
            heartbeat,
          });
          processed.transferPages = transferResult.pages;
          processed.transferFetched = transferResult.fetched;
          processed.transferUpserted = transferResult.upserted;
          processed.transferSkippedInvalid = transferResult.skippedInvalid;
          processed.transferMatched = transferResult.matched;
          processed.transferUnmatched = transferResult.unmatched;
          processed.transferAmbiguous = transferResult.ambiguous;
          process.stdout.write(
            `${JSON.stringify({
              event: 'conta_azul_transfer_sync',
              tenantId: input.tenantId,
              integrationId: input.integrationId,
              syncRunId: runId,
              mode: incremental ? 'recurring' : 'full',
              from: transferResult.from,
              to: transferResult.to,
              pages: transferResult.pages,
              fetched: transferResult.fetched,
              upserted: transferResult.upserted,
              skippedInvalid: transferResult.skippedInvalid,
              matched: transferResult.matched,
              unmatched: transferResult.unmatched,
              ambiguous: transferResult.ambiguous,
            })}\n`,
          );
        }

        const tenantAgain = await deps.tenants.findById(input.tenantId);
        if (!tenantAgain || tenantAgain.status !== 'ACTIVE') {
          throw new ContaAzulSyncExecutionError(
            'sync_tenant_disabled',
            'Empresa inativa não pode sincronizar a Conta Azul.',
          );
        }
        const loadedAgain = await deps.integrations.findByTenantId(input.tenantId);
        if (
          !loadedAgain ||
          loadedAgain.integration.status !== 'CONNECTED' ||
          !loadedAgain.credential
        ) {
          throw new ContaAzulSyncExecutionError(
            'sync_disconnected',
            'Esta empresa não está conectada à Conta Azul.',
          );
        }

        const finalCounts: ContaAzulSyncCounts = { ...processed };
        await deps.syncRuns.markSuccess({
          id: runId,
          integrationId: input.integrationId,
          counts: finalCounts,
          at: now(),
        });
      } catch (error) {
        const mapped = mapUpstreamError(error);
        await deps.syncRuns.markFailed({
          id: runId,
          errorCode: mapped.code,
          counts: { ...processed },
          at: now(),
        });
        throw mapped;
      }
    },
  };
}
