import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { Prisma } from '../../../../generated/prisma/client.js';
import type { MappedSettlement } from '../domain/conta-azul-settlement-mappers.js';
import type { FinancialSyncScope } from './financial.repository.js';

export type LedgerInstallmentPaid = {
  readonly kind: 'RECEIVABLE' | 'PAYABLE';
  readonly externalId: string;
  readonly paid: Prisma.Decimal;
};

export type LedgerReconciliationRow = {
  readonly tenantId: string;
  readonly installmentExternalId: string;
  readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
  readonly paid: string;
  readonly grossActive: string;
  readonly netActive: string;
  readonly grossMatchesPaid: boolean;
  readonly netMatchesPaid: boolean;
  readonly activeCount: number;
  readonly knownMissingFromUpstream: number;
};

export type ContaAzulLedgerRepository = {
  listPaidInstallments(scope: {
    readonly tenantId: string;
    readonly integrationId: string;
  }): Promise<LedgerInstallmentPaid[]>;
  listByInstallment(
    scope: { readonly tenantId: string; readonly integrationId: string },
    installmentExternalId: string,
  ): Promise<
    Array<{ readonly externalId: string; readonly lifecycleStatus: 'ACTIVE' | 'DELETED' }>
  >;
  upsertSettlements(
    scope: FinancialSyncScope,
    installmentKind: 'RECEIVABLE' | 'PAYABLE',
    items: readonly MappedSettlement[],
  ): Promise<void>;
};

export function createContaAzulLedgerRepository(prisma: PrismaClient): ContaAzulLedgerRepository {
  return {
    async listPaidInstallments(scope) {
      const where = {
        tenantId: scope.tenantId,
        integrationId: scope.integrationId,
        paid: { gt: 0 },
      };
      const [receivables, payables] = await Promise.all([
        prisma.receivable.findMany({
          where,
          select: { externalId: true, paid: true },
        }),
        prisma.payable.findMany({
          where,
          select: { externalId: true, paid: true },
        }),
      ]);
      return [
        ...receivables.map((row) => ({
          kind: 'RECEIVABLE' as const,
          externalId: row.externalId,
          paid: row.paid,
        })),
        ...payables.map((row) => ({
          kind: 'PAYABLE' as const,
          externalId: row.externalId,
          paid: row.paid,
        })),
      ];
    },

    async listByInstallment(scope, installmentExternalId) {
      return prisma.financialTransaction.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          installmentExternalId,
        },
        select: { externalId: true, lifecycleStatus: true },
      });
    },

    async upsertSettlements(scope, installmentKind, items) {
      if (items.length === 0) {
        return;
      }
      await prisma.$transaction(
        items.map((item) =>
          prisma.financialTransaction.upsert({
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
              installmentExternalId: item.installmentExternalId,
              installmentKind,
              transactionType: item.transactionType,
              occurredOn: item.occurredOn,
              grossAmount: item.grossAmount,
              netAmount: item.netAmount,
              interestAmount: item.interestAmount,
              fineAmount: item.fineAmount,
              discountAmount: item.discountAmount,
              feeAmount: item.feeAmount,
              financialAccountExternalId: item.financialAccountExternalId,
              paymentMethod: item.paymentMethod,
              upstreamVersion: item.upstreamVersion,
              upstreamUpdatedAt: item.upstreamUpdatedAt,
              lifecycleStatus: 'ACTIVE',
              syncedAt: scope.syncedAt,
            },
            update: {
              installmentExternalId: item.installmentExternalId,
              installmentKind,
              transactionType: item.transactionType,
              occurredOn: item.occurredOn,
              grossAmount: item.grossAmount,
              netAmount: item.netAmount,
              interestAmount: item.interestAmount,
              fineAmount: item.fineAmount,
              discountAmount: item.discountAmount,
              feeAmount: item.feeAmount,
              financialAccountExternalId: item.financialAccountExternalId,
              paymentMethod: item.paymentMethod,
              upstreamVersion: item.upstreamVersion,
              upstreamUpdatedAt: item.upstreamUpdatedAt,
              lifecycleStatus: 'ACTIVE',
              syncedAt: scope.syncedAt,
            },
          }),
        ),
      );
    },
  };
}

export async function reconcileInstallmentLedger(
  prisma: PrismaClient,
  input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly installmentExternalId: string;
    readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
    readonly upstreamExternalIds: readonly string[];
  },
): Promise<LedgerReconciliationRow | null> {
  const paidRow =
    input.installmentKind === 'RECEIVABLE'
      ? await prisma.receivable.findFirst({
          where: {
            tenantId: input.tenantId,
            integrationId: input.integrationId,
            externalId: input.installmentExternalId,
          },
          select: { paid: true },
        })
      : await prisma.payable.findFirst({
          where: {
            tenantId: input.tenantId,
            integrationId: input.integrationId,
            externalId: input.installmentExternalId,
          },
          select: { paid: true },
        });
  if (!paidRow) {
    return null;
  }

  const rows = await prisma.financialTransaction.findMany({
    where: {
      tenantId: input.tenantId,
      integrationId: input.integrationId,
      installmentExternalId: input.installmentExternalId,
    },
    select: {
      externalId: true,
      lifecycleStatus: true,
      grossAmount: true,
      netAmount: true,
    },
  });

  const active = rows.filter((row) => row.lifecycleStatus === 'ACTIVE');
  const grossActive = active.reduce((acc, row) => acc.add(row.grossAmount), new Prisma.Decimal(0));
  const netActive = active.reduce((acc, row) => acc.add(row.netAmount), new Prisma.Decimal(0));
  const upstream = new Set(input.upstreamExternalIds);
  const knownMissingFromUpstream = rows.filter(
    (row) => row.lifecycleStatus === 'ACTIVE' && !upstream.has(row.externalId),
  ).length;

  return {
    tenantId: input.tenantId,
    installmentExternalId: input.installmentExternalId,
    installmentKind: input.installmentKind,
    paid: paidRow.paid.toString(),
    grossActive: grossActive.toString(),
    netActive: netActive.toString(),
    grossMatchesPaid: grossActive.equals(paidRow.paid),
    netMatchesPaid: netActive.equals(paidRow.paid),
    activeCount: active.length,
    knownMissingFromUpstream,
  };
}
