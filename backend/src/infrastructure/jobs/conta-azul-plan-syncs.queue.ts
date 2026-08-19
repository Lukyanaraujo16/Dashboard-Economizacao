import { Queue } from 'bullmq';

import {
  CONTA_AZUL_PLAN_SYNCS_JOB_NAME,
  CONTA_AZUL_PLAN_SYNCS_SCHEDULER_ID,
  CONTA_AZUL_PLAN_SYNCS_TICK_MS,
  type ContaAzulPlanSyncsJobPayload,
} from '../../modules/integrations/conta-azul/domain/conta-azul-sync.js';
import { bullmqPrefix, type BullmqRedisOptions } from './bullmq-connection.js';

export type ContaAzulPlanSyncsScheduler = {
  upsert(): Promise<void>;
  listSchedulerIds(): Promise<readonly string[]>;
  close(): Promise<void>;
};

export function createContaAzulPlanSyncsScheduler(input: {
  readonly connection: BullmqRedisOptions;
  readonly nodeEnv: string;
}): ContaAzulPlanSyncsScheduler {
  const queue = new Queue<ContaAzulPlanSyncsJobPayload>(CONTA_AZUL_PLAN_SYNCS_JOB_NAME, {
    connection: input.connection,
    prefix: bullmqPrefix(input.nodeEnv),
    defaultJobOptions: {
      attempts: 2,
      backoff: { type: 'fixed', delay: 1_000 },
      removeOnComplete: true,
      removeOnFail: 20,
    },
  });

  return {
    async upsert() {
      await queue.upsertJobScheduler(
        CONTA_AZUL_PLAN_SYNCS_SCHEDULER_ID,
        { every: CONTA_AZUL_PLAN_SYNCS_TICK_MS },
        {
          name: CONTA_AZUL_PLAN_SYNCS_JOB_NAME,
          data: { kind: 'plan' },
        },
      );
    },
    async listSchedulerIds() {
      const schedulers = await queue.getJobSchedulers();
      return schedulers
        .map((scheduler) => scheduler.id ?? scheduler.key)
        .filter((id): id is string => Boolean(id));
    },
    async close() {
      await queue.close();
    },
  };
}
