import { Queue } from 'bullmq';

import {
  CONTA_AZUL_MANUAL_SYNC_JOB_NAME,
  type ContaAzulManualSyncJobPayload,
} from '../../modules/integrations/conta-azul/domain/conta-azul-sync.js';
import type { ContaAzulJobLifecycle } from '../../modules/integrations/conta-azul/domain/conta-azul-sync-orphan.js';
import { bullmqPrefix, type BullmqRedisOptions } from './bullmq-connection.js';

export type ContaAzulManualSyncPublisher = {
  enqueue(
    payload: ContaAzulManualSyncJobPayload,
    options?: { readonly delayMs?: number },
  ): Promise<void>;
  getJobState(syncRunId: string): Promise<ContaAzulJobLifecycle>;
  close(): Promise<void>;
};

export function createContaAzulManualSyncPublisher(input: {
  readonly connection: BullmqRedisOptions;
  readonly nodeEnv: string;
}): ContaAzulManualSyncPublisher {
  const queue = new Queue<ContaAzulManualSyncJobPayload>(CONTA_AZUL_MANUAL_SYNC_JOB_NAME, {
    connection: input.connection,
    prefix: bullmqPrefix(input.nodeEnv),
    defaultJobOptions: {
      attempts: 1,
      removeOnComplete: true,
      removeOnFail: 20,
    },
  });

  return {
    async enqueue(payload, options) {
      await queue.add(CONTA_AZUL_MANUAL_SYNC_JOB_NAME, payload, {
        jobId: payload.syncRunId,
        delay: options?.delayMs,
      });
    },
    async getJobState(syncRunId) {
      try {
        const job = await queue.getJob(syncRunId);
        if (!job) {
          return 'missing';
        }
        return await job.getState();
      } catch {
        return 'unknown';
      }
    },
    async close() {
      await queue.close();
    },
  };
}
