import { serializeAdvisorCashMonthComparison } from '../compare-advisor-cash-months.js';
import { serializeAdvisorCashRealizedBreakdown } from '../advisor-cash-realized-breakdown.js';
import { serializeAdvisorCashMovementLines } from '../advisor-cash-movement-lines.js';
import { serializeAdvisorCurrentSnapshotFacts } from '../advisor-current-snapshot-facts.js';
import { serializeAdvisorPayableTitles } from '../advisor-payable-titles.js';
import { buildFinancialFactsContent } from '../financial-facts-text.js';
import type { AnalyticalExecutor, AnalyticalExecutionSuccess } from './analytical-execution-types.js';
import { wrapLegacyAnalyticalResult } from './legacy-analytical-fact.js';
import type { AnalyticalExecutorKey } from './analytical-keys.js';
import type { AnalyticalPeriod } from './analytical-period.js';
import type { AdvisorCivilRangeKind } from '../resolve-advisor-civil-range.js';
import { assessOfficialCounterpartyWinner } from '../load-counterparty-identity-population.js';
import { loadMonthlyPlanningFact } from '../load-monthly-planning-fact.js';
import type { AdvisorPlanningSubject } from '../resolve-advisor-planning-intent.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import { monthlyBilling } from '../../../analytics/domain/monthly-cash-flow.js';
import { formatCivilDateKey } from '../../../analytics/domain/civil-calendar.js';
import {
  BILLING_SERIES_FACT_KIND,
  listBillingSeriesMonthKeys,
  officialBillingAverage,
} from '../billing-month-series.js';
import { ADVISOR_DAILY_CASH_MOVEMENT_FACT_KIND } from '../compose-advisor-daily-cash-movement-answer.js';
import { resolveCatalogCostCenter } from '../resolve-advisor-daily-cash-movement.js';

function success(input: {
  readonly validated: Parameters<AnalyticalExecutor>[0]['validated'];
  readonly executorKey: AnalyticalExecutorKey;
  readonly legacyFact: Record<string, unknown>;
}): AnalyticalExecutionSuccess {
  return {
    ok: true,
    capability: input.validated.capability,
    executorKey: input.executorKey,
    result: wrapLegacyAnalyticalResult({
      query: input.validated.query,
      capability: input.validated.capability,
      legacyFact: input.legacyFact,
    }),
    legacyFact: input.legacyFact,
  };
}

function requireMonthKey(period: AnalyticalPeriod, side: 'left' | 'right' | 'self'): string {
  if (period.kind === 'MONTH') {
    return period.monthKey;
  }
  if (period.kind === 'COMPARISON') {
    const child = side === 'left' ? period.left : period.right;
    if (child.kind !== 'MONTH') {
      throw new Error('COMPARISON publicado exige MONTH×MONTH.');
    }
    return child.monthKey;
  }
  throw new Error(`period.kind=${period.kind} incompatível com executor mensal.`);
}

function periodToNominalArgs(period: AnalyticalPeriod): {
  readonly monthKey?: string;
  readonly periodKind?: AdvisorCivilRangeKind;
  readonly year?: number;
} {
  if (period.kind === 'MONTH') {
    return { monthKey: period.monthKey };
  }
  if (period.kind === 'YTD') {
    return { periodKind: 'YTD', year: period.year };
  }
  if (period.kind === 'YEAR') {
    return { periodKind: 'YEAR', year: period.year };
  }
  throw new Error(`period.kind=${period.kind} incompatível com nominal.`);
}

export const executeCompareCashMonths: AnalyticalExecutor = async ({
  validated,
  runtime,
}) => {
  if (runtime.cashComparison === undefined) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:cashComparison');
  }
  const monthKey = requireMonthKey(validated.query.period, 'right');
  const comparisonMonthKey = requireMonthKey(validated.query.period, 'left');
  const comparison = await runtime.cashComparison.compare({
    tenantId: runtime.tenantId,
    monthKey,
    comparisonMonthKey,
    now: runtime.now,
  });
  return success({
    validated,
    executorKey: 'compareCashMonths',
    legacyFact: serializeAdvisorCashMonthComparison(comparison) as Record<string, unknown>,
  });
};

