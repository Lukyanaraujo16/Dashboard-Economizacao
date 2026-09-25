import { Prisma } from '../../../generated/prisma/client.js';
import type { CashRealizedDetailItem, CashRealizedDetails } from '../../analytics/domain/cash-realized-details.js';
import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
  clampAdvisorDrilldownLimit,
} from './advisor-cash-realized-breakdown.js';
import { identifyAdvisorNominalDimension } from './advisor-nominal-identity.js';
import {
  advisorNominalCompareFactContract,
  advisorNominalLookupFactContract,
  advisorNominalRankingFactContract,
} from './advisor-nominal-fact-contract.js';
import { normalizeAdvisorNominalKey, tokenizeAdvisorNominalText } from './advisor-nominal-text.js';
import { formatAdvisorPercent, percentDelta } from './compare-advisor-cash-months.js';
import {
  ADVISOR_CASH_INFLOW_MEANING,
  formatAdvisorFinancialAmount,
} from './financial-facts-text.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

export const CASH_NOMINAL_RANKING_TOOL_NAME = 'cash_nominal_dimension_ranking';
export const CASH_NOMINAL_LOOKUP_TOOL_NAME = 'cash_nominal_dimension_lookup';
export const COMPARE_CASH_NOMINAL_TOOL_NAME = 'compare_cash_nominal_dimension';

export const ADVISOR_NOMINAL_POPULATION_MAX = 5_000;

export const ADVISOR_CONCLUSION_SAFETIES = ['COMPLETE', 'PARTIAL', 'INSUFFICIENT'] as const;
export type AdvisorConclusionSafety = (typeof ADVISOR_CONCLUSION_SAFETIES)[number];

/** Completo = 100% identificado sem ambíguos. Parcial = ≥80% do valor. Abaixo disso não afirma vencedor. */
export const ADVISOR_NOMINAL_PARTIAL_COVERAGE_THRESHOLD = new Prisma.Decimal('80');

export type AdvisorNominalGroup = {
  readonly groupKey: string;
  readonly normalizedKey: string;
  readonly displayName: string;
  readonly identityStatus: 'IDENTIFIED' | 'AMBIGUOUS';
  readonly amount: Prisma.Decimal;
  readonly movementCount: number;
  readonly variantCount: number;
  readonly sourceKinds: readonly string[];
};

export type AdvisorNominalCoverage = {
  readonly totalPopulationAmount: Prisma.Decimal;
  readonly identifiedAmount: Prisma.Decimal;
  readonly unknownAmount: Prisma.Decimal;
  readonly ambiguousAmount: Prisma.Decimal;
  readonly identifiedPercent: Prisma.Decimal | null;
  readonly totalPopulationCount: number;
  readonly identifiedCount: number;
  readonly unknownCount: number;
  readonly ambiguousCount: number;
};

export type AdvisorNominalAggregation = {
  readonly available: boolean;
  readonly truncated: boolean;
  readonly monthKey: string;
  readonly categoryKey: string;
  readonly categoryName: string;
  readonly coverage: AdvisorNominalCoverage;
  readonly groups: readonly AdvisorNominalGroup[];
  readonly conclusionSafety: AdvisorConclusionSafety;
};

export type AdvisorNominalRankedEntity = {
  readonly rank: number;
  readonly normalizedKey: string;
  readonly displayName: string;
  readonly identityStatus: 'IDENTIFIED';
  readonly amount: Prisma.Decimal;
  readonly shareOfIdentified: Prisma.Decimal | null;
  readonly shareOfPopulation: Prisma.Decimal | null;
  readonly movementCount: number;
  readonly variantCount: number;
  readonly sourceKinds: readonly string[];
};

