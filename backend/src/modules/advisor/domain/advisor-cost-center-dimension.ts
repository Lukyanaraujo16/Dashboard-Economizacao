import { Prisma } from '../../../generated/prisma/client.js';
import {
  attributeSettlementNetToCostCenter,
  type CashSettlementSource,
} from '../../analytics/domain/monthly-cash-flow.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
  clampAdvisorDrilldownLimit,
  type AdvisorCashDirection,
} from './advisor-cash-realized-breakdown.js';
import {
  advisorCostCenterLookupFactContract,
  advisorCostCenterRankingFactContract,
} from './advisor-cost-center-fact-contract.js';
import { formatAdvisorPercent } from './compare-advisor-cash-months.js';
import {
  ADVISOR_CASH_INFLOW_MEANING,
  ADVISOR_CASH_OUTFLOW_MEANING,
  formatAdvisorFinancialAmount,
} from './financial-facts-text.js';
import { foldAdvisorNominalText } from './advisor-nominal-text.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export const CASH_COST_CENTER_RANKING_TOOL_NAME = 'cash_cost_center_ranking';
export const CASH_COST_CENTER_LOOKUP_TOOL_NAME = 'cash_cost_center_lookup';

export type AdvisorCostCenterCatalogItem = {
  readonly id: string;
  readonly name: string;
  readonly code: string | null;
};

export type AdvisorCostCenterAllocationInput = {
  readonly costCenterId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly amount: Prisma.Decimal;
  readonly installment: Pick<
    FinancialInstallmentReadRecord,
    'externalId' | 'total' | 'paid' | 'unpaid' | 'dueDate'
  >;
  readonly confirmed: boolean;
};

export type AdvisorCostCenterIdentified = {
  readonly costCenterId: string;
  readonly name: string;
  readonly code: string | null;
  readonly amount: Prisma.Decimal;
  readonly shareOfPopulation: Prisma.Decimal | null;
  readonly shareOfIdentified: Prisma.Decimal | null;
};

export type AdvisorCostCenterAggregation = {
  readonly available: boolean;
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly populationAmount: Prisma.Decimal;
  readonly identifiedAmount: Prisma.Decimal;
  readonly unidentifiedAmount: Prisma.Decimal;
  readonly coveragePercentage: Prisma.Decimal | null;
  readonly identifiedCardinality: number;
  readonly centers: readonly AdvisorCostCenterIdentified[];
};

export type AdvisorCostCenterRanking = {
  readonly requestedLimit: number | null;
  readonly effectiveLimit: number;
  readonly hasMore: boolean;
  readonly ranking: readonly AdvisorCostCenterIdentified[];
};

export type AdvisorCostCenterLookupMatch =
  | { readonly status: 'FOUND'; readonly center: AdvisorCostCenterIdentified }
  | { readonly status: 'NOT_FOUND' }
  | {
      readonly status: 'AMBIGUOUS';
      readonly candidates: readonly AdvisorCostCenterCatalogItem[];
    };

function installmentKey(kind: CashSettlementSource['installmentKind'], externalId: string): string {
  return `${kind}:${externalId}`;
}

function shareOf(amount: Prisma.Decimal, denominator: Prisma.Decimal): Prisma.Decimal | null {
  if (denominator.isZero()) {
    return null;
  }
  return amount.div(denominator).times(HUNDRED);
}

function compareCenters(left: AdvisorCostCenterIdentified, right: AdvisorCostCenterIdentified): number {
  const byAmount = right.amount.comparedTo(left.amount);
  if (byAmount !== 0) {
    return byAmount;
  }
  const byName = left.name.localeCompare(right.name, 'pt-BR');
  if (byName !== 0) {
    return byName;
  }
  return left.costCenterId.localeCompare(right.costCenterId);
}

/**
 * Agrega caixa realizado por centro. Population é o total oficial da direção.
 * Só atribui allocation FETCHED (`confirmed`) com split oficial EXATO.
 */
