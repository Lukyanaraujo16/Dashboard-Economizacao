import { Worker } from 'bullmq';

import { bullmqPrefix, type BullmqRedisOptions } from './bullmq-connection.js';
import {
  PROACTIVE_EVALUATION_QUEUE_NAME,
  type ProactiveEvaluationJobPayload,
} from './proactive-evaluation.queue.js';

export function createProactiveEvaluationWorker(input: {
  readonly connection: BullmqRedisOptions;
  readonly nodeEnv: string;
  readonly run: (tenantId: string) => Promise<void>;
}) {
  const worker = new Worker<ProactiveEvaluationJobPayload>(
    PROACTIVE_EVALUATION_QUEUE_NAME,
    async (job) => {
      await input.run(job.data.tenantId);
    },
    {
      connection: input.connection,
      prefix: bullmqPrefix(input.nodeEnv),
      concurrency: 1,
    },
  );

  worker.on('failed', (job, error) => {
    process.stdout.write(
      `${JSON.stringify({
        event: 'proactive_evaluation_job_failed',
        tenantId: job?.data.tenantId ?? null,
        errorName: error.name,
      })}\n`,
    );
  });

  return worker;
}