export function aggregateAdvisorNominalDimension(input: {
  readonly monthKey: string;
  readonly categoryKey: string;
  readonly categoryName: string;
  readonly details: CashRealizedDetails;
}): AdvisorNominalAggregation {
  if (!input.details.available) {
    return emptyAggregation(input, false, false);
  }
  const truncated = input.details.itemCount > input.details.items.length;
  const coverageBase = {
    totalPopulationAmount: ZERO,
    identifiedAmount: ZERO,
    unknownAmount: ZERO,
    ambiguousAmount: ZERO,
    identifiedPercent: null,
    totalPopulationCount: 0,
    identifiedCount: 0,
    unknownCount: 0,
    ambiguousCount: 0,
  };
  if (input.details.items.length === 0) {
    return {
      available: true,
      truncated,
      monthKey: input.monthKey,
      categoryKey: input.categoryKey,
      categoryName: input.categoryName,
      coverage: coverageBase,
      groups: [],
      conclusionSafety: 'INSUFFICIENT',
    };
  }

  const groups = new Map<
    string,
    {
      groupKey: string;
      normalizedKey: string;
      displayName: string;
      identityStatus: 'IDENTIFIED' | 'AMBIGUOUS';
      amount: Prisma.Decimal;
      movementCount: number;
      variants: Set<string>;
      sourceKinds: Set<string>;
    }
  >();
  let unknownAmount = ZERO;
  let unknownCount = 0;
  let totalAmount = ZERO;

  for (const item of input.details.items) {
    totalAmount = totalAmount.plus(item.attributedAmount);
    const identity = identifyAdvisorNominalDimension(item);
    if (identity.status === 'UNKNOWN' || identity.groupKey === null || identity.normalizedKey === null) {
      unknownAmount = unknownAmount.plus(item.attributedAmount);
      unknownCount += 1;
      continue;
    }
    if (identity.status === 'AMBIGUOUS') {
      const ambiguousKey = `ambiguous:${identity.normalizedKey ?? item.settlementExternalId}`;
      const currentAmbiguous = groups.get(ambiguousKey);
      if (currentAmbiguous === undefined) {
        groups.set(ambiguousKey, {
          groupKey: ambiguousKey,
          normalizedKey: identity.normalizedKey ?? 'ambiguous',
          displayName: identity.displayName ?? 'AMBIGUOUS',
          identityStatus: 'AMBIGUOUS',
          amount: item.attributedAmount,
          movementCount: 1,
          variants: new Set(),
          sourceKinds: new Set(),
        });
      } else {
        currentAmbiguous.amount = currentAmbiguous.amount.plus(item.attributedAmount);
        currentAmbiguous.movementCount += 1;
      }
      continue;
    }
    const current = groups.get(identity.groupKey);
    const variant = variantLabel(item);
    if (current === undefined) {
      groups.set(identity.groupKey, {
        groupKey: identity.groupKey,
        normalizedKey: identity.normalizedKey,
        displayName: identity.displayName ?? identity.normalizedKey,
        identityStatus: 'IDENTIFIED',
        amount: item.attributedAmount,
        movementCount: 1,
        variants: new Set(variant === null ? [] : [variant]),
        sourceKinds: new Set(identity.sourceKind === null ? [] : [identity.sourceKind]),
      });
      continue;
    }
    current.amount = current.amount.plus(item.attributedAmount);
    current.movementCount += 1;
    if (variant !== null) {
      current.variants.add(variant);
    }
    if (identity.sourceKind !== null) {
      current.sourceKinds.add(identity.sourceKind);
    }
    if (identity.sourceKind === 'STRUCTURED_PARTY' && identity.displayName) {
      current.displayName = identity.displayName;
    }
  }

  reconcileDescriptionCollisions(groups);

  const identifiedGroups = [...groups.values()].filter((group) => group.identityStatus === 'IDENTIFIED');
  const ambiguousGroups = [...groups.values()].filter((group) => group.identityStatus === 'AMBIGUOUS');
  const identifiedAmount = identifiedGroups.reduce((sum, group) => sum.plus(group.amount), ZERO);
  const ambiguousAmount = ambiguousGroups.reduce((sum, group) => sum.plus(group.amount), ZERO);
  const identifiedCount = identifiedGroups.reduce((sum, group) => sum + group.movementCount, 0);
  const ambiguousCount = ambiguousGroups.reduce((sum, group) => sum + group.movementCount, 0);
  const identifiedPercent = totalAmount.isZero()
    ? null
    : identifiedAmount.div(totalAmount).times(HUNDRED);
  const rankedGroups = [...groups.values()]
    .map((group) => ({
      groupKey: group.groupKey,
      normalizedKey: group.normalizedKey,
      displayName: group.displayName,
      identityStatus: group.identityStatus,
      amount: group.amount,
      movementCount: group.movementCount,
      variantCount: group.variants.size,
      sourceKinds: [...group.sourceKinds],
    }))
    .sort(compareNominalGroups);

  return {
    available: true,
    truncated,
    monthKey: input.monthKey,
    categoryKey: input.categoryKey,
    categoryName: input.categoryName,
    coverage: {
      totalPopulationAmount: totalAmount,
      identifiedAmount,
      unknownAmount,
      ambiguousAmount,
      identifiedPercent,
      totalPopulationCount: input.details.items.length,
      identifiedCount,
      unknownCount,
      ambiguousCount,
    },
    groups: rankedGroups,
    conclusionSafety: resolveConclusionSafety({
      identifiedPercent,
      unknownCount,
      ambiguousCount,
      identifiedCount,
      totalCount: input.details.items.length,
    }),
  };
}

