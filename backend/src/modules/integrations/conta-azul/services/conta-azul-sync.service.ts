import {
  ForbiddenError,
  IntegrationUnavailableError,
  NotFoundError,
  SyncInProgressError,
  ValidationError,
} from '../../../../shared/errors/application-error.js';
import type { AuthenticatedRequestContext } from '../../../auth/domain/authentication-context.js';
import type { TenantRepository } from '../../../tenant/repositories/tenant.repository.js';
import {
  toPublicSyncErrorCode,
  type ContaAzulManualSyncJobPayload,
  type ContaAzulSyncAccepted,
  type PublicContaAzulSyncRun,
} from '../domain/conta-azul-sync.js';
import type { ContaAzulJobLifecycle } from '../domain/conta-azul-sync-orphan.js';
import type { ContaAzulIntegrationRepository } from '../repositories/integration.repository.js';
import {
  isActiveSyncUniqueViolation,
  type ContaAzulSyncRunRepository,
  type SyncRunRecord,
} from '../repositories/sync-run.repository.js';
import { createContaAzulSyncReconciler } from './conta-azul-sync-reconcile.js';

export type ContaAzulSyncService = {
  start(tenantId: string, auth: AuthenticatedRequestContext): Promise<ContaAzulSyncAccepted>;
  current(tenantId: string): Promise<PublicContaAzulSyncRun | null>;
  assertCanDisconnect(tenantId: string): Promise<void>;
};

function toPublicRun(run: SyncRunRecord): PublicContaAzulSyncRun {
  return {
    id: run.id,
    status: run.status,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    counts: run.counts,
    errorCode: toPublicSyncErrorCode(run.errorCode),
  };
}

export function createContaAzulSyncService(deps: {
  readonly tenants: TenantRepository;
  readonly integrations: ContaAzulIntegrationRepository;
  readonly syncRuns: ContaAzulSyncRunRepository;
  readonly publisher: {
    enqueue(
      payload: ContaAzulManualSyncJobPayload,
      options?: { readonly delayMs?: number },
    ): Promise<void>;
    getJobState(syncRunId: string): Promise<ContaAzulJobLifecycle>;
  };
  readonly clock?: () => Date;
  readonly timeoutMs?: number;
}): ContaAzulSyncService {
  const now = deps.clock ?? (() => new Date());
  const reconciler = createContaAzulSyncReconciler({
    syncRuns: deps.syncRuns,
    getJobState: (syncRunId) => deps.publisher.getJobState(syncRunId),
    clock: now,
    timeoutMs: deps.timeoutMs,
  });

  async function createPendingRun(tenantId: string, integrationId: string) {
    try {
      return await deps.syncRuns.createPending({
        tenantId,
        integrationId,
        startedAt: now(),
      });
    } catch (error) {
      if (!isActiveSyncUniqueViolation(error)) {
        throw error;
      }
      const released = await reconciler.reconcileByIntegrationId(integrationId);
      if (!released) {
        throw new SyncInProgressError();
      }
      try {
        return await deps.syncRuns.createPending({
          tenantId,
          integrationId,
          startedAt: now(),
        });
      } catch (retryError) {
        if (isActiveSyncUniqueViolation(retryError)) {
          throw new SyncInProgressError();
        }
        throw retryError;
      }
    }
  }

  return {
    async start(tenantId, auth) {
      if (auth.support.active) {
        throw new ForbiddenError('Saia do modo suporte para gerenciar integrações.');
      }

      const tenant = await deps.tenants.findById(tenantId);
      if (!tenant) {
        throw new NotFoundError('Empresa não encontrada.');
      }
      if (tenant.status !== 'ACTIVE') {
        throw new ValidationError('Empresa inativa não pode sincronizar a Conta Azul.');
      }

      const loaded = await deps.integrations.findByTenantId(tenantId);
      if (!loaded || loaded.integration.status === 'DISCONNECTED' || !loaded.credential) {
        throw new ValidationError('Esta empresa não está conectada à Conta Azul.');
      }
      if (loaded.integration.status === 'ERROR') {
        throw new ValidationError(
          'A autorização da Conta Azul precisa ser renovada antes de sincronizar.',
        );
      }

      await reconciler.reconcileByIntegrationId(loaded.integration.id);
      const run = await createPendingRun(tenantId, loaded.integration.id);

      try {
        await deps.publisher.enqueue({
          syncRunId: run.id,
          tenantId,
          integrationId: loaded.integration.id,
          trigger: 'MANUAL',
        });
      } catch (error) {
        await deps.syncRuns.markFailed({
          id: run.id,
          errorCode: 'sync_enqueue_failed',
          at: now(),
        });
        throw new IntegrationUnavailableError(
          'Não foi possível iniciar a sincronização. Tente novamente.',
          { cause: error },
        );
      }

      return { syncRunId: run.id, status: 'PENDING' };
    },

    async current(tenantId) {
      const tenant = await deps.tenants.findById(tenantId);
      if (!tenant) {
        throw new NotFoundError('Empresa não encontrada.');
      }
      const loaded = await deps.integrations.findByTenantId(tenantId);
      if (!loaded) {
        return null;
      }
      await reconciler.reconcileByIntegrationId(loaded.integration.id);
      const active = await deps.syncRuns.findActiveByIntegrationId(loaded.integration.id);
      if (active) {
        return toPublicRun(active);
      }
      const latest = await deps.syncRuns.findLatestByIntegrationId(loaded.integration.id);
      return latest ? toPublicRun(latest) : null;
    },

    async assertCanDisconnect(tenantId) {
      const loaded = await deps.integrations.findByTenantId(tenantId);
      if (!loaded) {
        return;
      }
      await reconciler.reconcileByIntegrationId(loaded.integration.id);
      const active = await deps.syncRuns.findActiveByIntegrationId(loaded.integration.id);
      if (active) {
        throw new SyncInProgressError(
          'Não é possível desconectar enquanto a sincronização está em andamento.',
        );
      }
    },
  };
}
