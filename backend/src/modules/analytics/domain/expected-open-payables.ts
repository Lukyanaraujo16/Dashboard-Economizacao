import { Prisma } from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../../finance/domain/active-installment-status.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import { isCivilDateInInclusiveRange } from './civil-calendar.js';
import type { CashCostCenterAllocationSource } from './monthly-cash-flow.js';
import { deriveInstallmentCostCenterCashSplit } from './cost-center-cash-split.js';
import {
  isExpectedOpenReceivable,
  type OverdueOfMonthItem,
} from './expected-open-receivables.js';
import {
  isDashboardOverdue,
  matchesDashboardCategoryFilter,
  type DashboardCategoryFilter,
} from './dashboard-home-filters.js';

const ZERO = new Prisma.Decimal(0);

export type ExpectedOpenPayableItem = {
  readonly installment: FinancialInstallmentReadRecord;
  readonly amount: Prisma.Decimal;
};

export type SelectExpectedOpenPayablesInput = {
  readonly rows: readonly CashCostCenterAllocationSource[];
  readonly today: Date;
  readonly from: Date;
  readonly to: Date;
  readonly categoryFilter: DashboardCategoryFilter | null;
  readonly hasCostCenter: boolean;
};

export type SelectExpectedOpenPayablesResult = {
  readonly available: boolean;
  readonly items: readonly ExpectedOpenPayableItem[];
  readonly total: Prisma.Decimal;
  readonly byDay: ReadonlyMap<number, Prisma.Decimal>;
};

function isActiveInstallment(
  installment: Pick<FinancialInstallmentReadRecord, 'status'>,
): boolean {
  return (ACTIVE_INSTALLMENT_STATUSES as readonly string[]).includes(installment.status);
}

/** Mesma regra de datas/unpaid que receivables — nome explícito para payables. */
export function isExpectedOpenPayable(
  installment: Pick<FinancialInstallmentReadRecord, 'unpaid' | 'dueDate'>,
  today: Date,
  from: Date,
  to: Date,
): boolean {
  return isExpectedOpenReceivable(installment, today, from, to);
}

/**
 * Mesma regra de elegibilidade de monthlyCashFlow.expected.payables (CASH-3B).
 * Fonte única para KPI e detalhamento individual.
 */
export function selectExpectedOpenPayables(
  input: SelectExpectedOpenPayablesInput,
): SelectExpectedOpenPayablesResult {
  const items: ExpectedOpenPayableItem[] = [];
  const byDay = new Map<number, Prisma.Decimal>();
  let available = true;
  let total = ZERO;

  for (const row of input.rows) {
    if (!isActiveInstallment(row.installment)) {
      continue;
    }
    if (!matchesDashboardCategoryFilter(row.installment, input.categoryFilter, 'EXPENSE')) {
      continue;
    }

    let amount: Prisma.Decimal;
    if (input.hasCostCenter) {
      const split = deriveInstallmentCostCenterCashSplit({
        allocationAmount: row.amount,
        installmentTotal: row.installment.total,
        paid: row.installment.paid,
        unpaid: row.installment.unpaid,
        dueDate: row.installment.dueDate,
        today: input.today,
      });
      if (split.kind === 'UNAVAILABLE') {
        available = false;
        continue;
      }
      amount = split.outstanding;
    } else {
      amount = row.installment.unpaid;
    }

    if (!isExpectedOpenPayable(row.installment, input.today, input.from, input.to)) {
      continue;
    }

    items.push({ installment: row.installment, amount });
    total = total.plus(amount);
    const dayKey = row.installment.dueDate.getTime();
    byDay.set(dayKey, (byDay.get(dayKey) ?? ZERO).plus(amount));
  }

  return { available, items, total, byDay };
}

export type AccumulatePayableOverdueInput = {
  readonly rows: readonly CashCostCenterAllocationSource[];
  readonly today: Date;
  readonly from: Date;
  readonly to: Date;
  readonly categoryFilter: DashboardCategoryFilter | null;
  readonly hasCostCenter: boolean;
};

export type AccumulatePayableOverdueResult = {
  readonly available: boolean;
  readonly overdue: Prisma.Decimal;
  readonly overdueOfMonth: Prisma.Decimal;
  /** Parcelas que entram em overdue.ofMonth (amount > 0). */
  readonly ofMonthItems: readonly OverdueOfMonthItem[];
};

/** Vencidos de pagáveis — espelha o ramo EXPENSE de consumePayableStock no cash flow. */
export function accumulatePayableOverdue(
  input: AccumulatePayableOverdueInput,
): AccumulatePayableOverdueResult {
  let available = true;
  let overdue = ZERO;
  let overdueOfMonth = ZERO;
  const ofMonthItems: OverdueOfMonthItem[] = [];

  for (const row of input.rows) {
    if (!isActiveInstallment(row.installment)) {
      continue;
    }
    if (!matchesDashboardCategoryFilter(row.installment, input.categoryFilter, 'EXPENSE')) {
      continue;
    }

    if (input.hasCostCenter) {
      const split = deriveInstallmentCostCenterCashSplit({
        allocationAmount: row.amount,
        installmentTotal: row.installment.total,
        paid: row.installment.paid,
        unpaid: row.installment.unpaid,
        dueDate: row.installment.dueDate,
        today: input.today,
      });
      if (split.kind === 'UNAVAILABLE') {
        available = false;
        continue;
      }
      overdue = overdue.plus(split.overdue);
      if (isCivilDateInInclusiveRange(row.installment.dueDate, input.from, input.to)) {
        overdueOfMonth = overdueOfMonth.plus(split.overdue);
        if (split.overdue.greaterThan(0)) {
          ofMonthItems.push({ installment: row.installment, amount: split.overdue });
        }
      }
      continue;
    }

    if (isDashboardOverdue(row.installment, input.today)) {
      overdue = overdue.plus(row.installment.unpaid);
      if (isCivilDateInInclusiveRange(row.installment.dueDate, input.from, input.to)) {
        overdueOfMonth = overdueOfMonth.plus(row.installment.unpaid);
        if (row.installment.unpaid.greaterThan(0)) {
          ofMonthItems.push({
            installment: row.installment,
            amount: row.installment.unpaid,
          });
        }
      }
    }
  }

  return { available, overdue, overdueOfMonth, ofMonthItems };
}

export function compareExpectedOpenPayableItems(
  left: ExpectedOpenPayableItem,
  right: ExpectedOpenPayableItem,
  supplierNameFor: (installment: FinancialInstallmentReadRecord) => string | null,
): number {
  const dueDiff = left.installment.dueDate.getTime() - right.installment.dueDate.getTime();
  if (dueDiff !== 0) {
    return dueDiff;
  }
  const leftName = supplierNameFor(left.installment) ?? '';
  const rightName = supplierNameFor(right.installment) ?? '';
  const nameDiff = leftName.localeCompare(rightName, 'pt-BR', { sensitivity: 'base' });
  if (nameDiff !== 0) {
    return nameDiff;
  }
  return left.installment.externalId.localeCompare(right.installment.externalId, 'pt-BR');
}