export function rankAdvisorNominalDimension(
  aggregation: AdvisorNominalAggregation,
  limit?: number,
): {
  readonly requestedLimit: number | null;
  readonly effectiveLimit: number;
  readonly hasMore: boolean;
  readonly ranking: readonly AdvisorNominalRankedEntity[];
} {
  const limits = clampAdvisorDrilldownLimit(limit);
  const identifiedGroups = aggregation.groups.filter((group) => group.identityStatus === 'IDENTIFIED');
  const identified = aggregation.coverage.identifiedAmount;
  const population = aggregation.coverage.totalPopulationAmount;
  const ranking = identifiedGroups.slice(0, limits.effectiveLimit).map((group, index) => ({
    rank: index + 1,
    normalizedKey: group.normalizedKey,
    displayName: group.displayName,
    identityStatus: 'IDENTIFIED' as const,
    amount: group.amount,
    shareOfIdentified: share(group.amount, identified),
    shareOfPopulation: share(group.amount, population),
    movementCount: group.movementCount,
    variantCount: group.variantCount,
    sourceKinds: group.sourceKinds,
  }));
  return {
    requestedLimit: limits.requestedLimit,
    effectiveLimit: limits.effectiveLimit,
    hasMore: identifiedGroups.length > limits.effectiveLimit,
    ranking,
  };
}

export function lookupAdvisorNominalEntity(
  aggregation: AdvisorNominalAggregation,
  entityQuery: string,
): {
  readonly status: 'OK' | 'NOT_FOUND' | 'AMBIGUOUS';
  readonly matches: readonly AdvisorNominalGroup[];
} {
  const identified = aggregation.groups.filter((group) => group.identityStatus === 'IDENTIFIED');
  const matches = matchNominalEntities(identified, entityQuery);
  if (matches.length === 0) {
    const ambiguous = matchNominalEntities(
      aggregation.groups.filter((group) => group.identityStatus === 'AMBIGUOUS'),
      entityQuery,
    );
    if (ambiguous.length > 0) {
      return { status: 'AMBIGUOUS', matches: ambiguous };
    }
  }
  if (matches.length === 0) {
    return { status: 'NOT_FOUND', matches: [] };
  }
  if (matches.length > 1) {
    return { status: 'AMBIGUOUS', matches };
  }
  return { status: 'OK', matches };
}

