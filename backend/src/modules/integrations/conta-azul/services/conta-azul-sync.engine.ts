import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import { buildDueDateWindows, ContaAzulDateError } from '../domain/conta-azul-dates.js';
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
import { IntegrationUnavailableError } from '../../../../shared/errors/application-error.js';
import type { ContaAzulFinancialRepository } from '../repositories/financial.repository.js';
import type { ContaAzulSyncRunRepository } from '../repositories/sync-run.repository.js';
import type { TenantRepository } from '../../../tenant/repositories/tenant.repository.js';
import type { ContaAzulIntegrationRepository } from '../repositories/integration.repository.js';
import type { ContaAzulRateLimiter } from './conta-azul-rate-limiter.js';

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

export function createContaAzulManualSyncEngine(deps: {
  readonly tenants: TenantRepository;
  readonly integrations: ContaAzulIntegrationRepository;
  readonly syncRuns: ContaAzulSyncRunRepository;
  readonly financial: ContaAzulFinancialRepository;
  readonly apiClient: ContaAzulApiClient;
  readonly getValidAccessToken: (tenantId: string) => Promise<string>;
  readonly rateLimiter: ContaAzulRateLimiter;
  readonly clock?: () => Date;
  readonly timeoutMs?: number;
  readonly heartbeatMinIntervalMs?: number;
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

      const processed = {
        categories: 0,
        financialAccounts: 0,
        parties: 0,
        receivables: 0,
        payables: 0,
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

        const startedAt = now();
        await deps.syncRuns.markRunning(run.id, startedAt);
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
            await deps.syncRuns.heartbeat(run.id, at);
          }
        };
        const scopeOf = () => ({
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          syncedAt: now(),
        });

        const token = () => deps.getValidAccessToken(input.tenantId);

        processed.categories = await paginate({
          fetchPage: async (pagina) => deps.apiClient.getCategories(await token(), { pagina }),
          mapPage: mapFinancialCategoryPage,
          persist: (items) => deps.financial.upsertCategories(scopeOf(), items),
          heartbeat,
        });

        processed.financialAccounts = await paginate({
          fetchPage: async (pagina) =>
            deps.apiClient.getFinancialAccounts(await token(), { pagina }),
          mapPage: mapFinancialAccountPage,
          persist: (items) => deps.financial.upsertAccounts(scopeOf(), items),
          heartbeat,
        });

        processed.parties = await paginate({
          fetchPage: async (pagina) => deps.apiClient.getPeople(await token(), { pagina }),
          mapPage: mapPartyPage,
          persist: (items) => deps.financial.upsertParties(scopeOf(), items),
          heartbeat,
          annotateError: annotatePeopleError,
        });

        const windows = buildDueDateWindows(now(), {
          lookbackYears: CONTA_AZUL_SYNC_LOOKBACK_YEARS,
          lookaheadYears: CONTA_AZUL_SYNC_LOOKAHEAD_YEARS,
          windowDays: CONTA_AZUL_SYNC_WINDOW_DAYS,
        });

        for (const window of windows) {
          processed.receivables += await paginate({
            fetchPage: async (pagina) =>
              deps.apiClient.searchReceivables(await token(), {
                pagina,
                dataVencimentoDe: window.from,
                dataVencimentoAte: window.to,
              }),
            mapPage: mapReceivablePage,
            persist: (items) => deps.financial.upsertReceivables(scopeOf(), items),
            heartbeat,
          });
        }

        for (const window of windows) {
          processed.payables += await paginate({
            fetchPage: async (pagina) =>
              deps.apiClient.searchPayables(await token(), {
                pagina,
                dataVencimentoDe: window.from,
                dataVencimentoAte: window.to,
              }),
            mapPage: mapPayablePage,
            persist: (items) => deps.financial.upsertPayables(scopeOf(), items),
            heartbeat,
          });
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
          id: run.id,
          integrationId: input.integrationId,
          counts: finalCounts,
          at: now(),
        });
      } catch (error) {
        const mapped = mapUpstreamError(error);
        await deps.syncRuns.markFailed({
          id: run.id,
          errorCode: mapped.code,
          counts: { ...processed },
          at: now(),
        });
        throw mapped;
      }
    },
  };
}
