import { Queue } from 'bullmq';

import {
  createBullmqRedisOptions,
  bullmqPrefix,
} from '../../src/infrastructure/jobs/bullmq-connection.js';
import {
  CONTA_AZUL_MANUAL_SYNC_JOB_NAME,
  CONTA_AZUL_PLAN_SYNCS_JOB_NAME,
} from '../../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';

const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

export function createContaAzulTestQueue() {
  return new Queue(CONTA_AZUL_MANUAL_SYNC_JOB_NAME, {
    connection: createBullmqRedisOptions(TEST_REDIS_URL),
    prefix: bullmqPrefix('test'),
  });
}

export function createContaAzulPlanSyncsTestQueue() {
  return new Queue(CONTA_AZUL_PLAN_SYNCS_JOB_NAME, {
    connection: createBullmqRedisOptions(TEST_REDIS_URL),
    prefix: bullmqPrefix('test'),
  });
}

export async function drainContaAzulTestQueue(): Promise<void> {
  const queue = createContaAzulTestQueue();
  try {
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
  }
}

export async function drainContaAzulPlanSyncsTestQueue(): Promise<void> {
  const queue = createContaAzulPlanSyncsTestQueue();
  try {
    const schedulers = await queue.getJobSchedulers();
    await Promise.all(
      schedulers.map(async (scheduler) => {
        const id = scheduler.id ?? scheduler.key;
        if (id) {
          await queue.removeJobScheduler(id);
        }
      }),
    );
    await queue.obliterate({ force: true });
  } finally {
    await queue.close();
  }
}
