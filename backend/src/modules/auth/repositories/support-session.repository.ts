import type { PrismaClient } from '../../../generated/prisma/client.js';

export type CreateSupportSessionInput = {
  readonly operatorUserId: string;
  readonly tenantId: string;
  readonly startedAt: Date;
  readonly redisSessionId: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
};

export type SupportSessionRecord = {
  readonly id: string;
  readonly operatorUserId: string;
  readonly tenantId: string;
  readonly startedAt: Date;
  readonly endedAt: Date | null;
};

export type SupportSessionRepository = {
  create(input: CreateSupportSessionInput): Promise<SupportSessionRecord>;
  findOpenById(id: string): Promise<SupportSessionRecord | null>;
  end(id: string, endedAt: Date): Promise<void>;
  endOpenByRedisSessionId(redisSessionId: string, endedAt: Date): Promise<number>;
  endOpenByOperatorUserId(operatorUserId: string, endedAt: Date): Promise<number>;
};

function toRecord(row: {
  id: string;
  operatorUserId: string;
  tenantId: string;
  startedAt: Date;
  endedAt: Date | null;
}): SupportSessionRecord {
  return {
    id: row.id,
    operatorUserId: row.operatorUserId,
    tenantId: row.tenantId,
    startedAt: row.startedAt,
    endedAt: row.endedAt,
  };
}

export function createSupportSessionRepository(prisma: PrismaClient): SupportSessionRepository {
  return {
    async create(input) {
      const row = await prisma.supportSession.create({
        data: input,
        select: {
          id: true,
          operatorUserId: true,
          tenantId: true,
          startedAt: true,
          endedAt: true,
        },
      });
      return toRecord(row);
    },

    async findOpenById(id) {
      const row = await prisma.supportSession.findFirst({
        where: { id, endedAt: null },
        select: {
          id: true,
          operatorUserId: true,
          tenantId: true,
          startedAt: true,
          endedAt: true,
        },
      });
      return row ? toRecord(row) : null;
    },

    async end(id, endedAt) {
      await prisma.supportSession.updateMany({
        where: { id, endedAt: null },
        data: { endedAt },
      });
    },

    async endOpenByRedisSessionId(redisSessionId, endedAt) {
      const result = await prisma.supportSession.updateMany({
        where: { redisSessionId, endedAt: null },
        data: { endedAt },
      });
      return result.count;
    },

    async endOpenByOperatorUserId(operatorUserId, endedAt) {
      const result = await prisma.supportSession.updateMany({
        where: { operatorUserId, endedAt: null },
        data: { endedAt },
      });
      return result.count;
    },
  };
}
