import { CONTA_AZUL_SYNC_JOB_TIMEOUT_MS } from '../domain/conta-azul-sync.js';
import { isOrphanSyncRun, type ContaAzulJobLifecycle } from '../domain/conta-azul-sync-orphan.js';
import type {
  ContaAzulSyncRunRepository,
  SyncRunRecord,
} from '../repositories/sync-run.repository.js';

export type ContaAzulSyncReconciler = {
  releaseIfOrphan(run: SyncRunRecord): Promise<boolean>;
  reconcileByIntegrationId(integrationId: string): Promise<boolean>;
  reconcileActive(): Promise<number>;
};

export function createContaAzulSyncReconciler(deps: {
  readonly syncRuns: ContaAzulSyncRunRepository;
  readonly getJobState: (syncRunId: string) => Promise<ContaAzulJobLifecycle>;
  readonly clock?: () => Date;
  readonly timeoutMs?: number;
}): ContaAzulSyncReconciler {
  const now = deps.clock ?? (() => new Date());
  const timeoutMs = deps.timeoutMs ?? CONTA_AZUL_SYNC_JOB_TIMEOUT_MS;

  async function releaseIfOrphan(run: SyncRunRecord): Promise<boolean> {
    const jobState = await deps.getJobState(run.id);
    if (
      !isOrphanSyncRun({
        status: run.status,
        startedAt: run.startedAt,
        heartbeatAt: run.heartbeatAt,
        jobState,
        now: now(),
        timeoutMs,
      })
    ) {
      return false;
    }
    await deps.syncRuns.markFailed({
      id: run.id,
      errorCode: 'sync_stale_run',
      at: now(),
    });
    return true;
  }

  return {
    releaseIfOrphan,

    async reconcileByIntegrationId(integrationId) {
      const active = await deps.syncRuns.findActiveByIntegrationId(integrationId);
      if (!active) {
        return false;
      }
      return releaseIfOrphan(active);
    },

    async reconcileActive() {
      const active = await deps.syncRuns.findActive();
      let released = 0;
      for (const run of active) {
        if (await releaseIfOrphan(run)) {
          released += 1;
        }
      }
      return released;
    },
  };
}