export const executeRealizedCashCategoryBreakdown: AnalyticalExecutor = async ({
  validated,
  runtime,
}) => {
  if (runtime.cashBreakdown === undefined) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:cashBreakdown');
  }
  if (validated.query.direction !== 'INFLOW' && validated.query.direction !== 'OUTFLOW') {
    throw new Error('direction obrigatória para breakdown.');
  }
  const monthKey = requireMonthKey(validated.query.period, 'self');
  const costCenterQuery = validated.query.filters?.costCenterQuery?.trim();
  const breakdown = await runtime.cashBreakdown.breakdown({
    tenantId: runtime.tenantId,
    monthKey,
    direction: validated.query.direction,
    limit: validated.query.limit,
    now: runtime.now,
    ...(costCenterQuery !== undefined && costCenterQuery !== ''
      ? { costCenterQuery }
      : {}),
  });
  return success({
    validated,
    executorKey: 'realizedCashCategoryBreakdown',
    legacyFact: serializeAdvisorCashRealizedBreakdown(breakdown) as Record<string, unknown>,
  });
};

export const executeRealizedCashMovements: AnalyticalExecutor = async ({
  validated,
  runtime,
  hints,
}) => {
  if (runtime.cashMovements === undefined) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:cashMovements');
  }
  if (validated.query.direction !== 'INFLOW' && validated.query.direction !== 'OUTFLOW') {
    throw new Error('direction obrigatória para movements.');
  }
  const monthKey = requireMonthKey(validated.query.period, 'self');
  const window = await runtime.cashMovements.list({
    tenantId: runtime.tenantId,
    monthKey,
    direction: validated.query.direction,
    sort: hints?.movementSort ?? 'AMOUNT_DESC',
    limit: validated.query.limit,
    now: runtime.now,
  });
  if (window.status === 'UNAVAILABLE') {
    throw new Error('ANALYTICAL_TOOL_FAILED:movements');
  }
  return success({
    validated,
    executorKey: 'realizedCashMovements',
    legacyFact: serializeAdvisorCashMovementLines(window) as Record<string, unknown>,
  });
};

export const executeRealizedCashCounterparty: AnalyticalExecutor = async ({
  validated,
  runtime,
}) => {
  const partyProfile = validated.query.filters?.partyProfile;
  if (partyProfile === 'CUSTOMER' || partyProfile === 'SUPPLIER') {
    if (runtime.counterpartyIdentity === undefined) {
      throw new Error('EXECUTOR_DEPENDENCY_MISSING:counterpartyIdentity');
    }
    const assessment = await assessOfficialCounterpartyWinner({
      service: runtime.counterpartyIdentity,
      tenantId: runtime.tenantId,
      query: validated.query,
      now: runtime.now,
    });
    return {
      ok: true,
      capability: validated.capability,
      executorKey: 'realizedCashCounterparty',
      result: assessment.result,
      legacyFact: {
        kind: 'COUNTERPARTY_IDENTITY_QUALITY',
        answer: assessment.answer,
        decision: assessment.decision,
        reasonCode: assessment.reasonCode,
        winnerGuaranteed: assessment.quality.winnerGuaranteed,
        periodCoverage: assessment.quality.periodCoverage,
        focusDisplayName: assessment.focusDisplayName,
        rows: assessment.rows,
      },
    };
  }
  if (runtime.cashNominal === undefined) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:cashNominal');
  }
  const periodArgs = periodToNominalArgs(validated.query.period);
  const categoryReference = validated.query.filters?.categoryReference;
  const op = validated.query.operation;

  if (op === 'COMPARE') {
    const monthKey = requireMonthKey(validated.query.period, 'right');
    const comparisonMonthKey = requireMonthKey(validated.query.period, 'left');
    const legacyFact = await runtime.cashNominal.compare({
      tenantId: runtime.tenantId,
      monthKey,
      comparisonMonthKey,
      categoryReference,
      entityQuery: validated.query.identity?.query,
      limit: validated.query.limit,
      now: runtime.now,
    });
    return success({
      validated,
      executorKey: 'realizedCashCounterparty',
      legacyFact,
    });
  }

  if (op === 'LOOKUP') {
    const legacyFact = await runtime.cashNominal.lookup({
      tenantId: runtime.tenantId,
      ...periodArgs,
      categoryReference,
      entityQuery: validated.query.identity!.query,
      now: runtime.now,
    });
    return success({
      validated,
      executorKey: 'realizedCashCounterparty',
      legacyFact,
    });
  }

  const legacyFact = await runtime.cashNominal.rank({
    tenantId: runtime.tenantId,
    ...periodArgs,
    categoryReference: categoryReference!,
    limit: validated.query.limit,
    now: runtime.now,
  });
  return success({
    validated,
    executorKey: 'realizedCashCounterparty',
    legacyFact,
  });
};

