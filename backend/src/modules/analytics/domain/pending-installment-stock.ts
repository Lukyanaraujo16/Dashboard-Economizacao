import { Prisma } from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../../finance/domain/active-installment-status.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import type { FinancialCategoryType } from '../../../generated/prisma/client.js';
import type { CashCostCenterAllocationSource } from './monthly-cash-flow.js';
import { deriveInstallmentCostCenterCashSplit } from './cost-center-cash-split.js';
import {
  matchesDashboardCategoryFilter,
  type DashboardCategoryFilter,
} from './dashboard-home-filters.js';
import {
  civilDaysOverdue,
  classifyInstallmentDueSituation,
  compareInstallmentDueSituation,
  type InstallmentDueSituation,
} from './installment-due-situation.js';
import { calculateInstallmentPendingStock } from './installment-snapshot.js';
import type { InstallmentPendingStock } from './types.js';

const ZERO = new Prisma.Decimal(0);

export type PendingStockItem = {
  readonly installment: FinancialInstallmentReadRecord;
  readonly amount: Prisma.Decimal;
  readonly situation: InstallmentDueSituation;
  readonly overdueDays: number | null;
};

export type SelectPendingStockInput = {
  readonly rows: readonly CashCostCenterAllocationSource[];
  readonly today: Date;
  readonly categoryFilter: DashboardCategoryFilter | null;
  readonly hasCostCenter: boolean;
  readonly expectedType: FinancialCategoryType;
};

export type SelectPendingStockResult = {
  readonly available: boolean;
  readonly items: readonly PendingStockItem[];
  readonly totals: InstallmentPendingStock;
};

function isActiveInstallment(
  installment: Pick<FinancialInstallmentReadRecord, 'status'>,
): boolean {
  return (ACTIVE_INSTALLMENT_STATUSES as readonly string[]).includes(installment.status);
}

/**
 * Estoque pendente atual: ACTIVE + saldo aberto, sem recorte de mês
 * e sem exigir dueDate >= today.
 */
export function selectPendingStockInstallments(
  input: SelectPendingStockInput,
): SelectPendingStockResult {
  const items: PendingStockItem[] = [];
  let available = true;

  for (const row of input.rows) {
    if (!isActiveInstallment(row.installment)) {
      continue;
    }
    if (!matchesDashboardCategoryFilter(row.installment, input.categoryFilter, input.expectedType)) {
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

    if (!amount.greaterThan(0)) {
      continue;
    }

    items.push({
      installment: row.installment,
      amount,
      situation: classifyInstallmentDueSituation(row.installment.dueDate, input.today),
      overdueDays: civilDaysOverdue(row.installment.dueDate, input.today),
    });
  }

  const totals = calculateInstallmentPendingStock(
    items.map((item) => ({ dueDate: item.installment.dueDate, unpaid: item.amount })),
    input.today,
  );

  return { available, items, totals };
}

export function comparePendingStockItems(
  left: PendingStockItem,
  right: PendingStockItem,
  partyNameFor: (installment: FinancialInstallmentReadRecord) => string | null,
): number {
  const situationDiff = compareInstallmentDueSituation(left.situation, right.situation);
  if (situationDiff !== 0) {
    return situationDiff;
  }
  const dueDiff = left.installment.dueDate.getTime() - right.installment.dueDate.getTime();
  if (dueDiff !== 0) {
    return dueDiff;
  }
  const leftName = partyNameFor(left.installment) ?? '';
  const rightName = partyNameFor(right.installment) ?? '';
  const nameDiff = leftName.localeCompare(rightName, 'pt-BR', { sensitivity: 'base' });
  if (nameDiff !== 0) {
    return nameDiff;
  }
  return left.installment.externalId.localeCompare(right.installment.externalId, 'pt-BR');
}

export function emptyPendingStockTotals(): InstallmentPendingStock {
  return {
    open: ZERO,
    overdue: ZERO,
    dueToday: ZERO,
    upcoming: ZERO,
  };
}