export function compareAdvisorNominalAggregations(input: {
  readonly periodA: AdvisorNominalAggregation;
  readonly periodB: AdvisorNominalAggregation;
  readonly entityQuery?: string;
}): {
  readonly items: readonly {
    readonly normalizedKey: string;
    readonly displayName: string;
    readonly amountA: Prisma.Decimal;
    readonly amountB: Prisma.Decimal;
    readonly deltaAmount: Prisma.Decimal;
    readonly deltaPercent: Prisma.Decimal | null;
  }[];
} {
  const groupsA = filterGroups(input.periodA.groups, input.entityQuery);
  const groupsB = filterGroups(input.periodB.groups, input.entityQuery);
  if (input.entityQuery !== undefined && (groupsA.length > 1 || groupsB.length > 1)) {
    const keys = new Set([...groupsA, ...groupsB].map((group) => group.normalizedKey));
    if (keys.size > 1) {
      return { items: [] };
    }
  }
  const keys = new Set([
    ...groupsA.map((group) => group.normalizedKey),
    ...groupsB.map((group) => group.normalizedKey),
  ]);
  const items = [...keys].map((normalizedKey) => {
    const left = groupsA.find((group) => group.normalizedKey === normalizedKey);
    const right = groupsB.find((group) => group.normalizedKey === normalizedKey);
    const amountA = left?.amount ?? ZERO;
    const amountB = right?.amount ?? ZERO;
    return {
      normalizedKey,
      displayName: right?.displayName ?? left?.displayName ?? normalizedKey,
      amountA,
      amountB,
      deltaAmount: amountB.minus(amountA),
      deltaPercent: percentDelta(amountB, amountA),
    };
  });
  items.sort((left, right) => {
    const byDelta = right.deltaAmount.comparedTo(left.deltaAmount);
    if (byDelta !== 0) {
      return byDelta;
    }
    return left.normalizedKey.localeCompare(right.normalizedKey);
  });
  return { items };
}

export function matchNominalEntities(
  groups: readonly AdvisorNominalGroup[],
  entityQuery: string,
): AdvisorNominalGroup[] {
  const exactKey = normalizeAdvisorNominalKey(entityQuery);
  if (exactKey === '') {
    return [];
  }
  const exact = groups.filter((group) => group.normalizedKey === exactKey);
  if (exact.length === 1) {
    return exact;
  }
  if (exact.length > 1) {
    return exact;
  }

  const parts = splitAdvisorEntityQuery(entityQuery);
  if (parts.length > 1) {
    const resolved = parts.flatMap((part) => matchNominalEntities(groups, part));
    const unique = uniqueGroups(resolved);
    return unique;
  }

  const queryTokens = tokenizeAdvisorNominalText(entityQuery);
  if (queryTokens.length === 0) {
    return [];
  }
  const tokenMatches = groups.filter((group) => {
    const nameTokens = tokenizeAdvisorNominalText(group.displayName);
    const keyTokens = tokenizeAdvisorNominalText(group.normalizedKey);
    return queryTokens.every((token) => nameTokens.includes(token) || keyTokens.includes(token));
  });
  return tokenMatches;
}

export function splitAdvisorEntityQuery(entityQuery: string): readonly string[] {
  return entityQuery
    .split(/\s+e\s+/i)
    .map((part) => part.trim())
    .filter((part) => part !== '');
}

