import { Worker } from 'bullmq';

import { bullmqPrefix, type BullmqRedisOptions } from './bullmq-connection.js';
import {
  PROACTIVE_NARRATION_QUEUE_NAME,
  type ProactiveNarrationJobPayload,
} from './proactive-narration.queue.js';

export function createProactiveNarrationWorker(input: {
  readonly connection: BullmqRedisOptions;
  readonly nodeEnv: string;
  readonly run: (payload: ProactiveNarrationJobPayload) => Promise<void>;
}) {
  const worker = new Worker<ProactiveNarrationJobPayload>(
    PROACTIVE_NARRATION_QUEUE_NAME,
    async (job) => {
      await input.run(job.data);
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
        event: 'proactive_narration_job_failed',
        tenantId: job?.data.tenantId ?? null,
        insightId: job?.data.insightId ?? null,
        errorName: error.name,
      })}\n`,
    );
  });

  return worker;
}
