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

export type LedgerMultiActiveInstallment = {
  readonly kind: 'RECEIVABLE' | 'PAYABLE';
  readonly externalId: string;
  readonly activeCount: number;
};

export type LedgerLifecycleProbeCandidate = {
  readonly kind: 'RECEIVABLE' | 'PAYABLE';
  readonly externalId: string;
  readonly lastLifecycleCheckedAt: Date | null;
};

export type ContaAzulLedgerRepository = {
  listPaidInstallments(scope: {
    readonly tenantId: string;
    readonly integrationId: string;
  }): Promise<LedgerInstallmentPaid[]>;
  /**
   * Correção 10-C (gap incremental): parcelas com mais de um settlement ACTIVE
   * no mesmo tenant/integration. Só sinaliza fila de reconciliação — não tombstona.
   */
  listMultiActiveInstallments(scope: {
    readonly tenantId: string;
    readonly integrationId: string;
  }): Promise<LedgerMultiActiveInstallment[]>;
  /**
   * Correção 10-F: fila bounded de maintenance/probe.
   * Ordena neverChecked primeiro, depois lastLifecycleCheckedAt ASC.
   * NÃO trunca changedInstallments / multiActive no sync — só candidates adicionais.
   */
  listBoundedLifecycleProbeCandidates(
    scope: {
      readonly tenantId: string;
      readonly integrationId: string;
    },
    input: {
      readonly occurredOnFrom: Date;
      readonly limit: number;
    },
  ): Promise<LedgerLifecycleProbeCandidate[]>;
  touchLifecycleCheckpoint(
    scope: {
      readonly tenantId: string;
      readonly integrationId: string;
    },
    input: {
      readonly installmentKind: 'RECEIVABLE' | 'PAYABLE';
      readonly installmentExternalId: string;
      readonly checkedAt: Date;
    },
  ): Promise<void>;
  listByInstallment(
    scope: { readonly tenantId: string; readonly integrationId: string },
    installmentExternalId: string,
  ): Promise<
    Array<{
      readonly externalId: string;
      readonly lifecycleStatus: 'ACTIVE' | 'DELETED';
      readonly grossAmount: Prisma.Decimal;
    }>
  >;
  upsertSettlements(
    scope: FinancialSyncScope,
    installmentKind: 'RECEIVABLE' | 'PAYABLE',
    items: readonly MappedSettlement[],
  ): Promise<void>;
  markDeleted(
    scope: { readonly tenantId: string; readonly integrationId: string },
    externalId: string,
  ): Promise<boolean>;
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
          orderBy: { externalId: 'asc' },
        }),
        prisma.payable.findMany({
          where,
          select: { externalId: true, paid: true },
          orderBy: { externalId: 'asc' },
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

    async listMultiActiveInstallments(scope) {
      const groups = await prisma.financialTransaction.groupBy({
        by: ['installmentKind', 'installmentExternalId'],
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          lifecycleStatus: 'ACTIVE',
        },
        _count: { _all: true },
        having: {
          installmentExternalId: {
            _count: {
              gt: 1,
            },
          },
        },
        orderBy: {
          installmentExternalId: 'asc',
        },
      });
      return groups.map((row) => ({
        kind: row.installmentKind,
        externalId: row.installmentExternalId,
        activeCount: row._count._all,
      }));
    },

    async listBoundedLifecycleProbeCandidates(scope, input) {
      if (input.limit <= 0) {
        return [];
      }
      const groups = await prisma.financialTransaction.groupBy({
        by: ['installmentKind', 'installmentExternalId'],
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          lifecycleStatus: 'ACTIVE',
          occurredOn: { gte: input.occurredOnFrom },
        },
      });
      if (groups.length === 0) {
        return [];
      }
      const checkpoints = await prisma.financialInstallmentLifecycleCheckpoint.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          OR: groups.map((row) => ({
            installmentKind: row.installmentKind,
            installmentExternalId: row.installmentExternalId,
          })),
        },
        select: {
          installmentKind: true,
          installmentExternalId: true,
          lastLifecycleCheckedAt: true,
        },
      });
      const checkedAtByKey = new Map(
        checkpoints.map((row) => [
          `${row.installmentKind}:${row.installmentExternalId}`,
          row.lastLifecycleCheckedAt,
        ]),
      );
      const ranked = groups
        .map((row) => ({
          kind: row.installmentKind,
          externalId: row.installmentExternalId,
          lastLifecycleCheckedAt:
            checkedAtByKey.get(`${row.installmentKind}:${row.installmentExternalId}`) ?? null,
        }))
        .sort((left, right) => {
          if (left.lastLifecycleCheckedAt === null && right.lastLifecycleCheckedAt !== null) {
            return -1;
          }
          if (left.lastLifecycleCheckedAt !== null && right.lastLifecycleCheckedAt === null) {
            return 1;
          }
          if (left.lastLifecycleCheckedAt && right.lastLifecycleCheckedAt) {
            const byTime =
              left.lastLifecycleCheckedAt.getTime() - right.lastLifecycleCheckedAt.getTime();
            if (byTime !== 0) {
              return byTime;
            }
          }
          if (left.kind !== right.kind) {
            return left.kind < right.kind ? -1 : 1;
          }
          return left.externalId < right.externalId ? -1 : left.externalId > right.externalId ? 1 : 0;
        });
      return ranked.slice(0, input.limit);
    },

    async touchLifecycleCheckpoint(scope, input) {
      await prisma.financialInstallmentLifecycleCheckpoint.upsert({
        where: {
          integrationId_installmentKind_installmentExternalId: {
            integrationId: scope.integrationId,
            installmentKind: input.installmentKind,
            installmentExternalId: input.installmentExternalId,
          },
        },
        create: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          installmentKind: input.installmentKind,
          installmentExternalId: input.installmentExternalId,
          lastLifecycleCheckedAt: input.checkedAt,
        },
        update: {
          lastLifecycleCheckedAt: input.checkedAt,
        },
      });
    },

    async listByInstallment(scope, installmentExternalId) {
      return prisma.financialTransaction.findMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          installmentExternalId,
        },
        select: { externalId: true, lifecycleStatus: true, grossAmount: true },
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

    async markDeleted(scope, externalId) {
      const result = await prisma.financialTransaction.updateMany({
        where: {
          tenantId: scope.tenantId,
          integrationId: scope.integrationId,
          externalId,
          lifecycleStatus: 'ACTIVE',
        },
        data: {
          lifecycleStatus: 'DELETED',
          // Correção 10-C: libera vínculo CASH-9C; rematch posterior ignora DELETED.
          financialTransferId: null,
        },
      });
      return result.count > 0;
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
