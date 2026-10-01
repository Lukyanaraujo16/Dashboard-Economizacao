import { Queue } from 'bullmq';

import { bullmqPrefix, type BullmqRedisOptions } from './bullmq-connection.js';

export const PROACTIVE_EVALUATION_QUEUE_NAME = 'proactive-evaluation';

export type ProactiveEvaluationJobPayload = {
  readonly tenantId: string;
};

export function proactiveEvaluationJobId(tenantId: string): string {
  return `proactive-eval-${tenantId}`;
}

export function isDuplicateBullmqJob(error: unknown): boolean {
  return error instanceof Error && /already exists|jobid/i.test(error.message);
}

export type ProactiveEvaluationPublisher = {
  enqueue(tenantId: string): Promise<void>;
  close(): Promise<void>;
};

export function createProactiveEvaluationPublisher(input: {
  readonly connection: BullmqRedisOptions;
  readonly nodeEnv: string;
}): ProactiveEvaluationPublisher {
  const queue = new Queue<ProactiveEvaluationJobPayload>(PROACTIVE_EVALUATION_QUEUE_NAME, {
    connection: input.connection,
    prefix: bullmqPrefix(input.nodeEnv),
    defaultJobOptions: {
      attempts: 3,
      backoff: { type: 'exponential', delay: 15_000 },
      removeOnComplete: 50,
      removeOnFail: 20,
    },
  });

  return {
    async enqueue(tenantId) {
      try {
        await queue.add(
          PROACTIVE_EVALUATION_QUEUE_NAME,
          { tenantId },
          { jobId: proactiveEvaluationJobId(tenantId) },
        );
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
