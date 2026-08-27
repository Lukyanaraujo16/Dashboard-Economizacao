import { Prisma } from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../../finance/domain/active-installment-status.js';
import type {
  FinancialCategoryReadRecord,
  FinancialInstallmentReadRecord,
} from '../../finance/domain/types.js';
import {
  classifyCashAmountsByCategory,
  type CashAttributedCategorySource,
} from './cash-realized-category-composition.js';
import { addCivilDays, civilMonthKey, isCivilDateInInclusiveRange } from './civil-calendar.js';
import { deriveInstallmentCostCenterCashSplit } from './cost-center-cash-split.js';
import {
  isDashboardOverdue,
  matchesDashboardCategoryFilter,
  type DashboardCategoryFilter,
} from './dashboard-home-filters.js';
import type {
  MonthlyCashFlow,
  MonthlyCashFlowDailyExpectedPoint,
  MonthlyCashFlowDailyRealizedPoint,
} from './types.js';

const ZERO = new Prisma.Decimal(0);
const MONEY_EPS = new Prisma.Decimal('0.0001');

export type CashSettlementSource = {
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly transactionType: 'RECEIPT' | 'DISBURSEMENT';
  readonly occurredOn: Date;
  readonly netAmount: Prisma.Decimal;
};

export type CashCostCenterAllocationSource = {
  readonly amount: Prisma.Decimal;
  readonly installment: FinancialInstallmentReadRecord;
};

export type CalculateMonthlyCashFlowInput = {
  readonly tenantId: string;
  readonly today: Date;
  readonly from: Date;
  readonly to: Date;
  readonly settlements: readonly CashSettlementSource[];
  readonly receivables: readonly FinancialInstallmentReadRecord[];
  readonly payables: readonly FinancialInstallmentReadRecord[];
  /** Parcelas de qualquer status, para join de categoria/CC no realizado. */
  readonly realizedInstallments?: ReadonlyMap<string, FinancialInstallmentReadRecord>;
  /** Catálogo D8 para composição de caixa realizado (CASH-4C-CAT). */
  readonly categories?: readonly Pick<
    FinancialCategoryReadRecord,
    'externalId' | 'name' | 'type'
  >[];
  readonly categoryFilter?: DashboardCategoryFilter | null;
  /**
   * Presente somente com filtro por centro: allocations já restritas ao CC.
   * Ativas → previsto/vencido; qualquer status → realizado.
   */
  readonly costCenter?: {
    readonly expectedReceivables: readonly CashCostCenterAllocationSource[];
    readonly expectedPayables: readonly CashCostCenterAllocationSource[];
    readonly realizedReceivables: readonly CashCostCenterAllocationSource[];
    readonly realizedPayables: readonly CashCostCenterAllocationSource[];
  };
};

function isActiveInstallment(
  installment: Pick<FinancialInstallmentReadRecord, 'status'>,
): boolean {
  return (ACTIVE_INSTALLMENT_STATUSES as readonly string[]).includes(installment.status);
}

function installmentKey(
  kind: 'RECEIVABLE' | 'PAYABLE',
  externalId: string,
): string {
  return `${kind}:${externalId}`;
}

function fillCivilDays<T>(from: Date, to: Date, build: (date: Date) => T): T[] {
  const points: T[] = [];
  let cursor = from;
  while (cursor.getTime() <= to.getTime()) {
    points.push(build(cursor));
    cursor = addCivilDays(cursor, 1);
  }
  return points;
}

function isExpectedOpen(
  installment: Pick<FinancialInstallmentReadRecord, 'unpaid' | 'dueDate'>,
  today: Date,
  from: Date,
  to: Date,
): boolean {
  return (
    installment.unpaid.greaterThan(0) &&
    installment.dueDate.getTime() >= today.getTime() &&
    isCivilDateInInclusiveRange(installment.dueDate, from, to)
  );
}