export function serializeAdvisorNominalRanking(input: {
  readonly status: string;
  readonly aggregation: AdvisorNominalAggregation;
  readonly ranking: ReturnType<typeof rankAdvisorNominalDimension>;
}): Record<string, unknown> {
  const { aggregation, ranking } = input;
  const identifiedGroups = aggregation.groups.filter((group) => group.identityStatus === 'IDENTIFIED');
  const topNAmount = ranking.ranking.reduce((sum, row) => sum.plus(row.amount), ZERO);
  const winner =
    ranking.ranking[0] !== undefined && aggregation.conclusionSafety !== 'INSUFFICIENT'
      ? {
          normalizedKey: ranking.ranking[0].normalizedKey,
          displayName: ranking.ranking[0].displayName,
          identityStatus: 'IDENTIFIED',
          amount: formatAdvisorFinancialAmount(ranking.ranking[0].amount),
        }
      : null;
  return {
    status: input.status,
    monthKey: aggregation.monthKey,
    scope: 'PERIOD',
    category: {
      key: aggregation.categoryKey,
      name: aggregation.categoryName,
    },
    direction: 'INFLOW',
    realizedMeaning: ADVISOR_CASH_INFLOW_MEANING,
    ...advisorNominalRankingFactContract(),
    population: {
      amount: formatAdvisorFinancialAmount(aggregation.coverage.totalPopulationAmount),
      count: aggregation.coverage.totalPopulationCount,
    },
    coverage: serializeCoverage(aggregation),
    identifiedEntityCount: identifiedGroups.length,
    ambiguousEntityCount: aggregation.groups.filter((group) => group.identityStatus === 'AMBIGUOUS').length,
    unknownMovementCount: aggregation.coverage.unknownCount,
    conclusionSafety: aggregation.conclusionSafety,
    ranking: ranking.ranking.map((row) => ({
      rank: row.rank,
      normalizedKey: row.normalizedKey,
      displayName: row.displayName,
      identityStatus: row.identityStatus,
      amount: formatAdvisorFinancialAmount(row.amount),
      shareOfIdentified: formatAdvisorPercent(row.shareOfIdentified),
      shareOfPopulation: formatAdvisorPercent(row.shareOfPopulation),
      movementCount: row.movementCount,
      variantCount: row.variantCount,
      sourceKinds: [...row.sourceKinds],
    })),
    topN: {
      returnedCount: ranking.ranking.length,
      amount: formatAdvisorFinancialAmount(topNAmount),
      shareOfIdentified: formatAdvisorPercent(share(topNAmount, aggregation.coverage.identifiedAmount)),
      shareOfPopulation: formatAdvisorPercent(
        share(topNAmount, aggregation.coverage.totalPopulationAmount),
      ),
      hasMore: ranking.hasMore,
    },
    winner,
    requestedLimit: ranking.requestedLimit ?? ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
    effectiveLimit: ranking.effectiveLimit,
    returnedCount: ranking.ranking.length,
    hasMore: ranking.hasMore,
    truncated: aggregation.truncated,
    maxLimit: ADVISOR_DRILLDOWN_MAX_LIMIT,
  };
}

export function serializeAdvisorNominalLookup(input: {
  readonly status: string;
  readonly aggregation: AdvisorNominalAggregation;
  readonly entityQuery: string;
  readonly match: AdvisorNominalGroup | null;
}): Record<string, unknown> {
  const identified = input.aggregation.coverage.identifiedAmount;
  const population = input.aggregation.coverage.totalPopulationAmount;
  return {
    status: input.status,
    monthKey: input.aggregation.monthKey,
    scope: 'PERIOD',
    category: {
      key: input.aggregation.categoryKey,
      name: input.aggregation.categoryName,
    },
    direction: 'INFLOW',
    realizedMeaning: ADVISOR_CASH_INFLOW_MEANING,
    ...advisorNominalLookupFactContract(),
    entityQuery: input.entityQuery,
    entity:
      input.match === null
        ? null
        : {
            normalizedKey: input.match.normalizedKey,
            displayName: input.match.displayName,
            identityStatus: input.match.identityStatus,
            amount: formatAdvisorFinancialAmount(input.match.amount),
            movementCount: input.match.movementCount,
            shareOfIdentified: formatAdvisorPercent(share(input.match.amount, identified)),
            shareOfPopulation: formatAdvisorPercent(share(input.match.amount, population)),
          },
    coverage: serializeCoverage(input.aggregation),
    conclusionSafety: input.aggregation.conclusionSafety,
  };
}

