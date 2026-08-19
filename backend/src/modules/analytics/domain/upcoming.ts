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
