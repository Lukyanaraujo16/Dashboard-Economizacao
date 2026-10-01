import { Queue } from 'bullmq';

import { bullmqPrefix, type BullmqRedisOptions } from './bullmq-connection.js';
import { isDuplicateBullmqJob } from './proactive-evaluation.queue.js';

export const PROACTIVE_NARRATION_QUEUE_NAME = 'proactive-narration';

export type ProactiveNarrationJobPayload = {
  readonly tenantId: string;
  readonly insightId: string;
};

export function proactiveNarrationJobId(insightId: string): string {
  return `proactive-narrate-${insightId}`;
}

export type ProactiveNarrationPublisher = {
  enqueue(payload: ProactiveNarrationJobPayload): Promise<void>;
  close(): Promise<void>;
};

export function createProactiveNarrationPublisher(input: {
  readonly connection: BullmqRedisOptions;
  readonly nodeEnv: string;
}): ProactiveNarrationPublisher {
  const queue = new Queue<ProactiveNarrationJobPayload>(PROACTIVE_NARRATION_QUEUE_NAME, {
    connection: input.connection,
    prefix: bullmqPrefix(input.nodeEnv),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 20_000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  });

  return {
    async enqueue(payload) {
      try {
        await queue.add(PROACTIVE_NARRATION_QUEUE_NAME, payload, {
          jobId: proactiveNarrationJobId(payload.insightId),
        });
      } catch (error) {
        if (isDuplicateBullmqJob(error)) {
          return;
        }
        throw error;
      }
    },
    async close() {
      await queue.close();
    },
  };
}
