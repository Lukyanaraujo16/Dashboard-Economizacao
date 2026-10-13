/**
 * Executa LastAnalyticalQuery (após patch) via registry/executors oficiais.
 * Sem SQL livre. Sem provider.
 */
import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import type { AdvisorAnalyticalToolExecutor } from './advisor-analytical-tools.js';
import {
  CASH_COST_CENTER_LOOKUP_TOOL_NAME,
  CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
} from './advisor-cost-center-dimension.js';
import type { AnalyticalQuery } from './analytical/analytical-query.js';
import { executeAnalyticalQuery } from './analytical/execute-analytical-query.js';
import { validateAnalyticalCapability } from './analytical/validate-analytical-capability.js';
import {
  composeAdvisorBillingCostCenterMonthAnswer,
  composeAdvisorBillingCostCenterSeriesAnswer,
  composeAdvisorBillingMonthAnswer,
  composeAdvisorBillingSeriesAnswer,
} from './compose-advisor-billing-answer.js';
import { composeAdvisorFactualAnswer } from './compose-advisor-factual-answer.js';
import {
  buildLastAnalyticalQuery,
  isLastAnalyticalQueryCoveredKey,
  type LastAnalyticalQuery,
} from './last-analytical-query.js';

export type AnalyticalContinuityAnswer = {
  readonly answer: string;
  readonly capabilityKey: string;
  readonly intentKind: string;
  readonly factKind: string;
  readonly structuredStatus: string;
  readonly nextState: LastAnalyticalQuery | null;
  readonly query: AnalyticalQuery;
};

export async function runAnalyticalContinuityAnswer(input: {
  readonly query: AnalyticalQuery;
  readonly tenantId: string;
  readonly now?: Date;
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  readonly costCenters?: Pick<CostCenterReadRepository, 'listByTenant'>;
  readonly analyticalTools?: AdvisorAnalyticalToolExecutor;
}): Promise<AnalyticalContinuityAnswer | null> {
  const validation = validateAnalyticalCapability(input.query);
  if (!validation.ok) {
    return {
      answer: `Não consigo atender essa continuação: ${validation.message}`,
      capabilityKey: 'DENIED',
      intentKind: 'FACTUAL_LIMITATION',
      factKind: 'CONTINUITY_DENIED',
      structuredStatus: 'DENIED',
      nextState: null,
      query: input.query,
    };
  }
  const capabilityKey = validation.capability.key;

  if (capabilityKey === 'billing.value.month') {
    return runBillingMonth(input, capabilityKey);
  }
  if (capabilityKey === 'billing.series.months') {
    return runBillingSeries(input, capabilityKey);
  }
  if (
    capabilityKey === 'billing.cost_center.month' ||
    capabilityKey === 'billing.cost_center.series.months'
  ) {
    if (input.costCenters === undefined) {
      return limitation(
        input.query,
        'Catálogo de centros indisponível para continuar o faturamento por centro.',
      );
    }
    return runBillingCostCenter(input, capabilityKey, input.costCenters);
  }
  if (capabilityKey === 'realized_cash.cost_center.month.movements') {
    if (input.analyticalTools === undefined) {
      return limitation(
        input.query,
        'Ferramenta de movimentos indisponível para continuar esta consulta.',
      );
    }
    return runCostCenterMovements(input, capabilityKey, input.analyticalTools);
  }
  if (capabilityKey === 'realized_cash.cost_center.month.lookup') {
    if (input.analyticalTools === undefined) {
      return limitation(
        input.query,
        'Ferramenta de lookup de centro indisponível para continuar esta consulta.',
      );
    }
    return runCostCenterLookup(input, capabilityKey, input.analyticalTools);
  }
  if (capabilityKey === 'realized_cash.value.month') {
    return runRealizedCashValueMonth(input, capabilityKey);
  }

  return limitation(
    input.query,
    `A capability ${capabilityKey} ainda não está coberta pela continuidade analítica.`,
  );
}