function matchesSettlementCategory(
  settlement: CashSettlementSource,
  categoryFilter: DashboardCategoryFilter | null,
  realizedInstallments: ReadonlyMap<string, FinancialInstallmentReadRecord> | undefined,
): boolean {
  if (!categoryFilter) {
    return true;
  }
  const installment = realizedInstallments?.get(
    installmentKey(settlement.installmentKind, settlement.installmentExternalId),
  );
  if (!installment) {
    return false;
  }
  const expectedType = settlement.transactionType === 'RECEIPT' ? 'REVENUE' : 'EXPENSE';
  return matchesDashboardCategoryFilter(installment, categoryFilter, expectedType);
}

function allocationByExternalId(
  rows: readonly CashCostCenterAllocationSource[],
): Map<string, CashCostCenterAllocationSource> {
  const map = new Map<string, CashCostCenterAllocationSource>();
  for (const row of rows) {
    map.set(row.installment.externalId, row);
  }
  return map;
}

/**
 * Atribui net da baixa ao centro. UNAVAILABLE = multi parcial (não rateia).
 * null = parcela sem allocation neste CC.
 */
export function attributeSettlementNetToCostCenter(input: {
  readonly netAmount: Prisma.Decimal;
  readonly allocationAmount: Prisma.Decimal;
  readonly installmentTotal: Prisma.Decimal;
  readonly paid: Prisma.Decimal;
  readonly unpaid: Prisma.Decimal;
  readonly dueDate: Date;
  readonly today: Date;
}): Prisma.Decimal | 'UNAVAILABLE' {
  const split = deriveInstallmentCostCenterCashSplit({
    allocationAmount: input.allocationAmount,
    installmentTotal: input.installmentTotal,
    paid: input.paid,
    unpaid: input.unpaid,
    dueDate: input.dueDate,
    today: input.today,
  });
  if (split.kind === 'UNAVAILABLE') {
    return 'UNAVAILABLE';
  }
  if (input.allocationAmount.minus(input.installmentTotal).abs().lessThanOrEqualTo(MONEY_EPS)) {
    return input.netAmount;
  }
  if (input.installmentTotal.abs().lessThanOrEqualTo(MONEY_EPS)) {
    return 'UNAVAILABLE';
  }
  return input.netAmount.mul(input.allocationAmount).div(input.installmentTotal);
}

function sumUnpaid(rows: readonly Pick<FinancialInstallmentReadRecord, 'unpaid'>[]): Prisma.Decimal {
  return rows.reduce((acc, row) => acc.plus(row.unpaid), ZERO);
}

function splitCashTotals(
  available: boolean,
  inflows: Prisma.Decimal,
  outflows: Prisma.Decimal,
): { inflows: Prisma.Decimal | null; outflows: Prisma.Decimal | null; result: Prisma.Decimal | null } {
  if (!available) {
    return { inflows: null, outflows: null, result: null };
  }
  return { inflows, outflows, result: inflows.minus(outflows) };
}

function coverageForCurrentMonth(input: {
  readonly monthKey: string;
  readonly today: Date;
  readonly inflows: Prisma.Decimal | null;
  readonly expectedReceivables: Prisma.Decimal | null;
}): Prisma.Decimal | null {
  if (civilMonthKey(input.today) !== input.monthKey) {
    return null;
  }
  if (input.inflows === null || input.expectedReceivables === null) {
    return null;
  }
  const denominator = input.inflows.plus(input.expectedReceivables);
  if (denominator.lessThanOrEqualTo(0)) {
    return null;
  }
  return input.inflows.div(denominator);
}

/**
 * Faturamento homologado (Felipe / CASH-3A):
 * entradas realizadas + a receber ainda no prazo no mês.
 * Vencido NÃO entra. Fonte única = peças do MonthlyCashFlow; CASH-4 só compõe o card.
 */
