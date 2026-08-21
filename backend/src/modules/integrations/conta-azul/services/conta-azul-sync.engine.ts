import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { buildDueDateWindows, ContaAzulDateError } from '../domain/conta-azul-dates.js';
import {
  buildIncrementalWindow,
  splitAlterationChunks,
  type InstantWindow,
} from '../domain/conta-azul-incremental.js';
import {
  mapFinancialAccountPage,
  mapFinancialCategoryPage,
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

        processed.categories = await paginate({
          fetchPage: (pagina) =>
            requestWithAuth((accessToken) => deps.apiClient.getCategories(accessToken, { pagina })),
          mapPage: mapFinancialCategoryPage,
          persist: (items) => deps.financial.upsertCategories(scopeOf(), items),
          heartbeat,
        });

        processed.financialAccounts = await paginate({
          fetchPage: (pagina) =>
            requestWithAuth((accessToken) =>
              deps.apiClient.getFinancialAccounts(accessToken, { pagina }),
            ),
          mapPage: mapFinancialAccountPage,
          persist: (items) => deps.financial.upsertAccounts(scopeOf(), items),
          heartbeat,
        });

        const dueWindows = buildDueDateWindows(now(), {
          lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
          lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
          windowDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
        });

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

        async function peopleWindow(window: InstantWindow | null): Promise<number> {
          if (!window) {
            return paginate({
              fetchPage: (pagina) =>
                requestWithAuth((accessToken) => deps.apiClient.getPeople(accessToken, { pagina })),
              mapPage: mapPartyPage,
              persist: (items) => deps.financial.upsertParties(scopeOf(), items),
              heartbeat,
              annotateError: annotatePeopleError,
            });
          }
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
              persist: (items) => deps.financial.upsertParties(scopeOf(), items),
              heartbeat,
              annotateError: annotatePeopleError,
            });
          }
          return count;
        }

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
                persist,
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
          processed.parties = await peopleWindow(null);
          processed.receivables = await installmentWindows('receivables', null);
          processed.payables = await installmentWindows('payables', null);
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
            requestWithAuth,
            gatedGet,
            heartbeat,
          });
          processed.costCenterAllocations = allocationResult.allocations;
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