async function runBillingMonth(
  input: {
    readonly query: AnalyticalQuery;
    readonly tenantId: string;
    readonly now?: Date;
    readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  },
  capabilityKey: string,
): Promise<AnalyticalContinuityAnswer | null> {
  const monthKey =
    input.query.period.kind === 'MONTH' ? input.query.period.monthKey : null;
  if (monthKey === null) {
    return null;
  }
  const flow = await input.cashFlow.getMonthlyCashFlow({
    tenantId: input.tenantId,
    monthKey,
    now: input.now,
  });
  const outcome = await executeAnalyticalQuery({
    runtime: {
      tenantId: input.tenantId,
      now: input.now,
      monthlyCashFlow: flow,
    },
    query: input.query,
  });
  if (!outcome.ok) {
    return null;
  }
  const facts =
    typeof outcome.legacyFact.content === 'string' ? outcome.legacyFact.content : null;
  const answer = facts === null ? null : composeAdvisorBillingMonthAnswer(facts);
  if (answer === null) {
    return null;
  }
  return finalize({
    answer,
    query: input.query,
    capabilityKey,
    intentKind: 'BILLING_MONTH',
    factKind: 'FINANCIAL_FACTS',
    structuredStatus: 'OK',
  });
}

async function runBillingSeries(
  input: {
    readonly query: AnalyticalQuery;
    readonly tenantId: string;
    readonly now?: Date;
    readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  },
  capabilityKey: string,
): Promise<AnalyticalContinuityAnswer | null> {
  const outcome = await executeAnalyticalQuery({
    runtime: {
      tenantId: input.tenantId,
      now: input.now,
      planningCashFlow: input.cashFlow,
    },
    query: input.query,
  });
  if (!outcome.ok) {
    return null;
  }
  const answer = composeAdvisorBillingSeriesAnswer({
    fact: outcome.legacyFact,
    wantsAverage: false,
  });
  if (answer === null) {
    return null;
  }
  return finalize({
    answer,
    query: input.query,
    capabilityKey,
    intentKind: 'BILLING_SERIES',
    factKind: String(outcome.legacyFact.factKind ?? 'BILLING_MONTH_SERIES'),
    structuredStatus: 'OK',
  });
}

async function runBillingCostCenter(
  input: {
    readonly query: AnalyticalQuery;
    readonly tenantId: string;
    readonly now?: Date;
    readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  },
  capabilityKey: string,
  costCenters: Pick<CostCenterReadRepository, 'listByTenant'>,
): Promise<AnalyticalContinuityAnswer | null> {
  const outcome = await executeAnalyticalQuery({
    runtime: {
      tenantId: input.tenantId,
      now: input.now,
      planningCashFlow: input.cashFlow,
      costCenters,
    },
    query: input.query,
  });
  if (!outcome.ok) {
    return null;
  }
  const status = readStatus(outcome.legacyFact);
  const answer =
    capabilityKey === 'billing.cost_center.series.months'
      ? composeAdvisorBillingCostCenterSeriesAnswer({
          fact: outcome.legacyFact,
          wantsAverage: false,
        })
      : composeAdvisorBillingCostCenterMonthAnswer(outcome.legacyFact);
  if (answer === null) {
    return null;
  }
  return finalize({
    answer,
    query: input.query,
    capabilityKey,
    intentKind:
      capabilityKey === 'billing.cost_center.series.months'
        ? 'BILLING_SERIES'
        : 'BILLING_MONTH',
    factKind: String(outcome.legacyFact.factKind ?? 'BILLING_COST_CENTER'),
    structuredStatus: status,
  });
}