export function aggregateAdvisorCostCenterDimension(input: {
  readonly monthKey: string;
  readonly direction: AdvisorCashDirection;
  readonly today: Date;
  readonly populationAmount: Prisma.Decimal;
  readonly settlements: readonly CashSettlementSource[];
  readonly allocations: readonly AdvisorCostCenterAllocationInput[];
  readonly catalog: readonly AdvisorCostCenterCatalogItem[];
}): AdvisorCostCenterAggregation {
  const wantedType = input.direction === 'INFLOW' ? 'RECEIPT' : 'DISBURSEMENT';
  const catalog = new Map(input.catalog.map((row) => [row.id, row]));
  const byInstallment = new Map<string, AdvisorCostCenterAllocationInput[]>();
  for (const allocation of input.allocations) {
    const key = installmentKey(allocation.installmentKind, allocation.installment.externalId);
    const current = byInstallment.get(key) ?? [];
    current.push(allocation);
    byInstallment.set(key, current);
  }

  const totals = new Map<string, Prisma.Decimal>();
  let identifiedAmount = ZERO;

  for (const settlement of input.settlements) {
    if (settlement.transactionType !== wantedType) {
      continue;
    }
    const rows = byInstallment.get(
      installmentKey(settlement.installmentKind, settlement.installmentExternalId),
    ) ?? [];
    const confirmed = rows.filter((row) => row.confirmed);
    if (confirmed.length === 0) {
      continue;
    }
    const attributed: Array<{ readonly costCenterId: string; readonly amount: Prisma.Decimal }> = [];
    let unavailable = false;
    for (const row of confirmed) {
      const share = attributeSettlementNetToCostCenter({
        netAmount: settlement.netAmount,
        allocationAmount: row.amount,
        installmentTotal: row.installment.total,
        paid: row.installment.paid,
        unpaid: row.installment.unpaid,
        dueDate: row.installment.dueDate,
        today: input.today,
      });
      if (share === 'UNAVAILABLE') {
        unavailable = true;
        break;
      }
      attributed.push({ costCenterId: row.costCenterId, amount: share });
    }
    if (unavailable) {
      continue;
    }
    for (const item of attributed) {
      if (!catalog.has(item.costCenterId)) {
        continue;
      }
      identifiedAmount = identifiedAmount.plus(item.amount);
      totals.set(item.costCenterId, (totals.get(item.costCenterId) ?? ZERO).plus(item.amount));
    }
  }

  const unidentifiedAmount = input.populationAmount.minus(identifiedAmount);
  const centers = [...totals.entries()]
    .map(([costCenterId, amount]) => {
      const center = catalog.get(costCenterId)!;
      return {
        costCenterId,
        name: center.name,
        code: center.code,
        amount,
        shareOfPopulation: shareOf(amount, input.populationAmount),
        shareOfIdentified: shareOf(amount, identifiedAmount),
      };
    })
    .sort(compareCenters);

  return {
    available: true,
    monthKey: input.monthKey,
    direction: input.direction,
    populationAmount: input.populationAmount,
    identifiedAmount,
    unidentifiedAmount,
    coveragePercentage: shareOf(identifiedAmount, input.populationAmount),
    identifiedCardinality: centers.length,
    centers,
  };
}

export function rankAdvisorCostCenterDimension(
  aggregation: AdvisorCostCenterAggregation,
  limit?: number,
): AdvisorCostCenterRanking {
  const limits = clampAdvisorDrilldownLimit(limit);
  const ranking = aggregation.centers.slice(0, limits.effectiveLimit);
  return {
    requestedLimit: limits.requestedLimit,
    effectiveLimit: limits.effectiveLimit,
    hasMore: aggregation.centers.length > ranking.length,
    ranking,
  };
}

export function resolveAdvisorCostCenterQuery(
  catalog: readonly AdvisorCostCenterCatalogItem[],
  query: string,
): AdvisorCostCenterLookupMatch {
  const folded = foldAdvisorNominalText(query);
  if (folded === '') {
    return { status: 'NOT_FOUND' };
  }
  const exact = catalog.filter((row) => {
    const name = foldAdvisorNominalText(row.name);
    const code = row.code === null ? '' : foldAdvisorNominalText(row.code);
    return name === folded || (code !== '' && code === folded);
  });
  if (exact.length === 1) {
    return {
      status: 'FOUND',
      center: {
        costCenterId: exact[0]!.id,
        name: exact[0]!.name,
        code: exact[0]!.code,
        amount: ZERO,
        shareOfPopulation: null,
        shareOfIdentified: null,
      },
    };
  }
  if (exact.length > 1) {
    return { status: 'AMBIGUOUS', candidates: exact };
  }
  const unique = catalog.filter((row) => {
    const name = foldAdvisorNominalText(row.name);
    const code = row.code === null ? '' : foldAdvisorNominalText(row.code);
    return name.includes(folded) || (code !== '' && code.includes(folded));
  });
  if (unique.length === 1) {
    return {
      status: 'FOUND',
      center: {
        costCenterId: unique[0]!.id,
        name: unique[0]!.name,
        code: unique[0]!.code,
        amount: ZERO,
        shareOfPopulation: null,
        shareOfIdentified: null,
      },
    };
  }
  if (unique.length > 1) {
    return { status: 'AMBIGUOUS', candidates: unique };
  }
  return { status: 'NOT_FOUND' };
}

