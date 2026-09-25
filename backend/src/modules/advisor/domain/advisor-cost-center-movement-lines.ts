import { Prisma } from '../../../generated/prisma/client.js';
import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
  clampAdvisorDrilldownLimit,
  type AdvisorCashDirection,
} from './advisor-cash-realized-breakdown.js';
import { clipAdvisorToolText } from './advisor-cash-movement-lines.js';
import { advisorCostCenterMovementFactContract } from './advisor-cost-center-fact-contract.js';
import type {
  AdvisorCostCenterAggregation,
  AdvisorCostCenterAttributedShare,
  AdvisorCostCenterCatalogItem,
} from './advisor-cost-center-dimension.js';
import { identifiedCenterOrZero } from './advisor-cost-center-dimension.js';
import { formatAdvisorPercent } from './compare-advisor-cash-months.js';
import {
  ADVISOR_CASH_INFLOW_MEANING,
  ADVISOR_CASH_OUTFLOW_MEANING,
  formatAdvisorCivilDate,
  formatAdvisorFinancialAmount,
} from './financial-facts-text.js';

const ZERO = new Prisma.Decimal(0);

export type AdvisorCostCenterMovementLine = {
  readonly occurredOn: string;
  readonly attributedAmount: Prisma.Decimal;
  readonly originalSettlementAmount: Prisma.Decimal;
  readonly description: string | null;
  readonly partyName: string | null;
  readonly categoryNames: readonly string[];
  readonly settlementKey: string;
};

export type AdvisorCostCenterMovementWindow = {
  readonly status: 'OK' | 'EMPTY_RESULT' | 'NOT_FOUND' | 'AMBIGUOUS' | 'UNAVAILABLE';
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly costCenter: {
    readonly costCenterId: string;
    readonly name: string;
    readonly code: string | null;
  } | null;
  readonly costCenterAmount: Prisma.Decimal;
  readonly populationAmount: Prisma.Decimal;
  readonly identifiedAmount: Prisma.Decimal;
  readonly unidentifiedAmount: Prisma.Decimal;
  readonly coveragePercentage: Prisma.Decimal | null;
  readonly movementPopulationAmount: Prisma.Decimal;
  readonly requestedLimit: number;
  readonly effectiveLimit: number;
  readonly returnedCount: number;
  readonly hasMore: boolean;
  readonly lines: readonly AdvisorCostCenterMovementLine[];
  readonly candidates?: readonly AdvisorCostCenterCatalogItem[];
};

export type AdvisorCostCenterMovementSourceLine = {
  readonly share: AdvisorCostCenterAttributedShare;
  readonly description: string | null;
  readonly partyName: string | null;
  readonly categoryNames: readonly string[];
};

export function listAdvisorCostCenterMovementLines(input: {
  readonly aggregation: AdvisorCostCenterAggregation;
  readonly shares: readonly AdvisorCostCenterAttributedShare[];
  readonly catalogItem: AdvisorCostCenterCatalogItem;
  readonly sourceLines: readonly AdvisorCostCenterMovementSourceLine[];
  readonly limit?: number;
}): AdvisorCostCenterMovementWindow {
  const limits = clampAdvisorDrilldownLimit(input.limit);
  const center = identifiedCenterOrZero(
    input.aggregation,
    input.catalogItem.id,
    input.catalogItem,
  );
  const ofCenter = input.sourceLines.filter(
    (row) => row.share.costCenterId === input.catalogItem.id,
  );
  const movementPopulationAmount = ofCenter.reduce(
    (sum, row) => sum.plus(row.share.attributedAmount),
    ZERO,
  );
  const sorted = [...ofCenter].sort(compareAttributedLines);
  const window = sorted.slice(0, limits.effectiveLimit);
  return {
    status: window.length === 0 ? 'EMPTY_RESULT' : 'OK',
    monthKey: input.aggregation.monthKey,
    direction: input.aggregation.direction,
    costCenter: {
      costCenterId: center.costCenterId,
      name: input.catalogItem.name,
      code: input.catalogItem.code,
    },
    costCenterAmount: center.amount,
    populationAmount: input.aggregation.populationAmount,
    identifiedAmount: input.aggregation.identifiedAmount,
    unidentifiedAmount: input.aggregation.unidentifiedAmount,
    coveragePercentage: input.aggregation.coveragePercentage,
    movementPopulationAmount,
    requestedLimit: limits.requestedLimit ?? ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
    effectiveLimit: limits.effectiveLimit,
    returnedCount: window.length,
    hasMore: sorted.length > window.length,
    lines: window.map((row) => ({
      occurredOn: formatAdvisorCivilDate(row.share.occurredOn),
      attributedAmount: row.share.attributedAmount,
      originalSettlementAmount: row.share.originalSettlementAmount,
      description: clipAdvisorToolText(row.description),
      partyName: clipAdvisorToolText(row.partyName),
      categoryNames: row.categoryNames
        .map((name) => clipAdvisorToolText(name) ?? name)
        .filter((name) => name !== ''),
      settlementKey: row.share.settlementKey,
    })),
  };
}

export function serializeAdvisorCostCenterMovementLines(
  value: AdvisorCostCenterMovementWindow,
): Record<string, unknown> {
  return {
    status: value.status,
    monthKey: value.monthKey,
    scope: 'PERIOD',
    direction: value.direction,
    realizedMeaning:
      value.direction === 'INFLOW' ? ADVISOR_CASH_INFLOW_MEANING : ADVISOR_CASH_OUTFLOW_MEANING,
    ...advisorCostCenterMovementFactContract(),
    costCenter: value.costCenter,
    costCenterAmount: formatAdvisorFinancialAmount(value.costCenterAmount),
    populationAmount: formatAdvisorFinancialAmount(value.populationAmount),
    identifiedAmount: formatAdvisorFinancialAmount(value.identifiedAmount),
    unidentifiedAmount: formatAdvisorFinancialAmount(value.unidentifiedAmount),
    coveragePercentage: formatAdvisorPercent(value.coveragePercentage),
    movementPopulationAmount: formatAdvisorFinancialAmount(value.movementPopulationAmount),
    requestedLimit: value.requestedLimit,
    effectiveLimit: value.effectiveLimit,
    returnedCount: value.returnedCount,
    hasMore: value.hasMore,
    maxLimit: ADVISOR_DRILLDOWN_MAX_LIMIT,
    lines: value.lines.map((line) => ({
      occurredOn: line.occurredOn,
      attributedAmount: formatAdvisorFinancialAmount(line.attributedAmount),
      originalSettlementAmount: formatAdvisorFinancialAmount(line.originalSettlementAmount),
      description: line.description,
      partyName: line.partyName,
      categoryNames: [...line.categoryNames],
    })),
    candidates:
      value.candidates?.map((row) => ({
        costCenterId: row.id,
        name: row.name,
        code: row.code,
      })) ?? [],
  };
}

function compareAttributedLines(
  left: AdvisorCostCenterMovementSourceLine,
  right: AdvisorCostCenterMovementSourceLine,
): number {
  const byAmount = right.share.attributedAmount.comparedTo(left.share.attributedAmount);
  if (byAmount !== 0) {
    return byAmount;
  }
  const byDate = right.share.occurredOn.getTime() - left.share.occurredOn.getTime();
  if (byDate !== 0) {
    return byDate;
  }
  return left.share.settlementKey.localeCompare(right.share.settlementKey);
}
