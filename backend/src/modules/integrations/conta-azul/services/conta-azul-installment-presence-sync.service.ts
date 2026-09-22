import { ContaAzulApiError, type ContaAzulApiClient } from '../connector/conta-azul-api-client.js';
import {
  resolveContaAzulInstallmentPresenceAutoTombstone,
  MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND,
} from '../domain/conta-azul-installment-presence.js';
import type {
  ContaAzulInstallmentPresenceRepository,
  InstallmentPresenceKind,
} from '../repositories/installment-presence.repository.js';
import type { FinancialSyncScope } from '../repositories/financial.repository.js';

export type InstallmentPresenceProbeFailureReason =
  | 'auth'
  | 'rate_limited'
  | 'timeout'
  | 'server_error'
  | 'invalid_response'
  | 'other';

export type InstallmentPresenceMaintenanceSummary = {
  readonly tenantId: string;
  readonly integrationId: string;
  readonly kind: InstallmentPresenceKind;
  readonly candidatesDiscovered: number;
  readonly candidatesQueued: number;
  readonly neverChecked: number;
  readonly previouslyChecked: number;
  readonly found200: number;
  readonly notFound404: number;
  readonly tombstoned: number;
  readonly wouldTombstone: number;
  readonly probeFailed: number;
  readonly probeFailures: Readonly<Record<InstallmentPresenceProbeFailureReason, number>>;
  readonly checkpointsAdvanced: number;
  readonly remainingEstimate: number;
  readonly autoTombstone: boolean;
  readonly durationMs: number;
};

export type ContaAzulInstallmentPresenceSyncService = {
  maintainPresence(input: {
    readonly scope: FinancialSyncScope;
    readonly kind: InstallmentPresenceKind;
    readonly requestWithAuth: <T>(work: (accessToken: string) => Promise<T>) => Promise<T>;
    readonly gatedGet: <T>(work: () => Promise<T>) => Promise<T>;
    readonly heartbeat?: () => Promise<void>;
    /**
     * false = dry-run (conta wouldTombstone; não muta; checkpoint NÃO avança em 404).
     * Default: resolveContaAzulInstallmentPresenceAutoTombstone(undefined) → false.
     */
    readonly autoTombstone?: boolean;
    readonly limitPerKind?: number;
    readonly now?: () => Date;
  }): Promise<InstallmentPresenceMaintenanceSummary>;
};

function emptyFailures(): Record<InstallmentPresenceProbeFailureReason, number> {
  return {
    auth: 0,
    rate_limited: 0,
    timeout: 0,
    server_error: 0,
    invalid_response: 0,
    other: 0,
  };
}

export function classifyPresenceProbeFailure(
  error: unknown,
): InstallmentPresenceProbeFailureReason {
  if (!(error instanceof ContaAzulApiError)) {
    return 'other';
  }
  if (
    error.kind === 'unauthorized' ||
    error.httpStatus === 401 ||
    error.httpStatus === 403
  ) {
    return 'auth';
  }
  if (error.kind === 'rate_limited') {
    return 'rate_limited';
  }
  if (error.kind === 'timeout') {
    return 'timeout';
  }
  if (error.kind === 'invalid_response') {
    return 'invalid_response';
  }
  if (error.httpStatus !== undefined && error.httpStatus >= 500) {
    return 'server_error';
  }
  return 'other';
}

/**
 * NOT FOUND inequívoco da parcela: ContaAzulApiClient emite kind=`unavailable`
 * + httpStatus=404 quando `!response.ok` (body parseado ou vazio).
 *
 * `invalid_response` (malformed body) NÃO é conclusivo — mesmo com httpStatus=404.
 */
export function isConclusiveInstallmentNotFound(error: unknown): boolean {
  return (
    error instanceof ContaAzulApiError &&
    error.kind === 'unavailable' &&
    error.httpStatus === 404
  );
}

