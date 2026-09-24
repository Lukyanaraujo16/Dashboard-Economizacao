import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import type {
  AiConversationRecord,
  AiConversationStatus,
  AiMessageRecord,
  CreateAiConversationInput,
  CreateAiMessageInput,
} from '../domain/types.js';
import { assertAdvisorTenantId } from './assert-tenant-id.js';

function requireText(value: string, code: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AdvisorDomainError(code, message);
  }
  return trimmed;
}

function toConversation(row: {
  id: string;
  tenantId: string;
  userId: string;
  status: AiConversationStatus;
  title: string | null;
  startedAt: Date;
  lastMessageAt: Date;
  createdAt: Date;
  updatedAt: Date;
}): AiConversationRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    status: row.status,
    title: row.title,
    startedAt: row.startedAt,
    lastMessageAt: row.lastMessageAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toMessage(row: {
  id: string;
  conversationId: string;
  tenantId: string;
  senderType: AiMessageRecord['senderType'];
  content: string;
  messageType: AiMessageRecord['messageType'];
  createdAt: Date;
}): AiMessageRecord {
  return {
    id: row.id,
    conversationId: row.conversationId,
    tenantId: row.tenantId,
    senderType: row.senderType,
    content: row.content,
    messageType: row.messageType,
    createdAt: row.createdAt,
  };
}

export type AdvisorConversationRepository = {
  createConversation(
    tenantId: string,
    userId: string,
    input?: CreateAiConversationInput,
  ): Promise<AiConversationRecord>;
  findConversation(
    tenantId: string,
    userId: string,
    conversationId: string,
  ): Promise<AiConversationRecord | null>;
  listConversations(tenantId: string, userId: string): Promise<readonly AiConversationRecord[]>;
  updateConversationTitle(
    tenantId: string,
    conversationId: string,
    title: string,
  ): Promise<AiConversationRecord | null>;
  deleteConversation(tenantId: string, userId: string, conversationId: string): Promise<boolean>;
  createMessage(
    tenantId: string,
    conversationId: string,
    input: CreateAiMessageInput,
  ): Promise<AiMessageRecord>;
  listMessages(tenantId: string, conversationId: string): Promise<readonly AiMessageRecord[]>;
};

export function createAdvisorConversationRepository(
  prisma: PrismaClient,
): AdvisorConversationRepository {
  return {
    async createConversation(tenantId, userId, input = {}) {
      assertAdvisorTenantId(tenantId);
      if (userId.trim() === '') {
        throw new AdvisorDomainError('USER_ID_REQUIRED', 'userId é obrigatório na conversa do Consultor.');
      }

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, tenantId: true },
      });
      if (user === null || user.tenantId !== tenantId) {
        throw new AdvisorDomainError(
          'USER_NOT_IN_TENANT',
          'Conversa do Consultor exige usuário do mesmo tenant.',
        );
      }

      const now = new Date();
      const title = input.title === undefined || input.title === null ? null : input.title.trim() || null;
      const row = await prisma.aiConversation.create({
        data: {
          tenantId,
          userId,
          status: 'OPEN',
          title,
          startedAt: now,
          lastMessageAt: now,
        },
      });
      return toConversation(row);
    },

    async findConversation(tenantId, userId, conversationId) {
      assertAdvisorTenantId(tenantId);
      const row = await prisma.aiConversation.findFirst({
        where: { id: conversationId, tenantId, userId },
      });
      return row === null ? null : toConversation(row);
    },

    async listConversations(tenantId, userId) {
      assertAdvisorTenantId(tenantId);
      const rows = await prisma.aiConversation.findMany({
        where: { tenantId, userId },
        orderBy: { lastMessageAt: 'desc' },
      });
      return rows.map(toConversation);
    },

    async updateConversationTitle(tenantId, conversationId, title) {
      assertAdvisorTenantId(tenantId);
      const existing = await prisma.aiConversation.findFirst({
        where: { id: conversationId, tenantId },
        select: { id: true },
      });
      if (existing === null) {
        return null;
      }
      const row = await prisma.aiConversation.update({
        where: { id: existing.id },
        data: { title: title.trim() || null },
      });
      return toConversation(row);
    },

    async deleteConversation(tenantId, userId, conversationId) {
      assertAdvisorTenantId(tenantId);
      const existing = await prisma.aiConversation.findFirst({
        where: { id: conversationId, tenantId, userId },
        select: { id: true },
      });
      if (existing === null) {
        return false;
      }
      await prisma.aiConversation.delete({
        where: { id: existing.id },
      });
      return true;
    },

    async createMessage(tenantId, conversationId, input) {
      assertAdvisorTenantId(tenantId);
      const conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, tenantId },
        select: { id: true, tenantId: true },
      });
      if (conversation === null) {
        throw new AdvisorDomainError(
          'CONVERSATION_NOT_FOUND',
          'Conversa não encontrada neste tenant.',
        );
      }

      const content = requireText(input.content, 'MESSAGE_CONTENT_REQUIRED', 'Conteúdo da mensagem é obrigatório.');
      const now = new Date();
      const [row] = await prisma.$transaction([
        prisma.aiMessage.create({
          data: {
            conversationId: conversation.id,
            tenantId: conversation.tenantId,
            senderType: input.senderType,
            content,
            messageType: 'TEXT',
          },
        }),
        prisma.aiConversation.update({
          where: { id: conversation.id },
          data: { lastMessageAt: now },
        }),
      ]);
      return toMessage(row);
    },

    async listMessages(tenantId, conversationId) {
      assertAdvisorTenantId(tenantId);
      const conversation = await prisma.aiConversation.findFirst({
        where: { id: conversationId, tenantId },
        select: { id: true },
      });
      if (conversation === null) {
        return [];
      }

      const rows = await prisma.aiMessage.findMany({
        where: { conversationId: conversation.id, tenantId },
        orderBy: { createdAt: 'asc' },
      });
      return rows.map(toMessage);
    },
  };
}
