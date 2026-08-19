import { Worker } from 'bullmq';

import {
  CONTA_AZUL_PLAN_SYNCS_JOB_NAME,
  type ContaAzulPlanSyncsJobPayload,
} from '../../modules/integrations/conta-azul/domain/conta-azul-sync.js';
import type { ContaAzulAutoSyncPlanner } from '../../modules/integrations/conta-azul/services/conta-azul-auto-sync.planner.js';
import { bullmqPrefix, type BullmqRedisOptions } from './bullmq-connection.js';

export function createContaAzulPlanSyncsWorker(input: {
  readonly connection: BullmqRedisOptions;
  readonly nodeEnv: string;
  readonly planner: ContaAzulAutoSyncPlanner;
}): Worker<ContaAzulPlanSyncsJobPayload> {
  return new Worker<ContaAzulPlanSyncsJobPayload>(
    CONTA_AZUL_PLAN_SYNCS_JOB_NAME,
    async (job) => {
      if (job.data?.kind !== 'plan') {
        return;
      }
      await input.planner.plan();
    },
    {
      connection: input.connection,
      prefix: bullmqPrefix(input.nodeEnv),
      concurrency: 1,
    },
  );
}
