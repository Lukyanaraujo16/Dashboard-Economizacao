import { Prisma, type PrismaClient } from '../../../../generated/prisma/client.js';
import type {
  ContaAzulSyncCounts,
  ContaAzulSyncErrorCode,
  ContaAzulSyncTrigger,
} from '../domain/conta-azul-sync.js';

export type SyncRunRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly integrationId: string;
  readonly triggerType: ContaAzulSyncTrigger;
  readonly status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  readonly startedAt: Date;
  readonly finishedAt: Date | null;
  readonly heartbeatAt: Date | null;
  readonly errorCode: string | null;
  readonly counts: ContaAzulSyncCounts | null;
};

export type ContaAzulSyncRunRepository = {
  createPending(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly startedAt: Date;
    readonly triggerType?: ContaAzulSyncTrigger;
  }): Promise<SyncRunRecord>;
  findById(id: string): Promise<SyncRunRecord | null>;
  findActiveByIntegrationId(integrationId: string): Promise<SyncRunRecord | null>;
  findActive(limit?: number): Promise<readonly SyncRunRecord[]>;
  findLatestByIntegrationId(integrationId: string): Promise<SyncRunRecord | null>;
  markRunning(id: string, at: Date): Promise<void>;
  heartbeat(id: string, at: Date): Promise<void>;
  markSuccess(input: {
    readonly id: string;
    readonly integrationId: string;
    readonly counts: ContaAzulSyncCounts;
    readonly at: Date;
  }): Promise<void>;
  markFailed(input: {
    readonly id: string;
    readonly errorCode: ContaAzulSyncErrorCode;
    readonly counts?: ContaAzulSyncCounts | null;
    readonly at: Date;
  }): Promise<void>;
};

function nonNegativeInt(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    return null;
  }
  return value;
}

function mapCounts(value: Prisma.JsonValue | null): ContaAzulSyncCounts | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const categories = nonNegativeInt(record.categories);
  const financialAccounts = nonNegativeInt(record.financialAccounts);
  const parties = nonNegativeInt(record.parties);
  const receivables = nonNegativeInt(record.receivables);
  const payables = nonNegativeInt(record.payables);
  if (
    categories === null ||
    financialAccounts === null ||
    parties === null ||
    receivables === null ||
    payables === null
  ) {
    return null;
  }
  const costCenters = nonNegativeInt(record.costCenters) ?? 0;
  const costCenterAllocations = nonNegativeInt(record.costCenterAllocations) ?? 0;
  return {
    categories,
    financialAccounts,
    parties,
    receivables,
    payables,
    costCenters,
    costCenterAllocations,
    costCenterDetailCandidates: nonNegativeInt(record.costCenterDetailCandidates) ?? 0,
    costCenterDetailSkippedFresh: nonNegativeInt(record.costCenterDetailSkippedFresh) ?? 0,
    costCenterDetailRequested: nonNegativeInt(record.costCenterDetailRequested) ?? 0,
    costCenterDetailSuccess: nonNegativeInt(record.costCenterDetailSuccess) ?? 0,
    costCenterDetailNoAllocation: nonNegativeInt(record.costCenterDetailNoAllocation) ?? 0,
    costCenterDetailPartial: nonNegativeInt(record.costCenterDetailPartial) ?? 0,
    costCenterDetailUnresolved: nonNegativeInt(record.costCenterDetailUnresolved) ?? 0,
    costCenterDetailErrors: nonNegativeInt(record.costCenterDetailErrors) ?? 0,
    ledgerCandidates: nonNegativeInt(record.ledgerCandidates) ?? 0,
    ledgerFetched: nonNegativeInt(record.ledgerFetched) ?? 0,
    ledgerUpserted: nonNegativeInt(record.ledgerUpserted) ?? 0,
    ledgerSkippedInvalid: nonNegativeInt(record.ledgerSkippedInvalid) ?? 0,
    ledgerIdentityMismatches: nonNegativeInt(record.ledgerIdentityMismatches) ?? 0,
    ledgerParcelFailures: nonNegativeInt(record.ledgerParcelFailures) ?? 0,
    balanceSnapshotsAttempted: nonNegativeInt(record.balanceSnapshotsAttempted) ?? 0,
    balanceSnapshotsUpserted: nonNegativeInt(record.balanceSnapshotsUpserted) ?? 0,
    balanceSnapshotsFailed: nonNegativeInt(record.balanceSnapshotsFailed) ?? 0,
  };
}

