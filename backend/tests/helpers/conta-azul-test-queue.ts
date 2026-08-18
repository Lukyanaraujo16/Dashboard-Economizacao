import { Queue } from 'bullmq';

import {
  createBullmqRedisOptions,
  bullmqPrefix,
} from '../../src/infrastructure/jobs/bullmq-connection.js';
import { CONTA_AZUL_MANUAL_SYNC_JOB_NAME } from '../../src/modules/integrations/conta-azul/domain/conta-azul-sync.js';

const TEST_REDIS_URL = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';

export function createContaAzulTestQueue() {
  return new Queue(CONTA_AZUL_MANUAL_SYNC_JOB_NAME, {
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
