import { Prisma } from '../../../generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../../finance/domain/types.js';
import type { UpcomingInstallment } from './types.js';

const ZERO = new Prisma.Decimal(0);

export function assertNDays(nDays: number): void {
  if (typeof nDays !== 'number' || !Number.isInteger(nDays) || nDays < 0) {
    throw new Error('nDays deve ser um inteiro >= 0.');
  }
}

export function mapUpcomingInstallments(
  records: readonly FinancialInstallmentReadRecord[],
): readonly UpcomingInstallment[] {
  return records
    .filter((record) => record.unpaid.greaterThan(ZERO))
    .map((record) => ({
      id: record.id,
      dueDate: record.dueDate,
      unpaid: record.unpaid,
      status: record.status,
    }));
}

export type UpcomingWindowSummary = {
  readonly receivable: Prisma.Decimal;
  readonly payable: Prisma.Decimal;
  readonly net: Prisma.Decimal;
};

/** Soma o unpaid já filtrado pelo upcoming 9C. Não recalcula janela nem status. */
export function sumUpcomingUnpaid(
  items: readonly Pick<UpcomingInstallment, 'unpaid'>[],
): Prisma.Decimal {
  let total = ZERO;
  for (const item of items) {
    total = total.plus(item.unpaid);
  }
  return total;
}

export function summarizeUpcomingWindow(
  receivables: readonly Pick<UpcomingInstallment, 'unpaid'>[],
  payables: readonly Pick<UpcomingInstallment, 'unpaid'>[],
): UpcomingWindowSummary {
  const receivable = sumUpcomingUnpaid(receivables);
  const payable = sumUpcomingUnpaid(payables);
  return {
    receivable,
    payable,
    net: receivable.minus(payable),
  };
}
