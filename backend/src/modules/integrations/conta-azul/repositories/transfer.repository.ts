import type { PrismaClient } from '../../../../generated/prisma/client.js';
import type { FinancialTransferMatchStatus } from '../../../../generated/prisma/client.js';
import type { MappedFinancialTransfer } from '../domain/conta-azul-transfer-mappers.js';
import {
  decideTransferMatches,
  type TransferMatchDecision,
} from '../domain/conta-azul-transfer-match.js';
import type { FinancialSyncScope } from './financial.repository.js';

export type PersistedFinancialTransfer = {
  readonly id: string;
  readonly externalId: string;
  readonly occurredOn: Date;
  readonly amount: import('../../../../generated/prisma/client.js').Prisma.Decimal;
  readonly sourceFinancialAccountExternalId: string;
  readonly destinationFinancialAccountExternalId: string;
  readonly description: string | null;
  readonly matchStatus: FinancialTransferMatchStatus;
};

export type TransferMatchApplySummary = {
  readonly matched: number;
  readonly unmatched: number;
  readonly ambiguous: number;
  readonly decisions: readonly TransferMatchDecision[];
};

export type ContaAzulTransferRepository = {
  upsertTransfers(scope: FinancialSyncScope, items: readonly MappedFinancialTransfer[]): Promise<void>;
  listByOccurredOn(
    scope: { readonly tenantId: string; readonly integrationId: string },
    from: Date,
    to: Date,
  ): Promise<PersistedFinancialTransfer[]>;
  applyMatches(
    scope: { readonly tenantId: string; readonly integrationId: string },
    from: Date,
    to: Date,
  ): Promise<TransferMatchApplySummary>;
};

export function createContaAzulTransferRepository(prisma: PrismaClient): ContaAzulTransferRepository {
  return {
    async upsertTransfers(scope, items) {
      if (items.length === 0) {
        return;
      }
      await prisma.$transaction(
        items.map((item) =>
          prisma.financialTransfer.upsert({
            where: {
              integrationId_externalId: {
                integrationId: scope.integrationId,
                externalId: item.externalId,
              },
            },
            create: {
              tenantId: scope.tenantId,
              integrationId: scope.integrationId,
              externalId: item.externalId,
              occurredOn: item.occurredOn,
              amount: item.amount,
              sourceFinancialAccountExternalId: item.sourceFinancialAccountExternalId,
              destinationFinancialAccountExternalId: item.destinationFinancialAccountExternalId,
              description: item.description,
              matchStatus: 'UNMATCHED',
              syncedAt: scope.syncedAt,
            },
            update: {
              occurredOn: item.occurredOn,
              amount: item.amount,
              sourceFinancialAccountExternalId: item.sourceFinancialAccountExternalId,
              destinationFinancialAccountExternalId: item.destinationFinancialAccountExternalId,
              description: item.description,
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );
    },

    async listByOccurredOn(scope, from, to) {
      return prisma.financialTransfer.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          occurredOn: { gte: from, lte: to },
        },
        select: {
          id: true,
          externalId: true,
          occurredOn: true,
          amount: true,
          sourceFinancialAccountExternalId: true,
          destinationFinancialAccountExternalId: true,
          description: true,
          matchStatus: true,
        },
        orderBy: [{ occurredOn: 'asc' }, { id: 'asc' }],
      });
    },

    async applyMatches(scope, from, to) {
      const transfers = await prisma.financialTransfer.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          occurredOn: { gte: from, lte: to },
        },
        select: {
          id: true,
          occurredOn: true,
          amount: true,
          sourceFinancialAccountExternalId: true,
          destinationFinancialAccountExternalId: true,
        },
      });
      const settlements = await prisma.financialTransaction.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          occurredOn: { gte: from, lte: to },
        },
        select: {
          id: true,
          occurredOn: true,
          netAmount: true,
          financialAccountExternalId: true,
          lifecycleStatus: true,
          transactionType: true,
        },
      });
      const decisions = decideTransferMatches(transfers, settlements);
      const transferIds = transfers.map((row) => row.id);
      const matched = decisions.filter((row) => row.status === 'MATCHED');

      await prisma.$transaction(async (tx) => {
        if (transferIds.length > 0) {
          await tx.financialTransaction.updateMany({
            where: {
              tenantId: scope.tenantId,
              integrationId: scope.integrationId,
              financialTransferId: { in: transferIds },
            },
            data: { financialTransferId: null },
          });
        }
        for (const decision of decisions) {
          await tx.financialTransfer.update({
            where: { id: decision.transferId },
            data: { matchStatus: decision.status },
          });
        }
        for (const decision of matched) {
          if (decision.status !== 'MATCHED') {
            continue;
          }
          await tx.financialTransaction.updateMany({
            where: {
              id: decision.settlementId,
              tenantId: scope.tenantId,
              integrationId: scope.integrationId,
            },
            data: { financialTransferId: decision.transferId },
          });
        }
      });

      return {
        matched: matched.length,
        unmatched: decisions.filter((row) => row.status === 'UNMATCHED').length,
        ambiguous: decisions.filter((row) => row.status === 'AMBIGUOUS').length,
        decisions,
      };
    },
  };
}
