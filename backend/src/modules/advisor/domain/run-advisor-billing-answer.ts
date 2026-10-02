import type { MonthlyCashFlowService } from '../../analytics/services/monthly-cash-flow.service.js';
import { executeAnalyticalQuery } from './analytical/execute-analytical-query.js';
import {
  composeAdvisorBillingMonthAnswer,
  composeAdvisorBillingSeriesAnswer,
  composeAdvisorBillingWindowLimitAnswer,
} from './compose-advisor-billing-answer.js';
import {
  billingSeriesExceedsOfficialWindow,
  resolveAdvisorBillingIntent,
} from './resolve-advisor-billing-intent.js';

export type AdvisorBillingAnswer = {
  readonly answer: string;
  readonly capabilityKey: 'billing.value.month' | 'billing.series.months';
  readonly intentKind: 'BILLING_MONTH' | 'BILLING_SERIES';
  readonly factKind: string;
};

/**
 * Resposta fechada de faturamento. O provider não entra.
 * Mês único lê `billing.value.month`. Série lê `billing.series.months`.
 */
export async function runAdvisorBillingAnswer(input: {
  readonly content: string;
  readonly tenantId: string;
  readonly monthKey: string;
  readonly now?: Date;
  readonly cashFlow: Pick<MonthlyCashFlowService, 'getMonthlyCashFlow'>;
}): Promise<AdvisorBillingAnswer | null> {
  const intent = resolveAdvisorBillingIntent(input.content);
  if (intent === null) {
    return null;
  }
  if (intent.kind === 'MONTH_SERIES' && billingSeriesExceedsOfficialWindow(intent.count)) {
    return {
      answer: composeAdvisorBillingWindowLimitAnswer(intent.count),
      capabilityKey: 'billing.series.months',
      intentKind: 'BILLING_SERIES',
      factKind: 'BILLING_MONTH_SERIES',
    };
  }
  if (intent.kind === 'MONTH_VALUE') {
    const flow = await input.cashFlow.getMonthlyCashFlow({
      tenantId: input.tenantId,
      monthKey: input.monthKey,
      now: input.now,
    });
    const outcome = await executeAnalyticalQuery({
      runtime: {
        tenantId: input.tenantId,
        now: input.now,
        monthlyCashFlow: flow,
      },
      query: {
        semanticFamily: 'BILLING',
        metric: 'BILLING',
        period: { kind: 'MONTH', monthKey: input.monthKey },
        operation: 'VALUE',
      },
    });
    if (!outcome.ok || outcome.capability.key !== 'billing.value.month') {
      return null;
    }
    const facts = typeof outcome.legacyFact.content === 'string' ? outcome.legacyFact.content : null;
    const answer = facts === null ? null : composeAdvisorBillingMonthAnswer(facts);
    if (answer === null) {
      return null;
    }
    return {
      answer,
      capabilityKey: 'billing.value.month',
      intentKind: 'BILLING_MONTH',
      factKind: 'FINANCIAL_FACTS',
    };
  }

  const outcome = await executeAnalyticalQuery({
    runtime: {
      tenantId: input.tenantId,
      now: input.now,
      planningCashFlow: input.cashFlow,
    },
    query: {
      semanticFamily: 'BILLING',
      metric: 'BILLING',
      period: {
        kind: 'MONTH_WINDOW',
        endMonthKey: input.monthKey,
        count: intent.count,
      },
      operation: 'VALUE',
    },
  });
  if (!outcome.ok || outcome.capability.key !== 'billing.series.months') {
    return null;
  }
  const answer = composeAdvisorBillingSeriesAnswer({
    fact: outcome.legacyFact,
    wantsAverage: intent.wantsAverage,
  });
  if (answer === null) {
    return null;
  }
  return {
    answer,
    capabilityKey: 'billing.series.months',
    intentKind: 'BILLING_SERIES',
    factKind: 'BILLING_MONTH_SERIES',
  };
}