async function runRealizedCashValueMonth(
  input: {
    readonly query: AnalyticalQuery;
    readonly tenantId: string;
    readonly now?: Date;
    readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  },
  capabilityKey: string,
): Promise<AnalyticalContinuityAnswer | null> {
  const monthKey =
    input.query.period.kind === 'MONTH' ? input.query.period.monthKey : null;
  if (monthKey === null) {
    return null;
  }
  const flow = await input.cashFlow.getMonthlyCashFlow({
    tenantId: input.tenantId,
    monthKey,
    now: input.now,
  });
  const outcome = await executeAnalyticalQuery({
    runtime: {
      tenantId: input.tenantId,
      now: input.now,
      monthlyCashFlow: flow,
    },
    query: input.query,
  });
  if (!outcome.ok) {
    return null;
  }
  const content =
    typeof outcome.legacyFact.content === 'string' ? outcome.legacyFact.content : null;
  if (content === null) {
    return null;
  }
  const direction = input.query.direction ?? 'INFLOW';
  const lineKey =
    direction === 'OUTFLOW' ? 'cash.realized.outflows' : 'cash.realized.inflows';
  const amount = readFactLine(content, lineKey);
  const label =
    direction === 'OUTFLOW'
      ? 'Saídas realizadas de caixa'
      : 'Entradas realizadas de caixa';
  const answer =
    amount === null
      ? `Não há ${label.toLowerCase()} oficiais para ${monthKey}.`
      : `${label} em ${monthKey}: ${amount}.`;
  return finalize({
    answer,
    query: input.query,
    capabilityKey,
    intentKind: 'REALIZED_CASH_VALUE',
    factKind: 'FINANCIAL_FACTS',
    structuredStatus: amount === null ? 'EMPTY' : 'OK',
  });
}

async function runCostCenterLookup(
  input: {
    readonly query: AnalyticalQuery;
    readonly tenantId: string;
    readonly now?: Date;
  },
  capabilityKey: string,
  analyticalTools: AdvisorAnalyticalToolExecutor,
): Promise<AnalyticalContinuityAnswer | null> {
  const monthKey =
    input.query.period.kind === 'MONTH' ? input.query.period.monthKey : null;
  const costCenterQuery = input.query.filters?.costCenterQuery?.trim() ?? '';
  if (monthKey === null || costCenterQuery === '') {
    return null;
  }
  const direction = input.query.direction ?? 'INFLOW';
  const result = await analyticalTools.execute({
    tenantId: input.tenantId,
    resolvedMonthKey: monthKey,
    now: input.now,
    call: {
      id: 'continuity-cc-lookup',
      name: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
      arguments: {
        monthKey,
        direction,
        costCenterQuery,
      },
    },
  });
  const composed = composeAdvisorFactualAnswer({
    content: '',
    anaphora: 'NONE',
    toolName: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
    toolOk: result.ok,
    toolContent: result.content,
  });
  if (composed.answer === null) {
    let status = 'FAILED';
    try {
      const parsed = JSON.parse(result.content) as Record<string, unknown>;
      if (typeof parsed.status === 'string') {
        status = parsed.status;
      }
    } catch {
      status = result.ok ? 'OK' : 'FAILED';
    }
    if (status === 'NOT_FOUND' || status === 'AMBIGUOUS' || status === 'UNAVAILABLE') {
      return finalize({
        answer:
          status === 'AMBIGUOUS'
            ? 'Há mais de um centro de custo correspondente. Especifique o nome ou o código.'
            : status === 'NOT_FOUND'
              ? 'Não encontrei esse centro de custo.'
              : 'Não há rateio oficial suficiente para essa consulta de caixa por centro.',
        query: input.query,
        capabilityKey,
        intentKind: 'FACTUAL_LIMITATION',
        factKind: 'COST_CENTER_LOOKUP',
        structuredStatus: status,
      });
    }
    return null;
  }
  let status = 'OK';
  try {
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    if (typeof parsed.status === 'string') {
      status = parsed.status;
    }
  } catch {
    status = result.ok ? 'OK' : 'FAILED';
  }
  return finalize({
    answer: composed.answer,
    query: input.query,
    capabilityKey,
    intentKind: composed.meta?.intentKind ?? 'COST_CENTER_LOOKUP',
    factKind: 'COST_CENTER_LOOKUP',
    structuredStatus: status,
  });
}

