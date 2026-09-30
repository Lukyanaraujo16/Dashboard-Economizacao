import type { AnalyticalCapability } from './analytical-capability-registry.js';
import { getAnalyticalExecutor } from './analytical-executor-registry.js';
import type {
  AnalyticalExecutionHints,
  AnalyticalExecutionOutcome,
  AnalyticalExecutionRuntime,
} from './analytical-execution-types.js';
import type { AnalyticalQuery } from './analytical-query.js';
import { validateAnalyticalCapability } from './validate-analytical-capability.js';
import { toLegacyAnalyticalFact } from './legacy-analytical-fact.js';

/**
 * Entry point F13.8.5B:
 * query → validate capability → executorKey → adapter → legacy fact.
 */
export async function executeAnalyticalQuery(input: {
  readonly query: AnalyticalQuery;
  readonly runtime: AnalyticalExecutionRuntime;
  readonly hints?: AnalyticalExecutionHints;
}): Promise<AnalyticalExecutionOutcome> {
  const validation = validateAnalyticalCapability(input.query);
  if (!validation.ok) {
    return {
      ok: false,
      reason:
        validation.reason === 'CAPABILITY_NOT_FOUND'
          ? 'CAPABILITY_NOT_FOUND'
          : 'INVALID_QUERY',
      message: validation.message,
    };
  }

  const capability: AnalyticalCapability = validation.capability;
  const executor = getAnalyticalExecutor(capability.executorKey);
  if (executor === undefined) {
    return {
      ok: false,
      reason: 'EXECUTOR_NOT_FOUND',
      message: `Executor não registrado: ${capability.executorKey}`,
      capabilityKey: capability.key,
      executorKey: capability.executorKey,
    };
  }

  try {
    return await executor({
      validated: { query: input.query, capability },
      runtime: input.runtime,
      hints: input.hints,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha na execução analítica.';
    if (message.startsWith('EXECUTOR_DEPENDENCY_MISSING')) {
      return {
        ok: false,
        reason: 'EXECUTOR_DEPENDENCY_MISSING',
        message,
        capabilityKey: capability.key,
        executorKey: capability.executorKey,
      };
    }
    return {
      ok: false,
      reason: 'EXECUTION_FAILED',
      message,
      capabilityKey: capability.key,
      executorKey: capability.executorKey,
    };
  }
}

export function legacyFactFromAnalyticalOutcome(
  outcome: Extract<AnalyticalExecutionOutcome, { ok: true }>,
): Record<string, unknown> {
  const fromAdapter = toLegacyAnalyticalFact(outcome.result);
  return fromAdapter;
}
