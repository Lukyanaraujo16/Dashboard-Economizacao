import { Prisma } from '../../../generated/prisma/client.js';
import type { FinancialCategoryReadRecord } from '../../finance/domain/types.js';
import { civilDateUtcFromKey, civilMonthBoundsFromKey } from './civil-calendar.js';
import type { CashRealizedDetailsDirection } from './cash-realized-details.js';
import {
  collectAttributedCashSettlements,
  type AttributedCashSettlement,
  type CalculateMonthlyCashFlowInput,
} from './monthly-cash-flow.js';

/** Página segura de um dia civil. Não é o TOP N mensal nem o default 100 da categoria. */
export const CASH_REALIZED_DAY_DETAILS_LIMIT = 40;

/** Página do mês realizado. O total cobre o mês inteiro; a lista pode continuar. */
export const CASH_REALIZED_MONTH_DETAILS_LIMIT = 80;

export const CASH_REALIZED_DAY_COUNTERPARTY_FALLBACK = 'Sem contraparte identificada';

export const CASH_REALIZED_DAY_COMPLETENESS = ['COMPLETE', 'PARTIAL', 'UNAVAILABLE'] as const;
export type CashRealizedDayCompleteness = (typeof CASH_REALIZED_DAY_COMPLETENESS)[number];

export type CashRealizedDayDetailItem = {
  readonly occurredOn: Date;
  readonly attributedAmount: Prisma.Decimal;
  readonly partyName: string | null;
  readonly description: string | null;
  readonly displayLabel: string;
  readonly categoryNames: readonly string[];
  readonly costCenterLabel: string | null;
};

export type CashRealizedDayDetails = {
  readonly date: string;
  readonly direction: CashRealizedDetailsDirection;
  readonly completeness: CashRealizedDayCompleteness;
  readonly total: Prisma.Decimal | null;
  readonly returnedSum: Prisma.Decimal | null;
  readonly difference: Prisma.Decimal | null;
  readonly hasMore: boolean;
  readonly itemCount: number;
  readonly limit: number;
  readonly items: readonly CashRealizedDayDetailItem[];
};

export type CashRealizedMonthDetails = {
  readonly monthKey: string;
  readonly from: Date;
  readonly to: Date;
  readonly direction: CashRealizedDetailsDirection;
  readonly completeness: CashRealizedDayCompleteness;
  readonly total: Prisma.Decimal | null;
  readonly returnedSum: Prisma.Decimal | null;
  readonly difference: Prisma.Decimal | null;
  readonly hasMore: boolean;
  readonly itemCount: number;
  readonly limit: number;
  readonly offset: number;
  readonly items: readonly CashRealizedDayDetailItem[];
};

export type BuildCashRealizedMonthDetailsInput = Omit<BuildCashRealizedDayDetailsInput, 'date'> & {
  readonly monthKey: string;
  readonly offset?: number;
};

export type BuildCashRealizedDayDetailsInput = {
  readonly date: string;
  readonly direction: CashRealizedDetailsDirection;
  readonly today: Date;
  readonly settlements: CalculateMonthlyCashFlowInput['settlements'];
  readonly realizedInstallments?: CalculateMonthlyCashFlowInput['realizedInstallments'];
  readonly categories?: readonly Pick<FinancialCategoryReadRecord, 'externalId' | 'name' | 'type'>[];
  readonly partyNames: ReadonlyMap<string, string>;
  readonly categoryFilter?: CalculateMonthlyCashFlowInput['categoryFilter'];
  readonly costCenter?: CalculateMonthlyCashFlowInput['costCenter'];
  readonly costCenterLabel?: string | null;
  readonly limit?: number;
};

function expectedTypeForDirection(
  direction: CashRealizedDetailsDirection,
): 'REVENUE' | 'EXPENSE' {
  return direction === 'inflows' ? 'REVENUE' : 'EXPENSE';
}

function transactionTypeForDirection(
  direction: CashRealizedDetailsDirection,
): 'RECEIPT' | 'DISBURSEMENT' {
  return direction === 'inflows' ? 'RECEIPT' : 'DISBURSEMENT';
}