async function runCostCenterMovements(
  input: {
    readonly query: AnalyticalQuery;
    readonly tenantId: string;
    readonly now?: Date;
  },
  capabilityKey: string,
  analyticalTools: AdvisorAnalyticalToolExecutor,
): Promise<AnalyticalContinuityAnswer | null> {
  const monthKey =
    input.query.period.kind === 'MONTH' ? input.query.period.monthKey : null;
  const costCenterQuery = input.query.filters?.costCenterQuery?.trim() ?? '';
  if (monthKey === null || costCenterQuery === '') {
    return null;
  }
  const direction = input.query.direction ?? 'OUTFLOW';
  const result = await analyticalTools.execute({
    tenantId: input.tenantId,
    resolvedMonthKey: monthKey,
    now: input.now,
    call: {
      id: 'continuity-cc-movements',
      name: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
      arguments: {
        monthKey,
        direction,
        costCenterQuery,
        ...(input.query.limit !== undefined ? { limit: input.query.limit } : {}),
      },
    },
  });
  const composed = composeAdvisorFactualAnswer({
    content: '',
    anaphora: 'NONE',
    toolName: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
    toolOk: result.ok,
    toolContent: result.content,
  });
  if (composed.answer === null) {
    return null;
  }
  let status = 'OK';
  try {
    const parsed = JSON.parse(result.content) as Record<string, unknown>;
    if (typeof parsed.status === 'string') {
      status = parsed.status;
    }
  } catch {
    status = result.ok ? 'OK' : 'FAILED';
  }
  return finalize({
    answer: composed.answer,
    query: input.query,
    capabilityKey,
    intentKind: composed.meta?.intentKind ?? 'COST_CENTER_MOVEMENT_LINES',
    factKind: 'COST_CENTER_OUTFLOW_MOVEMENTS',
    structuredStatus: status,
  });
}

function finalize(input: {
  readonly answer: string;
  readonly query: AnalyticalQuery;
  readonly capabilityKey: string;
  readonly intentKind: string;
  readonly factKind: string;
  readonly structuredStatus: string;
}): AnalyticalContinuityAnswer {
  const nextState =
    isLastAnalyticalQueryCoveredKey(input.capabilityKey) &&
    (input.structuredStatus === 'OK' ||
      input.structuredStatus === 'EMPTY' ||
      input.structuredStatus === 'EMPTY_RESULT')
      ? buildLastAnalyticalQuery({
          query: input.query,
          capabilityKey: input.capabilityKey,
          executionStatus: input.structuredStatus,
        })
      : null;
  return {
    answer: input.answer,
    capabilityKey: input.capabilityKey,
    intentKind: input.intentKind,
    factKind: input.factKind,
    structuredStatus: input.structuredStatus,
    nextState,
    query: input.query,
  };
}

function limitation(
  query: AnalyticalQuery,
  message: string,
): AnalyticalContinuityAnswer {
  return {
    answer: message,
    capabilityKey: 'DENIED',
    intentKind: 'FACTUAL_LIMITATION',
    factKind: 'CONTINUITY_DENIED',
    structuredStatus: 'DENIED',
    nextState: null,
    query,
  };
}

function readStatus(fact: Record<string, unknown>): string {
  if (typeof fact.status === 'string') {
    return fact.status;
  }
  return 'OK';
}

function readFactLine(content: string, key: string): string | null {
  const match = new RegExp(`(?:^|\\n)${key}:\\s*(.+)`, 'i').exec(content);
  const value = match?.[1]?.trim();
  return value === undefined || value === '' || value === 'null' ? null : value;
}
