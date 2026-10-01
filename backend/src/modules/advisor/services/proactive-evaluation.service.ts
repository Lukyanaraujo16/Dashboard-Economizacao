import type { ProactiveInsightRepository } from '../repositories/proactive-insight.repository.js';
import { logProactive } from '../domain/schedule-proactive-evaluation.js';
import type { ProactiveTriggerEngine } from './proactive-trigger-engine.service.js';

export type ProactiveEvaluationRun = {
  readonly evaluated: number;
  readonly created: number;
  readonly reused: number;
  readonly narrationQueued: number;
};

/**
 * Avalia o tenant e enfileira redação só para insights ainda aguardando.
 * Não chama o provider e não altera o resultado de um sync já concluído.
 */
export async function runProactiveTenantEvaluation(
  deps: {
    readonly engine: ProactiveTriggerEngine;
    readonly insights: Pick<ProactiveInsightRepository, 'listAwaitingNarration'>;
    readonly enqueueNarration: (insightId: string) => Promise<void>;
    readonly now?: Date;
  },
  tenantId: string,
): Promise<ProactiveEvaluationRun> {
  const started = Date.now();
  try {
    const evaluation = await deps.engine.evaluate({
      tenantId,
      now: deps.now ?? new Date(),
    });
    const awaiting = await deps.insights.listAwaitingNarration(tenantId);
    let narrationQueued = 0;
    for (const insight of awaiting) {
      try {
        await deps.enqueueNarration(insight.id);
        narrationQueued += 1;
      } catch {
        logProactive('proactive_narration_enqueue_failed', { tenantId, insightId: insight.id });
      }
    }
    logProactive('proactive_evaluation', {
      tenantId,
      activeConfigurations: evaluation.evaluated,
      eventsCreated: evaluation.created,
      eventsReused: evaluation.reused,
      insightsQueued: narrationQueued,
      durationMs: Date.now() - started,
      success: true,
    });
    return {
      evaluated: evaluation.evaluated,
      created: evaluation.created,
      reused: evaluation.reused,
      narrationQueued,
    };
  } catch (error) {
    logProactive('proactive_evaluation', {
      tenantId,
      activeConfigurations: 0,
      eventsCreated: 0,
      eventsReused: 0,
      insightsQueued: 0,
      durationMs: Date.now() - started,
      success: false,
      errorName: error instanceof Error ? error.name : 'Error',
    });
    throw error;
  }
}