function resolveCategoryNames(
  categoryExternalIds: readonly string[],
  catalog: ReadonlyMap<string, Pick<FinancialCategoryReadRecord, 'name' | 'type'>>,
  expectedType: 'REVENUE' | 'EXPENSE',
): string[] {
  const names: string[] = [];
  for (const externalId of categoryExternalIds) {
    const category = catalog.get(externalId);
    if (category?.type === expectedType) {
      names.push(category.name);
    }
  }
  return names;
}

export function cashRealizedDayDisplayLabel(input: {
  readonly partyName: string | null;
  readonly description: string | null;
}): string {
  const party = input.partyName?.trim() ?? '';
  if (party !== '') {
    return party;
  }
  const description = input.description?.trim() ?? '';
  if (description !== '') {
    return description;
  }
  return CASH_REALIZED_DAY_COUNTERPARTY_FALLBACK;
}

function sumAttributed(rows: readonly AttributedCashSettlement[]): Prisma.Decimal {
  return rows.reduce(
    (acc, row) => acc.plus(row.attributedAmount),
    new Prisma.Decimal(0),
  );
}

function unavailableDay(
  date: string,
  direction: CashRealizedDetailsDirection,
  limit: number,
): CashRealizedDayDetails {
  return {
    date,
    direction,
    completeness: 'UNAVAILABLE',
    total: null,
    returnedSum: null,
    difference: null,
    hasMore: false,
    itemCount: 0,
    limit,
    items: [],
  };
}

type WindowPage = {
  readonly available: boolean;
  readonly total: Prisma.Decimal | null;
  readonly returnedSum: Prisma.Decimal | null;
  readonly difference: Prisma.Decimal | null;
  readonly hasMore: boolean;
  readonly itemCount: number;
  readonly items: readonly CashRealizedDayDetailItem[];
};

/**
 * Mesma população de `collectAttributedCashSettlements` usada pelo gráfico de caixa.
 * `offset` só fatia a lista; `total` continua sendo o período inteiro.
 */
function pageAttributedWindow(input: {
  readonly from: Date;
  readonly to: Date;
  readonly direction: CashRealizedDetailsDirection;
  readonly today: Date;
  readonly settlements: CalculateMonthlyCashFlowInput['settlements'];
  readonly realizedInstallments?: CalculateMonthlyCashFlowInput['realizedInstallments'];
  readonly categories?: BuildCashRealizedDayDetailsInput['categories'];
  readonly partyNames: ReadonlyMap<string, string>;
  readonly categoryFilter?: CalculateMonthlyCashFlowInput['categoryFilter'];
  readonly costCenter?: CalculateMonthlyCashFlowInput['costCenter'];
  readonly costCenterLabel?: string | null;
  readonly limit: number;
  readonly offset: number;
}): WindowPage {
  const attributed = collectAttributedCashSettlements({
    today: input.today,
    from: input.from,
    to: input.to,
    settlements: input.settlements,
    realizedInstallments: input.realizedInstallments,
    categoryFilter: input.categoryFilter ?? null,
    costCenter: input.costCenter,
  });
  if (!attributed.available) {
    return {
      available: false,
      total: null,
      returnedSum: null,
      difference: null,
      hasMore: false,
      itemCount: 0,
      items: [],
    };
  }

  const wanted = transactionTypeForDirection(input.direction);
  const matched = attributed.rows.filter((row) => row.settlement.transactionType === wanted);
  const total = sumAttributed(matched);
  const ordered = [...matched].sort((left, right) => {
    const byAmount = right.attributedAmount.comparedTo(left.attributedAmount);
    if (byAmount !== 0) {
      return byAmount;
    }
    return (left.settlement.settlementExternalId ?? '').localeCompare(
      right.settlement.settlementExternalId ?? '',
    );
  });
  const page = ordered.slice(input.offset, input.offset + input.limit);
  const returnedSum = sumAttributed(page);
  const hasMore = input.offset + page.length < ordered.length;
  const expectedType = expectedTypeForDirection(input.direction);
  const catalog = new Map((input.categories ?? []).map((category) => [category.externalId, category]));
  const costCenterLabel = input.costCenterLabel?.trim() || null;
  const items = page.map((row) => {
    const installment = input.realizedInstallments?.get(
      `${row.settlement.installmentKind}:${row.settlement.installmentExternalId}`,
    );
    const partyId = installment?.partyId ?? null;
    const partyName = partyId ? (input.partyNames.get(partyId) ?? null) : null;
    const description = installment?.description ?? null;
    return {
      occurredOn: row.settlement.occurredOn,
      attributedAmount: row.attributedAmount,
      partyName,
      description,
      displayLabel: cashRealizedDayDisplayLabel({ partyName, description }),
      categoryNames: resolveCategoryNames(row.categoryExternalIds, catalog, expectedType),
      costCenterLabel,
    };
  });

  return {
    available: true,
    total,
    returnedSum,
    difference: total.minus(returnedSum),
    hasMore,
    itemCount: ordered.length,
    items,
  };
}