export function monthlyBilling(flow: {
  readonly realized: { readonly inflows: Prisma.Decimal | null };
  readonly expected: { readonly receivables: Prisma.Decimal | null };
}): Prisma.Decimal | null {
  if (flow.realized.inflows === null || flow.expected.receivables === null) {
    return null;
  }
  return flow.realized.inflows.plus(flow.expected.receivables);
}

export function calculateMonthlyCashFlow(input: CalculateMonthlyCashFlowInput): MonthlyCashFlow {
  const monthKey = civilMonthKey(input.from);
  const categoryFilter = input.categoryFilter ?? null;
  const realizedLookup = input.realizedInstallments;
  const categories = input.categories ?? [];

  const receivables = input.receivables.filter(
    (row) =>
      isActiveInstallment(row) && matchesDashboardCategoryFilter(row, categoryFilter, 'REVENUE'),
  );
  const payables = input.payables.filter(
    (row) =>
      isActiveInstallment(row) && matchesDashboardCategoryFilter(row, categoryFilter, 'EXPENSE'),
  );

  let realizedAvailable = true;
  let expectedAvailable = true;
  let inflows = ZERO;
  let outflows = ZERO;
  const inflowRows: CashAttributedCategorySource[] = [];
  const outflowRows: CashAttributedCategorySource[] = [];
  const realizedByDay = new Map<number, { inflows: Prisma.Decimal; outflows: Prisma.Decimal }>();
  const expectedByDay = new Map<number, { receivables: Prisma.Decimal; payables: Prisma.Decimal }>();

  const categoryIdsFor = (settlement: CashSettlementSource): readonly string[] => {
    const installment = realizedLookup?.get(
      installmentKey(settlement.installmentKind, settlement.installmentExternalId),
    );
    return installment?.categoryExternalIds ?? [];
  };

  const addRealizedDay = (occurredOn: Date, field: 'inflows' | 'outflows', amount: Prisma.Decimal) => {
    if (!isCivilDateInInclusiveRange(occurredOn, input.from, input.to)) {
      return;
    }
    const current = realizedByDay.get(occurredOn.getTime()) ?? { inflows: ZERO, outflows: ZERO };
    current[field] = current[field].plus(amount);
    realizedByDay.set(occurredOn.getTime(), current);
  };

  const addAttributed = (
    settlement: CashSettlementSource,
    amount: Prisma.Decimal,
  ) => {
    const row = { amount, categoryExternalIds: categoryIdsFor(settlement) };
    if (settlement.transactionType === 'RECEIPT') {
      inflows = inflows.plus(amount);
      inflowRows.push(row);
      addRealizedDay(settlement.occurredOn, 'inflows', amount);
    } else {
      outflows = outflows.plus(amount);
      outflowRows.push(row);
      addRealizedDay(settlement.occurredOn, 'outflows', amount);
    }
  };

  if (input.costCenter) {
    const realizedAr = allocationByExternalId(input.costCenter.realizedReceivables);
    const realizedAp = allocationByExternalId(input.costCenter.realizedPayables);
    for (const settlement of input.settlements) {
      if (!isCivilDateInInclusiveRange(settlement.occurredOn, input.from, input.to)) {
        continue;
      }
      if (!matchesSettlementCategory(settlement, categoryFilter, realizedLookup)) {
        continue;
      }
      const table =
        settlement.installmentKind === 'RECEIVABLE' ? realizedAr : realizedAp;
      const allocation = table.get(settlement.installmentExternalId);
      if (!allocation) {
        continue;
      }
      const share = attributeSettlementNetToCostCenter({
        netAmount: settlement.netAmount,
        allocationAmount: allocation.amount,
        installmentTotal: allocation.installment.total,
        paid: allocation.installment.paid,
        unpaid: allocation.installment.unpaid,
        dueDate: allocation.installment.dueDate,
        today: input.today,
      });
      if (share === 'UNAVAILABLE') {
        realizedAvailable = false;
        continue;
      }
      addAttributed(settlement, share);
    }
  } else {
    for (const settlement of input.settlements) {
      if (!isCivilDateInInclusiveRange(settlement.occurredOn, input.from, input.to)) {
        continue;
      }
      if (!matchesSettlementCategory(settlement, categoryFilter, realizedLookup)) {
        continue;
      }
      addAttributed(settlement, settlement.netAmount);
    }
  }

  const expectedReceivableRows = input.costCenter
    ? input.costCenter.expectedReceivables
    : receivables.map((installment) => ({ amount: installment.unpaid, installment }));
  const expectedPayableRows = input.costCenter
    ? input.costCenter.expectedPayables
    : payables.map((installment) => ({ amount: installment.unpaid, installment }));

  const expectedReceivablesOpen: FinancialInstallmentReadRecord[] = [];
  const expectedPayablesOpen: FinancialInstallmentReadRecord[] = [];
  let expectedReceivablesTotal = ZERO;
  let expectedPayablesTotal = ZERO;
  let overdueReceivables = ZERO;
  let overduePayables = ZERO;
  let overdueReceivablesOfMonth = ZERO;
  let overduePayablesOfMonth = ZERO;

  const consumeStock = (
    rows: readonly CashCostCenterAllocationSource[],
    expectedType: 'REVENUE' | 'EXPENSE',
  ) => {
    for (const row of rows) {
      if (!isActiveInstallment(row.installment)) {
        continue;
      }
      if (!matchesDashboardCategoryFilter(row.installment, categoryFilter, expectedType)) {
        continue;
      }
      if (input.costCenter) {
        const split = deriveInstallmentCostCenterCashSplit({
          allocationAmount: row.amount,
          installmentTotal: row.installment.total,
          paid: row.installment.paid,
          unpaid: row.installment.unpaid,
          dueDate: row.installment.dueDate,
          today: input.today,
        });
        if (split.kind === 'UNAVAILABLE') {
          expectedAvailable = false;
          continue;
        }
        const outstanding = split.outstanding;
        const overdue = split.overdue;
        if (isExpectedOpen(row.installment, input.today, input.from, input.to)) {
          if (expectedType === 'REVENUE') {
            expectedReceivablesTotal = expectedReceivablesTotal.plus(outstanding);
            expectedReceivablesOpen.push(row.installment);
          } else {
            expectedPayablesTotal = expectedPayablesTotal.plus(outstanding);
            expectedPayablesOpen.push(row.installment);
          }
          const day = expectedByDay.get(row.installment.dueDate.getTime()) ?? {
            receivables: ZERO,
            payables: ZERO,
          };
          if (expectedType === 'REVENUE') {
            day.receivables = day.receivables.plus(outstanding);
          } else {
            day.payables = day.payables.plus(outstanding);
          }
          expectedByDay.set(row.installment.dueDate.getTime(), day);
        }
        if (expectedType === 'REVENUE') {
          overdueReceivables = overdueReceivables.plus(overdue);
          if (isCivilDateInInclusiveRange(row.installment.dueDate, input.from, input.to)) {
            overdueReceivablesOfMonth = overdueReceivablesOfMonth.plus(overdue);
          }
        } else {
          overduePayables = overduePayables.plus(overdue);
          if (isCivilDateInInclusiveRange(row.installment.dueDate, input.from, input.to)) {
            overduePayablesOfMonth = overduePayablesOfMonth.plus(overdue);
          }
        }
        continue;
      }

      if (isExpectedOpen(row.installment, input.today, input.from, input.to)) {
        if (expectedType === 'REVENUE') {
          expectedReceivablesTotal = expectedReceivablesTotal.plus(row.installment.unpaid);
          expectedReceivablesOpen.push(row.installment);
        } else {
          expectedPayablesTotal = expectedPayablesTotal.plus(row.installment.unpaid);
          expectedPayablesOpen.push(row.installment);
        }
        const day = expectedByDay.get(row.installment.dueDate.getTime()) ?? {
          receivables: ZERO,
          payables: ZERO,
        };
        if (expectedType === 'REVENUE') {
          day.receivables = day.receivables.plus(row.installment.unpaid);
        } else {
          day.payables = day.payables.plus(row.installment.unpaid);
        }
        expectedByDay.set(row.installment.dueDate.getTime(), day);
      }
      if (isDashboardOverdue(row.installment, input.today)) {
        if (expectedType === 'REVENUE') {
          overdueReceivables = overdueReceivables.plus(row.installment.unpaid);
          if (isCivilDateInInclusiveRange(row.installment.dueDate, input.from, input.to)) {
            overdueReceivablesOfMonth = overdueReceivablesOfMonth.plus(row.installment.unpaid);
          }
        } else {
          overduePayables = overduePayables.plus(row.installment.unpaid);
          if (isCivilDateInInclusiveRange(row.installment.dueDate, input.from, input.to)) {
            overduePayablesOfMonth = overduePayablesOfMonth.plus(row.installment.unpaid);
          }
        }
      }
    }
  };

  consumeStock(expectedReceivableRows, 'REVENUE');
  consumeStock(expectedPayableRows, 'EXPENSE');

  if (!input.costCenter) {
    expectedReceivablesTotal = sumUnpaid(expectedReceivablesOpen);
    expectedPayablesTotal = sumUnpaid(expectedPayablesOpen);
  }

  const realized = splitCashTotals(realizedAvailable, inflows, outflows);
  const expected = splitCashTotals(expectedAvailable, expectedReceivablesTotal, expectedPayablesTotal);

  const dailyRealized: MonthlyCashFlowDailyRealizedPoint[] = fillCivilDays(
    input.from,
    input.to,
    (date) => {
      if (!realizedAvailable) {
        return { date, inflows: null, outflows: null, result: null };
      }
      const bucket = realizedByDay.get(date.getTime());
      const dayIn = bucket?.inflows ?? ZERO;
      const dayOut = bucket?.outflows ?? ZERO;
      return { date, inflows: dayIn, outflows: dayOut, result: dayIn.minus(dayOut) };
    },
  );
  const dailyExpected: MonthlyCashFlowDailyExpectedPoint[] = fillCivilDays(
    input.from,
    input.to,
    (date) => {
      if (!expectedAvailable) {
        return { date, receivables: null, payables: null, result: null };
      }
      const bucket = expectedByDay.get(date.getTime());
      const rec = bucket?.receivables ?? ZERO;
      const pay = bucket?.payables ?? ZERO;
      return { date, receivables: rec, payables: pay, result: rec.minus(pay) };
    },
  );

  const costCenterCashSplit = realizedAvailable && expectedAvailable;

  const realizedByCategory = realizedAvailable
    ? {
        inflows: classifyCashAmountsByCategory(inflowRows, categories, 'REVENUE'),
        outflows: classifyCashAmountsByCategory(outflowRows, categories, 'EXPENSE'),
      }
    : { inflows: null, outflows: null };

  return {
    tenantId: input.tenantId,
    today: input.today,
    monthKey,
    from: input.from,
    to: input.to,
    costCenterCashSplit,
    realized: {
      inflows: realized.inflows,
      outflows: realized.outflows,
      result: realized.result,
    },
    realizedByCategory,
    expected: {
      receivables: expected.inflows,
      payables: expected.outflows,
      result: expected.result,
    },
    overdue: {
      receivables: expectedAvailable ? overdueReceivables : null,
      payables: expectedAvailable ? overduePayables : null,
      ofMonth: {
        receivables: expectedAvailable ? overdueReceivablesOfMonth : null,
        payables: expectedAvailable ? overduePayablesOfMonth : null,
      },
    },
    coverage: coverageForCurrentMonth({
      monthKey,
      today: input.today,
      inflows: realized.inflows,
      expectedReceivables: expected.inflows,
    }),
    daily: {
      realized: dailyRealized,
      expected: dailyExpected,
    },
  };
}
