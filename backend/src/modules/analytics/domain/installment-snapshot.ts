import { Prisma } from '../../../generated/prisma/client.js';
import { classifyInstallmentDueSituation } from './installment-due-situation.js';
import type { InstallmentPendingStock, InstallmentStockSnapshot } from './types.js';

export type InstallmentSnapshotInput = {
  readonly dueDate: Date;
  readonly unpaid: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);

/**
 * Estoque pendente em 3 baldes exclusivos:
 * OVERDUE (dueDate < today), DUE_TODAY, UPCOMING (dueDate > today).
 * status/upstream não entram: elegibilidade já foi aplicada pelo read model.
 */
export function calculateInstallmentPendingStock(
  records: readonly InstallmentSnapshotInput[],
  today: Date,
): InstallmentPendingStock {
  let overdue = ZERO;
  let dueToday = ZERO;
  let upcoming = ZERO;
  for (const record of records) {
    const situation = classifyInstallmentDueSituation(record.dueDate, today);
    if (situation === 'OVERDUE') {
      overdue = overdue.plus(record.unpaid);
    } else if (situation === 'DUE_TODAY') {
      dueToday = dueToday.plus(record.unpaid);
    } else {
      upcoming = upcoming.plus(record.unpaid);
    }
  }
  return {
    open: overdue.plus(dueToday).plus(upcoming),
    overdue,
    dueToday,
    upcoming,
  };
}

/**
 * Snapshot legado da overview: `upcoming` inclui vence-hoje
 * (`dueToday + upcoming` do estoque pendente).
 */
export function calculateInstallmentStockSnapshot(
  records: readonly InstallmentSnapshotInput[],
  today: Date,
): InstallmentStockSnapshot {
  const pending = calculateInstallmentPendingStock(records, today);
  return {
    open: pending.open,
    overdue: pending.overdue,
    upcoming: pending.dueToday.plus(pending.upcoming),
  };
}
