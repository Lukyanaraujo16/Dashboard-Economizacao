import type { PrismaClient } from '../../../generated/prisma/client.js';
import { Prisma } from '../../../generated/prisma/client.js';
import type { FinanceReadScope } from '../domain/types.js';
import { assertTenantId } from './read-query.js';

export type LedgerSettlementReadRecord = {
  readonly externalId: string;
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

export type LedgerIdentitySettlementReadRecord = LedgerSettlementReadRecord & {
  readonly integrationId: string;
};

export type LedgerReadRepository = {
  listActiveByOccurredOn(query: LedgerOccurredOnQuery): Promise<readonly LedgerSettlementReadRecord[]>;
  /**
   * Mesmos filtros de listActiveByOccurredOn, com integrationId para o join de identidade.
   * ACTIVE, sem transferência interna, occurredOn inclusivo.
   */
  listActiveForCounterpartyIdentity(
    query: LedgerOccurredOnQuery,
  ): Promise<readonly LedgerIdentitySettlementReadRecord[]>;
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
        // CASH-9C: ghost de transferência interna fica ACTIVE, mas fora do realizado.
        financialTransferId: null,
        occurredOn: { gte: query.from, lte: query.to },
      };
      if (query.integrationId !== undefined && query.integrationId.trim() !== '') {
        where.integrationId = query.integrationId;
      }
      const rows = await prisma.financialTransaction.findMany({
        where,
        select: {
          externalId: true,
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

    async listActiveForCounterpartyIdentity(query) {
      assertTenantId(query.tenantId);
      if (query.from.getTime() > query.to.getTime()) {
        return [];
      }
      const where: Prisma.FinancialTransactionWhereInput = {
        tenantId: query.tenantId,
        lifecycleStatus: 'ACTIVE',
        financialTransferId: null,
        occurredOn: { gte: query.from, lte: query.to },
      };
      if (query.integrationId !== undefined && query.integrationId.trim() !== '') {
        where.integrationId = query.integrationId;
      }
      const rows = await prisma.financialTransaction.findMany({
        where,
        select: {
          integrationId: true,
          externalId: true,
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
