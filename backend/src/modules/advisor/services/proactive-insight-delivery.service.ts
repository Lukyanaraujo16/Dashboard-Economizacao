import type { AdvisorConversationActor, AdvisorConversationRepository } from '../repositories/advisor-conversation.repository.js';
import { composeProactivePresentations } from '../domain/compose-proactive-presentation.js';
import type { AiConversationRecord, AiMessageRecord } from '../domain/types.js';
import { assertCanMarkInsightRead, type ProactiveActor } from '../domain/proactive-trigger-access.js';
import type { ProactiveInsightRepository } from '../repositories/proactive-insight.repository.js';
import type { ProactiveTriggerRepository } from '../repositories/proactive-trigger.repository.js';

export type ProactiveDeliveryResult = {
  readonly materialized: number;
  readonly conversation: AiConversationRecord | null;
  readonly messages: readonly AiMessageRecord[];
};

function readActor(actor: AdvisorConversationActor): ProactiveActor {
  if (actor === 'support-operator') {
    return { role: 'ADMIN', supportSession: true };
  }
  return { role: 'USER', supportSession: false };
}

export function createProactiveInsightDelivery(deps: {
  readonly insights: ProactiveInsightRepository;
  readonly conversations: AdvisorConversationRepository;
  readonly reads: Pick<ProactiveTriggerRepository, 'markRead'>;
}) {
  return {
    async unreadCount(input: {
      readonly tenantId: string;
      readonly userId: string;
      readonly actor: AdvisorConversationActor;
    }): Promise<number> {
      if (input.actor === 'support-operator') {
        return 0;
      }
      return deps.insights.countUnread(input.tenantId, input.userId);
    },

    async listEligible(input: {
      readonly tenantId: string;
      readonly userId: string;
    }) {
      const rows = await deps.insights.listUnread(input.tenantId, input.userId);
      return rows
        .filter((row) => row.content !== null && row.content.trim().length > 0)
        .map((row) => ({
          id: row.id,
          title: row.title,
          content: row.content,
          detectedAt: row.detectedAt,
        }));
    },

    /**
     * Materializa a prosa na conversa deste usuário e registra a leitura
     * somente para membro do tenant. A consulta de contagem não passa por aqui.
     */
    async present(input: {
      readonly tenantId: string;
      readonly userId: string;
      readonly actor: AdvisorConversationActor;
      readonly conversationId?: string | null;
      readonly now?: Date;
    }): Promise<ProactiveDeliveryResult> {
      const eligible = (await deps.insights.listUnread(input.tenantId, input.userId)).filter(
        (row) => row.content !== null && row.content.trim().length > 0,
      );
      if (eligible.length === 0) {
        return { materialized: 0, conversation: null, messages: [] };
      }

      const preferred = input.conversationId
        ? await deps.conversations.findConversation(
            input.tenantId,
            input.userId,
            input.conversationId,
          )
        : null;
      const existing = preferred ?? (await deps.conversations.listConversations(input.tenantId, input.userId))[0] ?? null;
      const conversation =
        existing ??
        (await deps.conversations.createConversation(
          input.tenantId,
          input.userId,
          { title: eligible[0]?.title ?? null },
          input.actor,
        ));

      const pending = [];
      for (const insight of eligible) {
        const content = insight.content?.trim();
        if (!content) {
          continue;
        }
        const already = await deps.insights.findUserMessage(input.tenantId, input.userId, insight.id);
        if (!already) {
          pending.push({ ...insight, content });
        }
      }

      const messages: AiMessageRecord[] = [];
      let materialized = 0;
      for (const presentation of composeProactivePresentations(pending)) {
        const message = await deps.conversations.createMessage(input.tenantId, conversation.id, {
          senderType: 'SYSTEM',
          content: presentation.content,
          relatedInsightId: presentation.primaryInsightId,
        });
        await deps.insights.linkMessageInsights(
          input.tenantId,
          message.id,
          presentation.insightIds,
        );
        materialized += 1;
        messages.push(message);
      }

      if (input.actor === 'tenant-member') {
        assertCanMarkInsightRead(readActor(input.actor));
        for (const insight of eligible) {
          await deps.reads.markRead({
            insightId: insight.id,
            tenantId: input.tenantId,
            userId: input.userId,
            readAt: input.now ?? new Date(),
          });
        }
      }

      return { materialized, conversation, messages };
    },
  };
}
