import { Worker } from 'bullmq';

import {
  CONTA_AZUL_MANUAL_SYNC_JOB_NAME,
  type ContaAzulManualSyncJobPayload,
  type ContaAzulSyncErrorCode,
} from '../../modules/integrations/conta-azul/domain/conta-azul-sync.js';
import {
  toSanitizedPayloadLog,
  type ContaAzulPayloadDiagnostic,
} from '../../modules/integrations/conta-azul/domain/conta-azul-payload-diagnostic.js';
import { ContaAzulMappingError } from '../../modules/integrations/conta-azul/domain/conta-azul-mapping.js';
import { ContaAzulApiError } from '../../modules/integrations/conta-azul/connector/conta-azul-api-client.js';
import {
  ContaAzulSyncExecutionError,
  type ContaAzulManualSyncEngine,
} from '../../modules/integrations/conta-azul/services/conta-azul-sync.engine.js';
import type { ContaAzulSyncRunRepository } from '../../modules/integrations/conta-azul/repositories/sync-run.repository.js';
import { bullmqPrefix, type BullmqRedisOptions } from './bullmq-connection.js';

function failedCode(error: unknown): ContaAzulSyncErrorCode {
  if (error instanceof ContaAzulSyncExecutionError) {
    return error.code;
  }
  return 'sync_upstream_unavailable';
}

function diagnosticFromError(error: unknown): ContaAzulPayloadDiagnostic | undefined {
  if (error instanceof ContaAzulSyncExecutionError) {
    return error.diagnostic ?? diagnosticFromError(error.cause);
  }
  if (error instanceof ContaAzulMappingError) {
    return error.diagnostic;
  }
  return undefined;
}

function shouldLogInvalidPayload(error: unknown): boolean {
  if (error instanceof ContaAzulMappingError) {
    return true;
  }
  if (error instanceof ContaAzulApiError && error.kind === 'invalid_response') {
    return true;
  }
  if (error instanceof ContaAzulSyncExecutionError) {
    return (
      error.code === 'sync_invalid_payload' &&
      (error.diagnostic !== undefined || shouldLogInvalidPayload(error.cause))
    );
  }
  return false;
}

function writeSanitizedInvalidPayload(
  job: ContaAzulManualSyncJobPayload | undefined,
  error: unknown,
  log: (line: string) => void,
): void {
  if (!job || !shouldLogInvalidPayload(error)) {
    return;
  }
  log(
    JSON.stringify(
      toSanitizedPayloadLog({
        syncRunId: job.syncRunId,
        tenantId: job.tenantId,
        errorCode: failedCode(error),
        diagnostic: diagnosticFromError(error),
      }),
    ),
  );
}

export function createContaAzulManualSyncWorker(input: {
  readonly connection: BullmqRedisOptions;
  readonly nodeEnv: string;
  readonly engine: ContaAzulManualSyncEngine;
  readonly syncRuns: ContaAzulSyncRunRepository;
  readonly clock?: () => Date;
  readonly lockDurationMs?: number;
  readonly stalledIntervalMs?: number;
  readonly maxStalledCount?: number;
  readonly logInvalidPayload?: (line: string) => void;
}): Worker<ContaAzulManualSyncJobPayload> {
  const now = input.clock ?? (() => new Date());
  const logInvalidPayload =
    input.logInvalidPayload ?? ((line: string) => process.stdout.write(`${line}\n`));
  const worker = new Worker<ContaAzulManualSyncJobPayload>(
    CONTA_AZUL_MANUAL_SYNC_JOB_NAME,
    async (job) => {
      const payload = job.data;
      if (
        typeof payload?.syncRunId !== 'string' ||
        typeof payload.tenantId !== 'string' ||
        typeof payload.integrationId !== 'string'
      ) {
        throw new ContaAzulSyncExecutionError(
          'sync_invalid_payload',
          'Payload de sincronização inválido.',
        );
      }
      await input.engine.execute({
        syncRunId: payload.syncRunId,
        tenantId: payload.tenantId,
        integrationId: payload.integrationId,
      });
    },
    {
      connection: input.connection,
      prefix: bullmqPrefix(input.nodeEnv),
      concurrency: 1,
      lockDuration: input.lockDurationMs ?? 60_000,
      stalledInterval: input.stalledIntervalMs ?? 30_000,
      maxStalledCount: input.maxStalledCount ?? 1,
    },
  );

  worker.on('failed', (job, error) => {
    const payload = job?.data;
    writeSanitizedInvalidPayload(payload, error, logInvalidPayload);
    const syncRunId = payload?.syncRunId;
    if (typeof syncRunId !== 'string') {
      return;
    }
    void input.syncRuns.markFailed({
      id: syncRunId,
      errorCode: failedCode(error),
      at: now(),
    });
  });

  return worker;
}