/**
 * Explica um ponto de `daily.realized`.
 * Reusa `collectAttributedCashSettlements` — a mesma população do gráfico.
 * `categoryKey` não é obrigatório: sem filtro, a categoria é só rótulo.
 */
export function buildCashRealizedDayDetails(
  input: BuildCashRealizedDayDetailsInput,
): CashRealizedDayDetails {
  const limit = clampCashRealizedDayDetailsLimit(input.limit);
  const day = civilDateUtcFromKey(input.date);
  if (day === null) {
    return unavailableDay(input.date, input.direction, limit);
  }

  const page = pageAttributedWindow({
    ...input,
    from: day,
    to: day,
    limit,
    offset: 0,
  });
  if (!page.available) {
    return unavailableDay(input.date, input.direction, limit);
  }

  return {
    date: input.date,
    direction: input.direction,
    completeness: page.hasMore ? 'PARTIAL' : 'COMPLETE',
    total: page.total,
    returnedSum: page.returnedSum,
    difference: page.difference,
    hasMore: page.hasMore,
    itemCount: page.itemCount,
    limit,
    items: page.items,
  };
}

function unavailableMonth(
  monthKey: string,
  from: Date,
  to: Date,
  direction: CashRealizedDetailsDirection,
  limit: number,
  offset: number,
): CashRealizedMonthDetails {
  return {
    monthKey,
    from,
    to,
    direction,
    completeness: 'UNAVAILABLE',
    total: null,
    returnedSum: null,
    difference: null,
    hasMore: false,
    itemCount: 0,
    limit,
    offset,
    items: [],
  };
}

/**
 * Explica um mês de `cash-movement-history` / `realized`.
 * Mesma atribuição do gráfico mensal; a página não substitui o total.
 */
export function buildCashRealizedMonthDetails(
  input: BuildCashRealizedMonthDetailsInput,
): CashRealizedMonthDetails {
  const limit = clampCashRealizedMonthDetailsLimit(input.limit);
  const offset = clampCashRealizedMonthDetailsOffset(input.offset);
  let bounds: { from: Date; to: Date; monthKey: string };
  try {
    bounds = civilMonthBoundsFromKey(input.monthKey);
  } catch {
    const fallback = new Date(0);
    return unavailableMonth(input.monthKey, fallback, fallback, input.direction, limit, offset);
  }

  const page = pageAttributedWindow({
    ...input,
    from: bounds.from,
    to: bounds.to,
    limit,
    offset,
  });
  if (!page.available) {
    return unavailableMonth(bounds.monthKey, bounds.from, bounds.to, input.direction, limit, offset);
  }

  return {
    monthKey: bounds.monthKey,
    from: bounds.from,
    to: bounds.to,
    direction: input.direction,
    completeness: page.hasMore || offset > 0 ? 'PARTIAL' : 'COMPLETE',
    total: page.total,
    returnedSum: page.returnedSum,
    difference: page.difference,
    hasMore: page.hasMore,
    itemCount: page.itemCount,
    limit,
    offset,
    items: page.items,
  };
}

export function clampCashRealizedDayDetailsLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return CASH_REALIZED_DAY_DETAILS_LIMIT;
  }
  return Math.min(CASH_REALIZED_DAY_DETAILS_LIMIT, Math.max(1, Math.trunc(limit)));
}

export function clampCashRealizedMonthDetailsLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) {
    return CASH_REALIZED_MONTH_DETAILS_LIMIT;
  }
  return Math.min(CASH_REALIZED_MONTH_DETAILS_LIMIT, Math.max(1, Math.trunc(limit)));
}

export function clampCashRealizedMonthDetailsOffset(offset: number | undefined): number {
  if (offset === undefined || Number.isNaN(offset)) {
    return 0;
  }
  return Math.max(0, Math.trunc(offset));
}
