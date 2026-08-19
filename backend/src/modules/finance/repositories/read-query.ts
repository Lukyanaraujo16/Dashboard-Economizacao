import type { Prisma } from '../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../domain/active-installment-status.js';
import type { FinanceReadScope } from '../domain/types.js';

export function assertTenantId(tenantId: string): void {
  if (tenantId.trim() === '') {
    throw new Error('tenantId é obrigatório na leitura financeira.');
  }
}

export function buildActiveInstallmentWhere(
  scope: FinanceReadScope,
): Prisma.ReceivableWhereInput & Prisma.PayableWhereInput {
  const where: Prisma.ReceivableWhereInput & Prisma.PayableWhereInput = {
    tenantId: scope.tenantId,
    status: { in: [...ACTIVE_INSTALLMENT_STATUSES] },
  };
  if (scope.integrationId !== undefined && scope.integrationId.trim() !== '') {
    where.integrationId = scope.integrationId;
  }
  return where;
}