export const executeRealizedCashCostCenter: AnalyticalExecutor = async ({
  validated,
  runtime,
}) => {
  if (runtime.cashCostCenter === undefined) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:cashCostCenter');
  }
  if (validated.query.metric === 'CASH_RESULT') {
    if (validated.query.direction !== 'NET' || validated.query.operation !== 'LOOKUP') {
      throw new Error('cash result de centro exige LOOKUP NET.');
    }
    const legacyFact = await runtime.cashCostCenter.cashResult({
      tenantId: runtime.tenantId,
      monthKey: requireMonthKey(validated.query.period, 'self'),
      costCenterQuery: validated.query.filters?.costCenterQuery ?? '',
      now: runtime.now,
    });
    return success({
      validated,
      executorKey: 'realizedCashCostCenter',
      legacyFact,
    });
  }
  if (validated.query.direction !== 'INFLOW' && validated.query.direction !== 'OUTFLOW') {
    throw new Error('direction obrigatória para cost center.');
  }
  const direction = validated.query.direction;
  const op = validated.query.operation;
  const costCenterQuery = validated.query.filters?.costCenterQuery;

  if (op === 'COMPARE') {
    const legacyFact = await runtime.cashCostCenter.compare({
      tenantId: runtime.tenantId,
      monthKey: requireMonthKey(validated.query.period, 'right'),
      comparisonMonthKey: requireMonthKey(validated.query.period, 'left'),
      direction,
      costCenterQuery: costCenterQuery!,
      now: runtime.now,
    });
    return success({
      validated,
      executorKey: 'realizedCashCostCenter',
      legacyFact,
    });
  }

  if (op === 'LOOKUP') {
    const legacyFact = await runtime.cashCostCenter.lookup({
      tenantId: runtime.tenantId,
      monthKey: requireMonthKey(validated.query.period, 'self'),
      direction,
      costCenterQuery: costCenterQuery!,
      now: runtime.now,
    });
    return success({
      validated,
      executorKey: 'realizedCashCostCenter',
      legacyFact,
    });
  }

  if (op === 'MOVEMENTS') {
    const legacyFact = await runtime.cashCostCenter.movementLines({
      tenantId: runtime.tenantId,
      monthKey: requireMonthKey(validated.query.period, 'self'),
      direction,
      costCenterQuery: costCenterQuery!,
      limit: validated.query.limit,
      now: runtime.now,
    });
    return success({
      validated,
      executorKey: 'realizedCashCostCenter',
      legacyFact,
    });
  }

  const legacyFact = await runtime.cashCostCenter.rank({
    tenantId: runtime.tenantId,
    monthKey: requireMonthKey(validated.query.period, 'self'),
    direction,
    limit: validated.query.limit,
    now: runtime.now,
  });
  return success({
    validated,
    executorKey: 'realizedCashCostCenter',
    legacyFact,
  });
};

