import type { CashRealizedDetailsService } from '../../analytics/services/cash-realized-details.service.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import { executeAnalyticalQuery } from './analytical/execute-analytical-query.js';
import type { AnalyticalQuery } from './analytical/analytical-query.js';
import {
  composeAdvisorDailyCashMovementAnswer,
  type AdvisorDailyCashMovementFact,
} from './compose-advisor-daily-cash-movement-answer.js';
import {
  dailyCashMovementState,
  type DailyCashMovementConversationState,
} from './daily-cash-movement-conversation-state.js';
import {
  parseAdvisorDailyCenterFollowUp,
  resolveAdvisorCivilDay,
  resolveAdvisorDailyMovementCenter,
  resolveAdvisorDailyMovementDirection,
} from './resolve-advisor-daily-cash-movement.js';

export type RunAdvisorDailyCashMovementResult = {
  readonly answer: string;
  /** null = não persistir. Objeto = substituir o estado desta conversa. */
  readonly state: DailyCashMovementConversationState | null;
};

function isFact(value: unknown): value is AdvisorDailyCashMovementFact {
  if (value === null || typeof value !== 'object') {
    return false;
  }
  const fact = value as { kind?: unknown; status?: unknown };
  return fact.kind === 'DAILY_CASH_MOVEMENTS' && typeof fact.status === 'string';
}

function limitation(message: string): RunAdvisorDailyCashMovementResult {
  return { answer: message, state: null };
}

function resolveDailyIntent(input: {
  readonly content: string;
  readonly referenceMonthKey: string | null;
  readonly now: Date;
  readonly priorState: DailyCashMovementConversationState | null;
}):
  | { readonly kind: 'ignore' }
  | { readonly kind: 'limitation'; readonly message: string }
  | {
      readonly kind: 'ready';
      readonly direction: 'INFLOW' | 'OUTFLOW';
      readonly date: string;
      readonly costCenterQuery: string | null;
    } {
  const followUp = parseAdvisorDailyCenterFollowUp(input.content);
  if (followUp !== null && input.priorState !== null) {
    return {
      kind: 'ready',
      direction: input.priorState.direction,
      date: input.priorState.date,
      costCenterQuery: followUp.kind === 'ALL' ? null : followUp.query,
    };
  }
  const day = resolveAdvisorCivilDay({
    content: input.content,
    referenceMonthKey: input.referenceMonthKey,
    now: input.now,
  });
  const direction = resolveAdvisorDailyMovementDirection(input.content);
  if (day.status === 'ABSENT' || direction === null) {
    return { kind: 'ignore' };
  }
  if (day.status === 'INVALID') {
    return { kind: 'limitation', message: 'Essa data não existe. Não vou buscar os lançamentos.' };
  }
  if (day.status === 'AMBIGUOUS') {
    return { kind: 'limitation', message: 'A pergunta cita mais de um dia. Preciso de uma data só.' };
  }
  const center = resolveAdvisorDailyMovementCenter(input.content);
  if (center.status === 'AMBIGUOUS') {
    return {
      kind: 'limitation',
      message: 'Há mais de um centro de custo na pergunta. Preciso que você indique qual.',
    };
  }
  return {
    kind: 'ready',
    direction,
    date: day.date,
    costCenterQuery: center.status === 'NAMED' ? center.query : null,
  };
}

export async function runAdvisorDailyCashMovement(input: {
  readonly content: string;
  readonly referenceMonthKey: string | null;
  readonly now?: Date;
  readonly priorState: DailyCashMovementConversationState | null;
  readonly tenantId: string;
  readonly details: Pick<CashRealizedDetailsService, 'getCashRealizedDayDetails'>;
  readonly costCenters: Pick<CostCenterReadRepository, 'listByTenant'>;
}): Promise<RunAdvisorDailyCashMovementResult | null> {
  const now = input.now ?? new Date();
  const resolved = resolveDailyIntent({
    content: input.content,
    referenceMonthKey: input.referenceMonthKey,
    now,
    priorState: input.priorState,
  });
  if (resolved.kind === 'ignore') {
    return null;
  }
  if (resolved.kind === 'limitation') {
    return limitation(resolved.message);
  }
  const { direction, date, costCenterQuery } = resolved;

  const query: AnalyticalQuery = {
    semanticFamily: 'FLOW',
    metric: 'REALIZED_CASH',
    direction,
    period: { kind: 'DAY', date },
    operation: 'MOVEMENTS',
    ...(costCenterQuery === null ? {} : { filters: { costCenterQuery } }),
  };
  const outcome = await executeAnalyticalQuery({
    query,
    runtime: {
      tenantId: input.tenantId,
      now,
      cashRealizedDay: input.details,
      costCenters: input.costCenters,
    },
  });
  if (!outcome.ok || !isFact(outcome.legacyFact)) {
    return limitation('Não consigo detalhar os lançamentos desse dia com segurança.');
  }
  const fact = outcome.legacyFact;
  const answer = composeAdvisorDailyCashMovementAnswer(fact);
  if (fact.status === 'NOT_FOUND' || fact.status === 'AMBIGUOUS') {
    return { answer, state: null };
  }
  return {
    answer,
    state: dailyCashMovementState({
      direction,
      date,
      costCenterQuery,
    }),
  };
}
