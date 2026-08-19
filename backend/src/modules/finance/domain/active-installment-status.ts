import type { FinancialInstallmentStatus } from '../../../generated/prisma/client.js';

/** Status persistidos que as queries de títulos ativos selecionam. Não é overdue derivado. */
export const ACTIVE_INSTALLMENT_STATUSES = [
  'OPEN',
  'OVERDUE',
  'PARTIALLY_PAID',
] as const satisfies readonly FinancialInstallmentStatus[];

export type ActiveInstallmentStatus = (typeof ACTIVE_INSTALLMENT_STATUSES)[number];