export const executeCurrentSnapshot: AnalyticalExecutor = async ({ validated, runtime }) => {
  const snapshot = runtime.financialStockSnapshot;
  if (snapshot == null) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:financialStockSnapshot');
  }
  return success({
    validated,
    executorKey: 'currentSnapshot',
    legacyFact: serializeAdvisorCurrentSnapshotFacts(snapshot) as unknown as Record<
      string,
      unknown
    >,
  });
};

export const executeMonthlyPlanning: AnalyticalExecutor = async ({ validated, runtime }) => {
  if (
    runtime.planningCashFlow === undefined ||
    runtime.revenueGoals === undefined ||
    runtime.expenseCeilings === undefined
  ) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:monthlyPlanning');
  }
  const monthKey = requireMonthKey(validated.query.period, 'self');
  const subject: AdvisorPlanningSubject =
    validated.query.metric === 'EXPENSE_CEILING' ? 'EXPENSE_CEILING' : 'REVENUE_GOAL';
  const legacyFact = await loadMonthlyPlanningFact({
    tenantId: runtime.tenantId,
    monthKey,
    now: runtime.now,
    subject,
    services: {
      cashFlow: runtime.planningCashFlow,
      revenueGoals: runtime.revenueGoals,
      expenseCeilings: runtime.expenseCeilings,
    },
  });
  return success({
    validated,
    executorKey: 'monthlyPlanning',
    legacyFact,
  });
};

export const executeFinancialFactsMonth: AnalyticalExecutor = async ({
  validated,
  runtime,
}) => {
  const monthKey =
    validated.query.period.kind === 'MONTH'
      ? validated.query.period.monthKey
      : (() => {
          throw new Error('financialFactsMonth exige MONTH.');
        })();
  const content = buildFinancialFactsContent({
    monthKey,
    flow: runtime.monthlyCashFlow ?? null,
    snapshot: runtime.financialStockSnapshot ?? null,
  });
  return success({
    validated,
    executorKey: 'financialFactsMonth',
    legacyFact: {
      status: 'OK',
      surface: 'FINANCIAL_FACTS',
      monthKey,
      content,
    },
  });
};

export const executeBillingSeriesMonths: AnalyticalExecutor = async ({
  validated,
  runtime,
}) => {
  if (runtime.planningCashFlow === undefined) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:planningCashFlow');
  }
  if (validated.query.period.kind !== 'MONTH_WINDOW') {
    throw new Error('billingSeriesMonths exige MONTH_WINDOW.');
  }
  const { endMonthKey, count } = validated.query.period;
  const monthKeys = listBillingSeriesMonthKeys(endMonthKey, count);
  const months = [];
  for (const monthKey of monthKeys) {
    const flow = await runtime.planningCashFlow.getMonthlyCashFlow({
      tenantId: runtime.tenantId,
      monthKey,
      now: runtime.now,
    });
    const billing = monthlyBilling(flow);
    months.push({
      monthKey,
      billing: billing === null ? null : billing.toString(),
      available: billing !== null,
    });
  }
  const availableValues = months.flatMap((month) =>
    month.billing === null ? [] : [new Prisma.Decimal(month.billing)],
  );
  const complete = availableValues.length === months.length;
  return success({
    validated,
    executorKey: 'billingSeriesMonths',
    legacyFact: {
      factKind: BILLING_SERIES_FACT_KIND,
      status: 'OK',
      endMonthKey,
      requestedCount: count,
      validCount: availableValues.length,
      complete,
      average: complete ? officialBillingAverage(availableValues).toString() : null,
      months,
    },
  });
};

