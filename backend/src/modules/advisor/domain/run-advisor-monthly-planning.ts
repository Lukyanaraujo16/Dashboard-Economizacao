import { executeAnalyticalQuery } from './analytical/execute-analytical-query.js';
import type { AnalyticalExecutionRuntime } from './analytical/analytical-execution-types.js';
import type { AnalyticalMetricKey } from './analytical/analytical-keys.js';
import { composeAdvisorPlanningAnswer } from './compose-advisor-planning-answer.js';
import {
  resolveAdvisorPlanningIntent,
  type AdvisorPlanningSubject,
} from './resolve-advisor-planning-intent.js';

const METRIC_BY_SUBJECT: Record<AdvisorPlanningSubject, AnalyticalMetricKey> = {
  REVENUE_GOAL: 'REVENUE_GOAL',
  EXPENSE_CEILING: 'EXPENSE_CEILING',
};

/**
 * Executa as capabilities de planejamento e devolve a resposta factual já fechada.
 * O provider não entra. Centro de custo da pergunta não altera a consulta.
 */
export async function runAdvisorMonthlyPlanning(input: {
  readonly content: string;
  readonly runtime: AnalyticalExecutionRuntime;
  readonly monthKey: string;
}): Promise<{ readonly answer: string } | null> {
  const intent = resolveAdvisorPlanningIntent(input.content);
  if (intent === null) {
    return null;
  }
  const facts: Record<string, unknown>[] = [];
  for (const subject of intent.subjects) {
    const outcome = await executeAnalyticalQuery({
      runtime: input.runtime,
      query: {
        semanticFamily: 'PLANNING',
        metric: METRIC_BY_SUBJECT[subject],
        period: { kind: 'MONTH', monthKey: input.monthKey },
        operation: 'VALUE',
      },
    });
    if (!outcome.ok) {
      return null;
    }
    facts.push(outcome.legacyFact);
  }
  const answer = composeAdvisorPlanningAnswer({ content: input.content, facts });
  return answer === null ? null : { answer };
}