export function serializeAdvisorNominalComparison(input: {
  readonly status: string;
  readonly category: { readonly key: string; readonly name: string };
  readonly monthKey: string;
  readonly comparisonMonthKey: string;
  readonly periodA: AdvisorNominalAggregation;
  readonly periodB: AdvisorNominalAggregation;
  readonly items: ReturnType<typeof compareAdvisorNominalAggregations>['items'];
  readonly requestedLimit: number;
  readonly effectiveLimit: number;
}): Record<string, unknown> {
  const sliced = input.items.slice(0, input.effectiveLimit);
  return {
    status: input.status,
    monthKey: input.monthKey,
    comparisonMonthKey: input.comparisonMonthKey,
    scope: 'COMPARISON',
    category: input.category,
    direction: 'INFLOW',
    realizedMeaning: ADVISOR_CASH_INFLOW_MEANING,
    ...advisorNominalCompareFactContract(),
    periodA: {
      monthKey: input.periodA.monthKey,
      coverage: serializeCoverage(input.periodA),
      conclusionSafety: input.periodA.conclusionSafety,
    },
    periodB: {
      monthKey: input.periodB.monthKey,
      coverage: serializeCoverage(input.periodB),
      conclusionSafety: input.periodB.conclusionSafety,
    },
    items: sliced.map((item) => ({
      normalizedKey: item.normalizedKey,
      displayName: item.displayName,
      amountA: formatAdvisorFinancialAmount(item.amountA),
      amountB: formatAdvisorFinancialAmount(item.amountB),
      deltaAmount: formatAdvisorFinancialAmount(item.deltaAmount),
      deltaPercent: formatAdvisorPercent(item.deltaPercent),
    })),
    requestedLimit: input.requestedLimit,
    effectiveLimit: input.effectiveLimit,
    returnedCount: sliced.length,
    hasMore: input.items.length > input.effectiveLimit,
  };
}

export function resolveConclusionSafety(input: {
  readonly identifiedPercent: Prisma.Decimal | null;
  readonly unknownCount: number;
  readonly ambiguousCount: number;
  readonly identifiedCount: number;
  readonly totalCount: number;
}): AdvisorConclusionSafety {
  if (input.totalCount === 0 || input.identifiedCount === 0 || input.identifiedPercent === null) {
    return 'INSUFFICIENT';
  }
  if (
    input.identifiedPercent.equals(HUNDRED) &&
    input.unknownCount === 0 &&
    input.ambiguousCount === 0
  ) {
    return 'COMPLETE';
  }
  if (input.identifiedPercent.greaterThanOrEqualTo(ADVISOR_NOMINAL_PARTIAL_COVERAGE_THRESHOLD)) {
    return 'PARTIAL';
  }
  return 'INSUFFICIENT';
}

function serializeCoverage(aggregation: AdvisorNominalAggregation): Record<string, unknown> {
  const amountPercent = aggregation.coverage.identifiedPercent;
  const countPercent =
    aggregation.coverage.totalPopulationCount === 0
      ? null
      : new Prisma.Decimal(aggregation.coverage.identifiedCount)
          .div(aggregation.coverage.totalPopulationCount)
          .times(HUNDRED);
  return {
    identifiedAmount: formatAdvisorFinancialAmount(aggregation.coverage.identifiedAmount),
    unknownAmount: formatAdvisorFinancialAmount(aggregation.coverage.unknownAmount),
    ambiguousAmount: formatAdvisorFinancialAmount(aggregation.coverage.ambiguousAmount),
    identifiedPercent: formatAdvisorPercent(amountPercent),
    identifiedCount: aggregation.coverage.identifiedCount,
    unknownCount: aggregation.coverage.unknownCount,
    ambiguousCount: aggregation.coverage.ambiguousCount,
    totalPopulationCount: aggregation.coverage.totalPopulationCount,
    amountPercent: formatAdvisorPercent(amountPercent),
    countPercent: formatAdvisorPercent(countPercent),
    status: aggregation.conclusionSafety,
    identifiedEntityCount: aggregation.groups.filter((group) => group.identityStatus === 'IDENTIFIED').length,
    ambiguousEntityCount: aggregation.groups.filter((group) => group.identityStatus === 'AMBIGUOUS').length,
  };
}