export const executeRealizedCashDayMovements: AnalyticalExecutor = async ({
  validated,
  runtime,
}) => {
  if (runtime.cashRealizedDay === undefined) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:cashRealizedDay');
  }
  if (validated.query.period.kind !== 'DAY') {
    throw new Error('realizedCashDayMovements exige period DAY.');
  }
  if (validated.query.direction !== 'INFLOW' && validated.query.direction !== 'OUTFLOW') {
    throw new Error('direction obrigatória para movimentos do dia.');
  }
  const date = validated.query.period.date;
  const direction = validated.query.direction;
  const costCenterQuery = validated.query.filters?.costCenterQuery?.trim() ?? '';
  let costCenterId: string | undefined;
  let costCenterName: string | null = null;
  if (costCenterQuery !== '') {
    if (runtime.costCenters === undefined) {
      throw new Error('EXECUTOR_DEPENDENCY_MISSING:costCenters');
    }
    const centers = await runtime.costCenters.listByTenant(runtime.tenantId);
    const resolved = resolveCatalogCostCenter(centers, costCenterQuery);
    if (resolved.status !== 'FOUND') {
      return success({
        validated,
        executorKey: 'realizedCashDayMovements',
        legacyFact: {
          kind: ADVISOR_DAILY_CASH_MOVEMENT_FACT_KIND,
          status: resolved.status,
          date,
          direction,
          costCenterName: null,
          total: null,
          returnedSum: null,
          difference: null,
          hasMore: false,
          items: [],
        },
      });
    }
    costCenterId = resolved.id;
    costCenterName = resolved.name;
  }

  const details = await runtime.cashRealizedDay.getCashRealizedDayDetails({
    tenantId: runtime.tenantId,
    date,
    direction: direction === 'INFLOW' ? 'inflows' : 'outflows',
    ...(costCenterId === undefined ? {} : { costCenterId, costCenterLabel: costCenterName }),
    now: runtime.now,
  });
  return success({
    validated,
    executorKey: 'realizedCashDayMovements',
    legacyFact: {
      kind: ADVISOR_DAILY_CASH_MOVEMENT_FACT_KIND,
      status: details.completeness,
      date: details.date,
      direction,
      costCenterName,
      total: details.total?.toString() ?? null,
      returnedSum: details.returnedSum?.toString() ?? null,
      difference: details.difference?.toString() ?? null,
      hasMore: details.hasMore,
      items: details.items.map((item) => ({
        displayLabel: item.displayLabel,
        description: item.description,
        categoryName: item.categoryNames[0] ?? null,
        amount: item.attributedAmount.toString(),
        costCenterLabel: item.costCenterLabel,
        occurredOn: formatCivilDateKey(item.occurredOn),
      })),
    },
  });
};

export const executePayableTitles: AnalyticalExecutor = async ({
  validated,
  runtime,
  hints,
}) => {
  if (runtime.payableTitles === undefined) {
    throw new Error('EXECUTOR_DEPENDENCY_MISSING:payableTitles');
  }
  const monthKey = requireMonthKey(validated.query.period, 'self');
  const titleStatus = hints?.payableTitleStatus ?? 'OPEN';
  const ordering =
    hints?.payableTitleOrdering ??
    (validated.query.operation === 'MOVEMENTS' ? 'DUE_DATE_ASC' : 'VALUE_DESC');
  const costCenterQuery = validated.query.filters?.costCenterQuery;
  const window = await runtime.payableTitles.list({
    tenantId: runtime.tenantId,
    monthKey,
    status: titleStatus,
    ordering,
    ...(validated.query.limit !== undefined ? { limit: validated.query.limit } : {}),
    ...(costCenterQuery !== undefined ? { costCenterQuery } : {}),
    now: runtime.now,
  });
  return success({
    validated,
    executorKey: 'payableTitles',
    legacyFact: serializeAdvisorPayableTitles(window),
  });
};