function mapRun(row: {
  id: string;
  tenantId: string;
  integrationId: string;
  triggerType: ContaAzulSyncTrigger;
  status: 'PENDING' | 'RUNNING' | 'SUCCESS' | 'FAILED';
  startedAt: Date;
  finishedAt: Date | null;
  heartbeatAt: Date | null;
  errorCode: string | null;
  counts: Prisma.JsonValue | null;
}): SyncRunRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    integrationId: row.integrationId,
    triggerType: row.triggerType,
    status: row.status,
    startedAt: row.startedAt,
    finishedAt: row.finishedAt,
    heartbeatAt: row.heartbeatAt,
    errorCode: row.errorCode,
    counts: mapCounts(row.counts),
  };
}

const runSelect = {
  id: true,
  tenantId: true,
  integrationId: true,
  triggerType: true,
  status: true,
  startedAt: true,
  finishedAt: true,
  heartbeatAt: true,
  errorCode: true,
  counts: true,
} as const;

export function isActiveSyncUniqueViolation(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
}

export function createContaAzulSyncRunRepository(prisma: PrismaClient): ContaAzulSyncRunRepository {
  return {
    async createPending(input) {
      const row = await prisma.syncRun.create({
        data: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          triggerType: input.triggerType ?? 'MANUAL',
          status: 'PENDING',
          startedAt: input.startedAt,
        },
        select: runSelect,
      });
      return mapRun(row);
    },

    async findById(id) {
      const row = await prisma.syncRun.findUnique({ where: { id }, select: runSelect });
      return row ? mapRun(row) : null;
    },

    async findActiveByIntegrationId(integrationId) {
      const row = await prisma.syncRun.findFirst({
        where: { integrationId, status: { in: ['PENDING', 'RUNNING'] } },
        select: runSelect,
      });
      return row ? mapRun(row) : null;
    },

    async findActive(limit = 100) {
      const rows = await prisma.syncRun.findMany({
        where: { status: { in: ['PENDING', 'RUNNING'] } },
        orderBy: { startedAt: 'asc' },
        take: limit,
        select: runSelect,
      });
      return rows.map(mapRun);
    },

    async findLatestByIntegrationId(integrationId) {
      const row = await prisma.syncRun.findFirst({
        where: { integrationId },
        orderBy: { startedAt: 'desc' },
        select: runSelect,
      });
      return row ? mapRun(row) : null;
    },

    async markRunning(id, at) {
      await prisma.syncRun.updateMany({
        where: { id, status: { in: ['PENDING', 'RUNNING'] } },
        data: { status: 'RUNNING', heartbeatAt: at },
      });
    },

    async heartbeat(id, at) {
      await prisma.syncRun.updateMany({
        where: { id, status: 'RUNNING' },
        data: { heartbeatAt: at },
      });
    },

    async markSuccess(input) {
      await prisma.$transaction(async (tx) => {
        await tx.syncRun.updateMany({
          where: { id: input.id, status: { in: ['PENDING', 'RUNNING'] } },
          data: {
            status: 'SUCCESS',
            finishedAt: input.at,
            heartbeatAt: input.at,
            errorCode: null,
            counts: input.counts as Prisma.InputJsonValue,
          },
        });
        await tx.integration.update({
          where: { id: input.integrationId },
          data: { lastSuccessfulSyncAt: input.at },
        });
      });
    },

    async markFailed(input) {
      await prisma.syncRun.updateMany({
        where: { id: input.id, status: { in: ['PENDING', 'RUNNING'] } },
        data: {
          status: 'FAILED',
          finishedAt: input.at,
          heartbeatAt: input.at,
          errorCode: input.errorCode,
          ...(input.counts ? { counts: input.counts as Prisma.InputJsonValue } : {}),
        },
      });
    },
  };
}