function share(amount: Prisma.Decimal, denominator: Prisma.Decimal): Prisma.Decimal | null {
  if (denominator.isZero()) {
    return null;
  }
  return amount.div(denominator).times(HUNDRED);
}

function reconcileDescriptionCollisions(
  groups: Map<
    string,
    {
      groupKey: string;
      normalizedKey: string;
      identityStatus: 'IDENTIFIED' | 'AMBIGUOUS';
    }
  >,
): void {
  const byKey = new Map<string, Array<{ groupKey: string; identityStatus: 'IDENTIFIED' | 'AMBIGUOUS' }>>();
  for (const group of groups.values()) {
    const list = byKey.get(group.normalizedKey) ?? [];
    list.push(group);
    byKey.set(group.normalizedKey, list);
  }
  for (const list of byKey.values()) {
    const hasStructuredParty = list.some((group) => group.groupKey.startsWith('party:'));
    if (!hasStructuredParty) {
      continue;
    }
    for (const group of list) {
      if (group.groupKey.startsWith('desc:')) {
        group.identityStatus = 'AMBIGUOUS';
      }
    }
  }
}

export function readAdvisorNominalRankingWinner(
  serialized: Record<string, unknown>,
): { readonly displayName: string; readonly normalizedKey: string } | null {
  const winner = serialized.winner;
  if (winner === null || winner === undefined || typeof winner !== 'object') {
    return null;
  }
  const record = winner as { displayName?: unknown; normalizedKey?: unknown; identityStatus?: unknown };
  if (
    record.identityStatus !== 'IDENTIFIED' ||
    typeof record.displayName !== 'string' ||
    record.displayName.trim() === '' ||
    typeof record.normalizedKey !== 'string'
  ) {
    return null;
  }
  return { displayName: record.displayName, normalizedKey: record.normalizedKey };
}

function compareNominalGroups(left: AdvisorNominalGroup, right: AdvisorNominalGroup): number {
  const byAmount = right.amount.comparedTo(left.amount);
  if (byAmount !== 0) {
    return byAmount;
  }
  const byKey = left.normalizedKey.localeCompare(right.normalizedKey);
  if (byKey !== 0) {
    return byKey;
  }
  return left.groupKey.localeCompare(right.groupKey);
}

function variantLabel(item: CashRealizedDetailItem): string | null {
  const description = item.description?.trim();
  if (description) {
    return description;
  }
  return item.partyName?.trim() || null;
}

function filterGroups(
  groups: readonly AdvisorNominalGroup[],
  entityQuery: string | undefined,
): readonly AdvisorNominalGroup[] {
  const identified = groups.filter((group) => group.identityStatus === 'IDENTIFIED');
  if (entityQuery === undefined || entityQuery.trim() === '') {
    return identified;
  }
  return matchNominalEntities(identified, entityQuery);
}

function uniqueGroups(groups: readonly AdvisorNominalGroup[]): AdvisorNominalGroup[] {
  const seen = new Set<string>();
  const out: AdvisorNominalGroup[] = [];
  for (const group of groups) {
    if (seen.has(group.groupKey)) {
      continue;
    }
    seen.add(group.groupKey);
    out.push(group);
  }
  return out;
}

function emptyAggregation(
  input: { readonly monthKey: string; readonly categoryKey: string; readonly categoryName: string },
  available: boolean,
  truncated: boolean,
): AdvisorNominalAggregation {
  return {
    available,
    truncated,
    monthKey: input.monthKey,
    categoryKey: input.categoryKey,
    categoryName: input.categoryName,
    coverage: {
      totalPopulationAmount: ZERO,
      identifiedAmount: ZERO,
      unknownAmount: ZERO,
      ambiguousAmount: ZERO,
      identifiedPercent: null,
      totalPopulationCount: 0,
      identifiedCount: 0,
      unknownCount: 0,
      ambiguousCount: 0,
    },
    groups: [],
    conclusionSafety: 'INSUFFICIENT',
  };
}
