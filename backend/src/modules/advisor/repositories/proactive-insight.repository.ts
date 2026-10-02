import type { PrismaClient } from '../../../generated/prisma/client.js';

const ELIGIBLE_NARRATION = ['AWAITING_NARRATION', 'NARRATION_FAILED'] as const;

export type ProactiveInsightSnapshot = {
  readonly id: string;
  readonly tenantId: string;
  readonly insightType: string;
  readonly severity: string | null;
  readonly title: string | null;
  readonly content: string | null;
  readonly supportingData: unknown;
  readonly narrationStatus: 'AWAITING_NARRATION' | 'NARRATED' | 'NARRATION_FAILED';
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly detectedAt: Date;
  readonly analyticalEventId: string;
};

function toSnapshot(row: {
  id: string;
  tenantId: string;
  insightType: string;
  severity: string | null;
  title: string | null;
  content: string | null;
  supportingData: unknown;
  narrationStatus: ProactiveInsightSnapshot['narrationStatus'];
  periodStart: Date;
  periodEnd: Date;
  detectedAt: Date;
  analyticalEventId: string;
}): ProactiveInsightSnapshot {
  return row;
}

export function createProactiveInsightRepository(prisma: PrismaClient) {
  return {
    async listAwaitingNarration(tenantId: string): Promise<readonly ProactiveInsightSnapshot[]> {
      const rows = await prisma.aiInsight.findMany({
        where: { tenantId, narrationStatus: 'AWAITING_NARRATION' },
        orderBy: { detectedAt: 'asc' },
      });
      return rows.map(toSnapshot);
    },

    async findByTenant(tenantId: string, insightId: string): Promise<ProactiveInsightSnapshot | null> {
      const row = await prisma.aiInsight.findFirst({
        where: { id: insightId, tenantId },
      });
      return row ? toSnapshot(row) : null;
    },

    async saveNarration(
      tenantId: string,
      insightId: string,
      input: { readonly title: string; readonly content: string },
    ): Promise<boolean> {
      const result = await prisma.aiInsight.updateMany({
        where: {
          id: insightId,
          tenantId,
          narrationStatus: { in: [...ELIGIBLE_NARRATION] },
        },
        data: {
          title: input.title,
          content: input.content,
          narrationStatus: 'NARRATED',
        },
      });
      return result.count === 1;
    },

    async markNarrationFailed(tenantId: string, insightId: string): Promise<void> {
      await prisma.aiInsight.updateMany({
        where: {
          id: insightId,
          tenantId,
          narrationStatus: { in: [...ELIGIBLE_NARRATION] },
        },
        data: { narrationStatus: 'NARRATION_FAILED' },
      });
    },

    async countUnread(tenantId: string, userId: string): Promise<number> {
      return prisma.aiInsight.count({
        where: {
          tenantId,
          narrationStatus: 'NARRATED',
          content: { not: null },
          reads: { none: { userId } },
        },
      });
    },

    async linkMessageInsights(
      tenantId: string,
      messageId: string,
      insightIds: readonly string[],
    ): Promise<void> {
      if (insightIds.length === 0) {
        return;
      }
      await prisma.aiMessageInsightLink.createMany({
        data: insightIds.map((insightId) => ({ messageId, insightId, tenantId })),
        skipDuplicates: true,
      });
    },

    async findUserMessage(tenantId: string, userId: string, insightId: string) {
      const row = await prisma.aiMessage.findFirst({
        where: {
          tenantId,
          conversation: { userId, tenantId },
          OR: [
            { relatedInsightId: insightId },
            { insightLinks: { some: { insightId, tenantId } } },
          ],
        },
        orderBy: { createdAt: 'asc' },
      });
      if (!row) {
        return null;
      }
      return {
        id: row.id,
        conversationId: row.conversationId,
        tenantId: row.tenantId,
        senderType: row.senderType,
        content: row.content,
        messageType: row.messageType,
        relatedInsightId: row.relatedInsightId,
        createdAt: row.createdAt,
      };
    },

    async listUnread(tenantId: string, userId: string): Promise<readonly ProactiveInsightSnapshot[]> {
      const rows = await prisma.aiInsight.findMany({
        where: {
          tenantId,
          narrationStatus: 'NARRATED',
          content: { not: null },
          reads: { none: { userId } },
        },
        orderBy: { detectedAt: 'asc' },
      });
      return rows.map(toSnapshot);
    },
  };
}

export type ProactiveInsightRepository = ReturnType<typeof createProactiveInsightRepository>;
