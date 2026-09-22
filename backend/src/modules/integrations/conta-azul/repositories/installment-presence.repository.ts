import type { PrismaClient } from '../../../../generated/prisma/client.js';
import { ACTIVE_INSTALLMENT_STATUSES } from '../../../finance/domain/active-installment-status.js';
import {
  MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND,
  rankInstallmentPresenceCandidates,
} from '../domain/conta-azul-installment-presence.js';

export type InstallmentPresenceKind = 'RECEIVABLE' | 'PAYABLE';

export type InstallmentPresenceCandidate = {
  readonly kind: InstallmentPresenceKind;
  readonly externalId: string;
  readonly lastPresenceCheckedAt: Date | null;
};

export type ContaAzulInstallmentPresenceRepository = {
  listBoundedPresenceProbeCandidates(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly kind: InstallmentPresenceKind;
    readonly limit?: number;
  }): Promise<readonly InstallmentPresenceCandidate[]>;
  countAnalyticalActivePresent(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly kind: InstallmentPresenceKind;
  }): Promise<number>;
  markDeleted(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly kind: InstallmentPresenceKind;
    readonly externalId: string;
    readonly deletedAt: Date;
  }): Promise<{ readonly changed: boolean }>;
  touchPresenceCheckpoint(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly kind: InstallmentPresenceKind;
    readonly externalId: string;
    readonly checkedAt: Date;
  }): Promise<void>;
};

export function createContaAzulInstallmentPresenceRepository(
  prisma: PrismaClient,
): ContaAzulInstallmentPresenceRepository {
  return {
    async listBoundedPresenceProbeCandidates(input) {
      const limit = input.limit ?? MAX_INSTALLMENT_PRESENCE_PROBE_CANDIDATES_PER_KIND;
      if (limit <= 0) {
        return [];
      }
      const where = {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        lifecycleStatus: 'ACTIVE' as const,
        status: { in: [...ACTIVE_INSTALLMENT_STATUSES] },
      };
      const rows =
        input.kind === 'RECEIVABLE'
          ? await prisma.receivable.findMany({
              where,
              select: { externalId: true },
            })
          : await prisma.payable.findMany({
              where,
              select: { externalId: true },
            });
      if (rows.length === 0) {
        return [];
      }
      const checkpoints = await prisma.installmentPresenceCheckpoint.findMany({
        where: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          installmentKind: input.kind,
          installmentExternalId: { in: rows.map((row) => row.externalId) },
        },
        select: {
          installmentExternalId: true,
          lastPresenceCheckedAt: true,
        },
      });
      const checkedAtByExternal = new Map(
        checkpoints.map((row) => [row.installmentExternalId, row.lastPresenceCheckedAt]),
      );
      const ranked = rankInstallmentPresenceCandidates(
        rows.map((row) => ({
          kind: input.kind,
          externalId: row.externalId,
          lastPresenceCheckedAt: checkedAtByExternal.get(row.externalId) ?? null,
        })),
      );
      return ranked.slice(0, limit);
    },

    async countAnalyticalActivePresent(input) {
      const where = {
        tenantId: input.tenantId,
        integrationId: input.integrationId,
        lifecycleStatus: 'ACTIVE' as const,
        status: { in: [...ACTIVE_INSTALLMENT_STATUSES] },
      };
      return input.kind === 'RECEIVABLE'
        ? prisma.receivable.count({ where })
        : prisma.payable.count({ where });
    },

    async markDeleted(input) {
      if (input.kind === 'RECEIVABLE') {
        const result = await prisma.receivable.updateMany({
          where: {
            tenantId: input.tenantId,
            integrationId: input.integrationId,
            externalId: input.externalId,
            lifecycleStatus: 'ACTIVE',
          },
          data: {
            lifecycleStatus: 'DELETED',
            lifecycleDeletedAt: input.deletedAt,
          },
        });
        return { changed: result.count > 0 };
      }
      const result = await prisma.payable.updateMany({
        where: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          externalId: input.externalId,
          lifecycleStatus: 'ACTIVE',
        },
        data: {
          lifecycleStatus: 'DELETED',
          lifecycleDeletedAt: input.deletedAt,
        },
      });
      return { changed: result.count > 0 };
    },

    async touchPresenceCheckpoint(input) {
      await prisma.installmentPresenceCheckpoint.upsert({
        where: {
          integrationId_installmentKind_installmentExternalId: {
            integrationId: input.integrationId,
            installmentKind: input.kind,
            installmentExternalId: input.externalId,
          },
        },
        create: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          installmentKind: input.kind,
          installmentExternalId: input.externalId,
          lastPresenceCheckedAt: input.checkedAt,
        },
        update: {
          lastPresenceCheckedAt: input.checkedAt,
        },
      });
    },
  };
}
