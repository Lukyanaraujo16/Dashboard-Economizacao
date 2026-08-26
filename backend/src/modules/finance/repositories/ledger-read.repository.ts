import type { PrismaClient } from '../../../generated/prisma/client.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { FinanceReadScope } from '../domain/types.js';
import { assertTenantId } from './read-query.js';

export type LedgerSettlementReadRecord = {
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly transactionType: 'RECEIPT' | 'DISBURSEMENT';
  readonly occurredOn: Date;
  readonly netAmount: Prisma.Decimal;
};

export type LedgerOccurredOnQuery = FinanceReadScope & {
  readonly from: Date;
  readonly to: Date;
};

export type LedgerReadRepository = {
  listActiveByOccurredOn(query: LedgerOccurredOnQuery): Promise<readonly LedgerSettlementReadRecord[]>;
};

export function createLedgerReadRepository(prisma: PrismaClient): LedgerReadRepository {
  return {
    async listActiveByOccurredOn(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const where: Prisma.FinancialTransactionWhereInput = {
        tenantId: query.tenantId,
        lifecycleStatus: 'ACTIVE',
        occurredOn: { gte: query.from, lte: query.to },
      };
      if (query.integrationId !== undefined && query.integrationId.trim() !== '') {
        where.integrationId = query.integrationId;
      }
      const rows = await prisma.financialTransaction.findMany({
        where,
        select: {
          installmentExternalId: true,
          installmentKind: true,
          transactionType: true,
          occurredOn: true,
          netAmount: true,
        },
        orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
      });
      return rows;
    },
  };
}
