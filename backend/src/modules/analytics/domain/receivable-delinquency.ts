import { Prisma } from '../../../generated/prisma/client.js';
import type { InstallmentStockSnapshot, ReceivableDelinquency } from './types.js';

const ZERO = new Prisma.Decimal(0);
const HUNDRED = new Prisma.Decimal(100);

/**
 * Taxa de inadimplência a partir do snapshot AR da 9A.
 * Não reclassifica dueDate/status: confia na invariante
 * open = overdue + upcoming com unpaid não negativos,
 * logo overdue ∈ [0, open].
 */
export function calculateReceivableDelinquency(
  receivables: InstallmentStockSnapshot,
): ReceivableDelinquency {
  const overdueUnpaid = receivables.overdue;
  const openUnpaid = receivables.open;
  if (openUnpaid.equals(ZERO)) {
    return { overdueUnpaid, openUnpaid, rate: null };
  }
  return {
    overdueUnpaid,
    openUnpaid,
    rate: overdueUnpaid.div(openUnpaid).times(HUNDRED),
  };
}
