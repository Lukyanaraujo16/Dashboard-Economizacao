import { autoSyncSpreadDelayMs } from '../domain/conta-azul-auto-sync-schedule.js';
import {
  resolveAutoSyncSkipReason,
  type AutoSyncSkipReason,
} from '../domain/conta-azul-auto-sync-eligibility.js';
import type { ContaAzulManualSyncJobPayload } from '../domain/conta-azul-sync.js';
import type { ContaAzulIntegrationRepository } from '../repositories/integration.repository.js';
import type { ContaAzulSyncCursorRepository } from '../repositories/sync-cursor.repository.js';
import {
  isActiveSyncUniqueViolation,
  type ContaAzulSyncRunRepository,
} from '../repositories/sync-run.repository.js';

export type AutoSyncLogFields = {
  readonly tenantId?: string;
  readonly integrationId?: string;
  readonly syncRunId?: string;
  readonly reason?: AutoSyncSkipReason | string;
  readonly errorCode?: string;
};

export type ContaAzulAutoSyncPlanner = {
  plan(now?: Date): Promise<void>;
};

export function createContaAzulAutoSyncPlanner(deps: {
  readonly integrations: ContaAzulIntegrationRepository;
  readonly syncRuns: ContaAzulSyncRunRepository;
  readonly cursors: ContaAzulSyncCursorRepository;
  readonly publisher: {
    enqueue(
      payload: ContaAzulManualSyncJobPayload,
      options?: { readonly delayMs?: number },
    ): Promise<void>;
  };
  readonly intervalMinutes: number;
  readonly clock?: () => Date;
  readonly log?: (event: string, fields: AutoSyncLogFields) => void;
}): ContaAzulAutoSyncPlanner {
  const now = deps.clock ?? (() => new Date());
  const intervalMs = deps.intervalMinutes * 60_000;
  const log = deps.log ?? (() => undefined);

  return {
    async plan(at = now()) {
      const candidates = await deps.integrations.listAutoSyncCandidates();
      for (const candidate of candidates) {
        const active = await deps.syncRuns.findActiveByIntegrationId(candidate.integrationId);
        const cursors = await deps.cursors.listByIntegrationId(candidate.integrationId);
        const reason = resolveAutoSyncSkipReason({
          status: candidate.status,
          tenantStatus: candidate.tenantStatus,
          hasCredential: candidate.hasCredential,
          externalAccountId: candidate.externalAccountId,
          lastSuccessfulSyncAt: candidate.lastSuccessfulSyncAt,
          now: at,
          intervalMs,
          hasActiveRun: Boolean(active),
          cursors,
        });
        if (reason) {
          log('conta_azul_auto_sync_skipped', {
            tenantId: candidate.tenantId,
            integrationId: candidate.integrationId,
            reason,
          });
          continue;
        }

        let run;
        try {
          run = await deps.syncRuns.createPending({
            tenantId: candidate.tenantId,
            integrationId: candidate.integrationId,
            startedAt: at,
            triggerType: 'SCHEDULED',
          });
        } catch (error) {
          if (isActiveSyncUniqueViolation(error)) {
            log('conta_azul_auto_sync_skipped', {
              tenantId: candidate.tenantId,
              integrationId: candidate.integrationId,
              reason: 'in_progress',
            });
            continue;
          }
          throw error;
        }

        try {
          await deps.publisher.enqueue(
            {
              syncRunId: run.id,
              tenantId: candidate.tenantId,
              integrationId: candidate.integrationId,
              trigger: 'SCHEDULED',
            },
            { delayMs: autoSyncSpreadDelayMs(candidate.integrationId, intervalMs) },
          );
          log('conta_azul_auto_sync_enqueued', {
            tenantId: candidate.tenantId,
            integrationId: candidate.integrationId,
            syncRunId: run.id,
          });
        } catch (error) {
          await deps.syncRuns.markFailed({
            id: run.id,
            errorCode: 'sync_enqueue_failed',
            at,
          });
          log('conta_azul_auto_sync_failed', {
            tenantId: candidate.tenantId,
            integrationId: candidate.integrationId,
            syncRunId: run.id,
            errorCode: 'sync_enqueue_failed',
          });
          throw error;
        }
      }
    },
  };
}
