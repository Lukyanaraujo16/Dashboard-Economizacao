import { Prisma } from '../../../generated/prisma/client.js';
import type { InstallmentStockSnapshot } from './types.js';

export type InstallmentSnapshotInput = {
  readonly dueDate: Date;
  readonly unpaid: Prisma.Decimal;
};

const ZERO = new Prisma.Decimal(0);

/**
 * Classifica estoque ativo por dueDate vs hoje civil.
 * status/upstream não entram: elegibilidade já foi aplicada pelo read model.
 */
export function calculateInstallmentStockSnapshot(
  records: readonly InstallmentSnapshotInput[],
  today: Date,
): InstallmentStockSnapshot {
  let overdue = ZERO;
  let upcoming = ZERO;
  const todayTime = today.getTime();
  for (const record of records) {
    if (record.dueDate.getTime() < todayTime) {
      overdue = overdue.plus(record.unpaid);
    } else {
      upcoming = upcoming.plus(record.unpaid);
    }
  }
  return {
    open: overdue.plus(upcoming),
    overdue,
    upcoming,
  };
}
