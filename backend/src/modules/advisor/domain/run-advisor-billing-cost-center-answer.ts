import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import type { CostCenterReadRepository } from '../../finance/repositories/cost-center-read.repository.js';
import {
  buildBillingCostCenterMonthQuery,
  buildBillingCostCenterSeriesQuery,
} from './analytical/build-analytical-query-from-tool.js';
import { executeAnalyticalQuery } from './analytical/execute-analytical-query.js';
import {
  composeAdvisorBillingCostCenterMonthAnswer,
  composeAdvisorBillingCostCenterSeriesAnswer,
  composeAdvisorBillingWindowLimitAnswer,
} from './compose-advisor-billing-answer.js';
import {
  billingSeriesExceedsOfficialWindow,
  resolveAdvisorBillingIntentForCostCenter,
} from './resolve-advisor-billing-intent.js';

export type AdvisorBillingCostCenterAnswer = {
  readonly answer: string;
  readonly capabilityKey: 'billing.cost_center.month' | 'billing.cost_center.series.months';
  readonly intentKind: 'BILLING_MONTH' | 'BILLING_SERIES';
  readonly factKind: string;
  readonly structuredStatus: 'OK' | 'UNAVAILABLE' | 'NOT_FOUND' | 'AMBIGUOUS';
};

/**
 * Faturamento oficial por centro. Provider não entra.
 * Não faz fallback para REALIZED_CASH INFLOW nem para billing tenant-wide.
 */
export async function runAdvisorBillingCostCenterAnswer(input: {
  readonly content: string;
  readonly tenantId: string;
  readonly monthKey: string;
  readonly costCenterQuery: string;
  readonly now?: Date;
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
  readonly costCenters: Pick<CostCenterReadRepository, 'listByTenant'>;
}): Promise<AdvisorBillingCostCenterAnswer | null> {
  const intent = resolveAdvisorBillingIntentForCostCenter(input.content);
  if (intent === null) {
    return null;
  }
  const costCenterQuery = input.costCenterQuery.trim();
  if (costCenterQuery === '') {
    return null;
  }

  if (intent.kind === 'MONTH_SERIES' && billingSeriesExceedsOfficialWindow(intent.count)) {
    return {
      answer: composeAdvisorBillingWindowLimitAnswer(intent.count),
      capabilityKey: 'billing.cost_center.series.months',
      intentKind: 'BILLING_SERIES',
      factKind: 'BILLING_COST_CENTER_MONTH_SERIES',
      structuredStatus: 'OK',
    };
  }

  const runtime = {
    tenantId: input.tenantId,
    now: input.now,
    planningCashFlow: input.cashFlow,
    costCenters: input.costCenters,
  };

  if (intent.kind === 'MONTH_VALUE') {
    const outcome = await executeAnalyticalQuery({
      runtime,
      query: buildBillingCostCenterMonthQuery({
        monthKey: input.monthKey,
        costCenterQuery,
      }),
    });
    if (!outcome.ok || outcome.capability.key !== 'billing.cost_center.month') {
      return null;
    }
    const answer = composeAdvisorBillingCostCenterMonthAnswer(outcome.legacyFact);
    if (answer === null) {
      return null;
    }
    return {
      answer,
      capabilityKey: 'billing.cost_center.month',
      intentKind: 'BILLING_MONTH',
      factKind: String(outcome.legacyFact.factKind ?? 'BILLING_COST_CENTER_MONTH'),
      structuredStatus: readStructuredStatus(outcome.legacyFact),
    };
  }

  const outcome = await executeAnalyticalQuery({
    runtime,
    query: buildBillingCostCenterSeriesQuery({
      endMonthKey: input.monthKey,
      count: intent.count,
      costCenterQuery,
    }),
  });
  if (!outcome.ok || outcome.capability.key !== 'billing.cost_center.series.months') {
    return null;
  }
  const answer = composeAdvisorBillingCostCenterSeriesAnswer({
    fact: outcome.legacyFact,
    wantsAverage: intent.wantsAverage,
  });
  if (answer === null) {
    return null;
  }
  return {
    answer,
    capabilityKey: 'billing.cost_center.series.months',
    intentKind: 'BILLING_SERIES',
    factKind: String(outcome.legacyFact.factKind ?? 'BILLING_COST_CENTER_MONTH_SERIES'),
    structuredStatus: readStructuredStatus(outcome.legacyFact),
  };
}

function readStructuredStatus(
  fact: Record<string, unknown>,
): AdvisorBillingCostCenterAnswer['structuredStatus'] {
  if (
    fact.status === 'NOT_FOUND' ||
    fact.status === 'AMBIGUOUS' ||
    fact.status === 'UNAVAILABLE' ||
    fact.status === 'OK'
  ) {
    return fact.status;
  }
  return 'OK';
}
