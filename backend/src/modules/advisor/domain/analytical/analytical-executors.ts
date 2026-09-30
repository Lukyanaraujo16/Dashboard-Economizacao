import { serializeAdvisorCashMonthComparison } from '../compare-advisor-cash-months.js';
import { serializeAdvisorCashRealizedBreakdown } from '../advisor-cash-realized-breakdown.js';
import { serializeAdvisorCashMovementLines } from '../advisor-cash-movement-lines.js';
import { serializeAdvisorCurrentSnapshotFacts } from '../advisor-current-snapshot-facts.js';
import { buildFinancialFactsContent } from '../financial-facts-text.js';
import type { AnalyticalExecutor, AnalyticalExecutionSuccess } from './analytical-execution-types.js';
import { wrapLegacyAnalyticalResult } from './legacy-analytical-fact.js';
import type { AnalyticalExecutorKey } from './analytical-keys.js';
import type { AnalyticalPeriod } from './analytical-period.js';
import type { AdvisorCivilRangeKind } from '../resolve-advisor-civil-range.js';
import { assessOfficialCounterpartyWinner } from '../load-counterparty-identity-population.js';

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
  const breakdown = await runtime.cashBreakdown.breakdown({
    tenantId: runtime.tenantId,
    monthKey,
    direction: validated.query.direction,
    limit: validated.query.limit,
    now: runtime.now,
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