function logPresence(payload: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

export function createContaAzulInstallmentPresenceSyncService(deps: {
  readonly presence: ContaAzulInstallmentPresenceRepository;
  readonly apiClient: ContaAzulApiClient;
}): ContaAzulInstallmentPresenceSyncService {
  return {
    async maintainPresence(input) {
      const startedAt = Date.now();
      const autoTombstone =
        input.autoTombstone ?? resolveContaAzulInstallmentPresenceAutoTombstone(undefined);
      const limit =
        input.limitPerKind ?? MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND;
      const now = input.now ?? (() => new Date());
      const heartbeat = input.heartbeat ?? (async () => undefined);

      const remainingEstimate = await deps.presence.countAnalyticalActivePresent({
        tenantId: input.scope.tenantId,
        integrationId: input.scope.integrationId,
        kind: input.kind,
      });

      const candidates = await deps.presence.listBoundedPresenceProbeCandidates({
        tenantId: input.scope.tenantId,
        integrationId: input.scope.integrationId,
        kind: input.kind,
        limit,
      });

      let neverChecked = 0;
      let previouslyChecked = 0;
      for (const row of candidates) {
        if (row.lastPresenceCheckedAt === null) {
          neverChecked += 1;
        } else {
          previouslyChecked += 1;
        }
      }

      let found200 = 0;
      let notFound404 = 0;
      let tombstoned = 0;
      let wouldTombstone = 0;
      let probeFailed = 0;
      let checkpointsAdvanced = 0;
      const probeFailures = emptyFailures();

      for (const candidate of candidates) {
        await heartbeat();
        const checkedAt = now();
        try {
          await input.requestWithAuth((accessToken) =>
            input.gatedGet(() =>
              deps.apiClient.getInstallmentDetail(accessToken, candidate.externalId),
            ),
          );
          // GET 200: presença confirmada. Sync normal permanece autoridade dos campos financeiros.
          found200 += 1;
          await deps.presence.touchPresenceCheckpoint({
            tenantId: input.scope.tenantId,
            integrationId: input.scope.integrationId,
            kind: candidate.kind,
            externalId: candidate.externalId,
            checkedAt,
          });
          checkpointsAdvanced += 1;
        } catch (error) {
          if (isConclusiveInstallmentNotFound(error)) {
            notFound404 += 1;
            if (autoTombstone) {
              const result = await deps.presence.markDeleted({
                tenantId: input.scope.tenantId,
                integrationId: input.scope.integrationId,
                kind: candidate.kind,
                externalId: candidate.externalId,
                deletedAt: checkedAt,
              });
              if (result.changed) {
                tombstoned += 1;
              }
              await deps.presence.touchPresenceCheckpoint({
                tenantId: input.scope.tenantId,
                integrationId: input.scope.integrationId,
                kind: candidate.kind,
                externalId: candidate.externalId,
                checkedAt,
              });
              checkpointsAdvanced += 1;
            } else {
              // Dry-run: não muta e não avança checkpoint em 404 (permite revalidação).
              wouldTombstone += 1;
            }
            continue;
          }
          probeFailed += 1;
          const reason = classifyPresenceProbeFailure(error);
          probeFailures[reason] += 1;
          // Inconclusivo: não avança checkpoint.
        }
      }

      const summary: InstallmentPresenceMaintenanceSummary = {
        tenantId: input.scope.tenantId,
        integrationId: input.scope.integrationId,
        kind: input.kind,
        candidatesDiscovered: remainingEstimate,
        candidatesQueued: candidates.length,
        neverChecked,
        previouslyChecked,
        found200,
        notFound404,
        tombstoned,
        wouldTombstone,
        probeFailed,
        probeFailures,
        checkpointsAdvanced,
        remainingEstimate: Math.max(0, remainingEstimate - tombstoned),
        autoTombstone,
        durationMs: Date.now() - startedAt,
      };

      logPresence({
        event: 'conta_azul_installment_presence_maintain',
        ...summary,
      });
      return summary;
    },
  };
}