export function lookupAdvisorCostCenter(
  aggregation: AdvisorCostCenterAggregation,
  catalog: readonly AdvisorCostCenterCatalogItem[],
  query: string,
): AdvisorCostCenterLookupMatch {
  const resolved = resolveAdvisorCostCenterQuery(catalog, query);
  if (resolved.status !== 'FOUND') {
    return resolved;
  }
  const identified =
    aggregation.centers.find((row) => row.costCenterId === resolved.center.costCenterId) ?? {
      ...resolved.center,
      amount: ZERO,
      shareOfPopulation: shareOf(ZERO, aggregation.populationAmount),
      shareOfIdentified: shareOf(ZERO, aggregation.identifiedAmount),
    };
  return { status: 'FOUND', center: identified };
}

export function serializeAdvisorCostCenterRanking(input: {
  readonly status: string;
  readonly aggregation: AdvisorCostCenterAggregation;
  readonly ranking: AdvisorCostCenterRanking;
}): Record<string, unknown> {
  const { aggregation, ranking } = input;
  const winner = ranking.ranking[0] ?? null;
  return {
    status: input.status,
    monthKey: aggregation.monthKey,
    scope: 'PERIOD',
    direction: aggregation.direction,
    realizedMeaning:
      aggregation.direction === 'INFLOW' ? ADVISOR_CASH_INFLOW_MEANING : ADVISOR_CASH_OUTFLOW_MEANING,
    ...advisorCostCenterRankingFactContract(),
    populationAmount: formatAdvisorFinancialAmount(aggregation.populationAmount),
    identifiedAmount: formatAdvisorFinancialAmount(aggregation.identifiedAmount),
    unidentifiedAmount: formatAdvisorFinancialAmount(aggregation.unidentifiedAmount),
    coveragePercentage: formatAdvisorPercent(aggregation.coveragePercentage),
    identifiedCardinality: aggregation.identifiedCardinality,
    ranking: ranking.ranking.map((row, index) => ({
      rank: index + 1,
      costCenterId: row.costCenterId,
      name: row.name,
      code: row.code,
      amount: formatAdvisorFinancialAmount(row.amount),
      shareOfPopulation: formatAdvisorPercent(row.shareOfPopulation),
      shareOfIdentified: formatAdvisorPercent(row.shareOfIdentified),
    })),
    winner:
      winner === null
        ? null
        : {
            costCenterId: winner.costCenterId,
            name: winner.name,
            code: winner.code,
            amount: formatAdvisorFinancialAmount(winner.amount),
            shareOfPopulation: formatAdvisorPercent(winner.shareOfPopulation),
            shareOfIdentified: formatAdvisorPercent(winner.shareOfIdentified),
          },
    cardinality: {
      requestedLimit: ranking.requestedLimit ?? ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
      returnedCount: ranking.ranking.length,
      identifiedEntityCount: aggregation.identifiedCardinality,
      hasMore: ranking.hasMore,
      requestedLimitIsNotEntityCount: true,
    },
    requestedLimit: ranking.requestedLimit ?? ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
    effectiveLimit: ranking.effectiveLimit,
    returnedCount: ranking.ranking.length,
    hasMore: ranking.hasMore,
    maxLimit: ADVISOR_DRILLDOWN_MAX_LIMIT,
  };
}

export function serializeAdvisorCostCenterLookup(input: {
  readonly status: string;
  readonly aggregation: AdvisorCostCenterAggregation;
  readonly costCenterQuery: string;
  readonly match: AdvisorCostCenterIdentified | null;
  readonly candidates?: readonly AdvisorCostCenterCatalogItem[];
}): Record<string, unknown> {
  const { aggregation } = input;
  return {
    status: input.status,
    monthKey: aggregation.monthKey,
    scope: 'PERIOD',
    direction: aggregation.direction,
    realizedMeaning:
      aggregation.direction === 'INFLOW' ? ADVISOR_CASH_INFLOW_MEANING : ADVISOR_CASH_OUTFLOW_MEANING,
    ...advisorCostCenterLookupFactContract(),
    costCenterQuery: input.costCenterQuery,
    populationAmount: formatAdvisorFinancialAmount(aggregation.populationAmount),
    identifiedAmount: formatAdvisorFinancialAmount(aggregation.identifiedAmount),
    unidentifiedAmount: formatAdvisorFinancialAmount(aggregation.unidentifiedAmount),
    coveragePercentage: formatAdvisorPercent(aggregation.coveragePercentage),
    costCenter:
      input.match === null
        ? null
        : {
            costCenterId: input.match.costCenterId,
            name: input.match.name,
            code: input.match.code,
            amount: formatAdvisorFinancialAmount(input.match.amount),
            shareOfPopulation: formatAdvisorPercent(input.match.shareOfPopulation),
            shareOfIdentified: formatAdvisorPercent(input.match.shareOfIdentified),
          },
    candidates:
      input.candidates?.map((row) => ({
        costCenterId: row.id,
        name: row.name,
        code: row.code,
      })) ?? [],
  };
}
