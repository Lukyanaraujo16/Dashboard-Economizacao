import type { PrismaClient } from '../../../../generated/prisma/client.js';

export type IntegrationSyncCursorResource = 'PEOPLE' | 'RECEIVABLES' | 'PAYABLES';

export type IntegrationSyncCursorRecord = {
  readonly id: string;
  readonly tenantId: string;
  readonly integrationId: string;
  readonly resource: IntegrationSyncCursorResource;
  readonly cursorAt: Date;
  readonly externalAccountId: string;
  readonly lastRunId: string | null;
};

export type ContaAzulSyncCursorRepository = {
  listByIntegrationId(integrationId: string): Promise<readonly IntegrationSyncCursorRecord[]>;
  upsert(input: {
    readonly tenantId: string;
    readonly integrationId: string;
    readonly resource: IntegrationSyncCursorResource;
    readonly cursorAt: Date;
    readonly externalAccountId: string;
    readonly lastRunId?: string | null;
  }): Promise<void>;
};

const cursorSelect = {
  id: true,
  tenantId: true,
  integrationId: true,
  resource: true,
  cursorAt: true,
  externalAccountId: true,
  lastRunId: true,
} as const;

function mapCursor(row: IntegrationSyncCursorRecord): IntegrationSyncCursorRecord {
  return row;
}

export function createContaAzulSyncCursorRepository(
  prisma: PrismaClient,
): ContaAzulSyncCursorRepository {
  return {
    async listByIntegrationId(integrationId) {
      const rows = await prisma.integrationSyncCursor.findMany({
        where: { integrationId },
        select: cursorSelect,
      });
      return rows.map(mapCursor);
    },

    async upsert(input) {
      await prisma.integrationSyncCursor.upsert({
        where: {
          integrationId_resource: {
            integrationId: input.integrationId,
            resource: input.resource,
          },
        },
        create: {
          tenantId: input.tenantId,
          integrationId: input.integrationId,
          resource: input.resource,
          cursorAt: input.cursorAt,
          externalAccountId: input.externalAccountId,
          lastRunId: input.lastRunId ?? null,
        },
        update: {
          cursorAt: input.cursorAt,
          externalAccountId: input.externalAccountId,
          lastRunId: input.lastRunId ?? null,
        },
      });
    },
  };
}
