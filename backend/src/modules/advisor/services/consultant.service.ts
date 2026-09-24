import { IaProviderError } from '../../../infrastructure/ai/types.js';
import {
  ConflictError,
  ForbiddenError,
  IntegrationUnavailableError,
  NotFoundError,
  ValidationError,
} from '../../../shared/errors/application-error.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiTenantSettingsRecord,
} from '../domain/types.js';
import type { AdvisorConversationRepository } from '../repositories/advisor-conversation.repository.js';
import type { AdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import type {
  PublicConsultantConversation,
  PublicConsultantConversationDetail,
  PublicConsultantMessage,
  PublicConsultantStatus,
  PublicConsultantUserStatus,
} from '../http/public-dtos.js';
import { AdvisorExecutionError, type SendAdvisorMessage } from './send-advisor-message.js';

const DEFAULT_LIST_LIMIT = 50;
const MAX_LIST_LIMIT = 100;
const SAFE_UNAVAILABLE_MESSAGE = 'O Consultor está temporariamente indisponível.';

export type ConsultantAvailabilityInput = {
  readonly settings: Pick<AiTenantSettingsRecord, 'tenantId' | 'status' | 'provider'> | null;
  readonly tenantId: string;
  readonly nodeEnv: string;
  readonly openaiApiKey: string | null;
  readonly anthropicApiKey: string | null;
};

export function resolveConsultantAvailability(
  input: ConsultantAvailabilityInput,
): PublicConsultantUserStatus {
  const settings =
    input.settings !== null && input.settings.tenantId === input.tenantId ? input.settings : null;

  if (settings === null) {
    return { status: 'NOT_CONFIGURED' };
  }
  if (settings.status === 'DISABLED') {
    return { status: 'DISABLED' };
  }
  if (input.nodeEnv === 'test') {
    return { status: 'ACTIVE' };
  }

  const key = settings.provider === 'OPENAI' ? input.openaiApiKey : input.anthropicApiKey;
  if (key === null || key.trim() === '') {
    return { status: 'UNAVAILABLE' };
  }

  return { status: 'ACTIVE' };
}

export type ConsultantConversationList = {
  readonly data: readonly PublicConsultantConversation[];
  readonly pagination: {
    readonly limit: number;
    readonly offset: number;
    readonly total: number;
    readonly hasMore: boolean;
  };
};

export type ConsultantSendMessageResult = {
  readonly conversation: PublicConsultantConversation;
  readonly userMessage: PublicConsultantMessage;
  readonly consultantMessage: PublicConsultantMessage;
};

export type ConsultantService = {
  getStatus(tenantId: string): Promise<PublicConsultantUserStatus>;
  listConversations(
    tenantId: string,
    userId: string,
    query?: { readonly limit?: number; readonly offset?: number },
  ): Promise<ConsultantConversationList>;
  createConversation(
    tenantId: string,
    userId: string,
    input?: { readonly title?: string },
  ): Promise<PublicConsultantConversation>;
  getConversation(
    tenantId: string,
    userId: string,
    conversationId: string,
  ): Promise<PublicConsultantConversationDetail>;
  sendMessage(
    tenantId: string,
    userId: string,
    conversationId: string,
    input: { readonly content: string; readonly month?: string },
  ): Promise<ConsultantSendMessageResult>;
};

export function createConsultantService(deps: {
  readonly settings: Pick<AdvisorSettingsRepository, 'findSettingsByTenant'>;
  readonly conversations: Pick<
    AdvisorConversationRepository,
    'createConversation' | 'findConversation' | 'listConversations' | 'listMessages'
  >;
  readonly send: SendAdvisorMessage;
  readonly nodeEnv: string;
  readonly openaiApiKey: string | null;
  readonly anthropicApiKey: string | null;
}): ConsultantService {
  async function loadAvailability(tenantId: string): Promise<PublicConsultantUserStatus> {
    const settings = await deps.settings.findSettingsByTenant(tenantId);
    return resolveConsultantAvailability({
      settings,
      tenantId,
      nodeEnv: deps.nodeEnv,
      openaiApiKey: deps.openaiApiKey,
      anthropicApiKey: deps.anthropicApiKey,
    });
  }

  return {
    async getStatus(tenantId) {
      return loadAvailability(tenantId);
    },

    async listConversations(tenantId, userId, query = {}) {
      const limit =
        query.limit === undefined
          ? DEFAULT_LIST_LIMIT
          : Math.min(Math.max(query.limit, 1), MAX_LIST_LIMIT);
      const offset = query.offset === undefined ? 0 : Math.max(query.offset, 0);
      const rows = await deps.conversations.listConversations(tenantId, userId);
      const total = rows.length;
      const page = rows.slice(offset, offset + limit);

      return {
        data: page.map(toPublicConversation),
        pagination: {
          limit,
          offset,
          total,
          hasMore: offset + page.length < total,
        },
      };
    },

    async createConversation(tenantId, userId, input = {}) {
      assertConsultantWritable((await loadAvailability(tenantId)).status);
      try {
        const created = await deps.conversations.createConversation(tenantId, userId, {
          title: input.title,
        });
        return toPublicConversation(created);
      } catch (error) {
        mapAdvisorHttpError(error);
      }
    },

    async getConversation(tenantId, userId, conversationId) {
      const conversation = await deps.conversations.findConversation(
        tenantId,
        userId,
        conversationId,
      );
      if (conversation === null || conversation.tenantId !== tenantId || conversation.userId !== userId) {
        throw new NotFoundError('Conversa não encontrada.');
      }

      const messages = await deps.conversations.listMessages(tenantId, conversation.id);
      return {
        ...toPublicConversation(conversation),
        messages: messages
          .filter((message) => message.tenantId === tenantId && message.conversationId === conversation.id)
          .map(toPublicMessage),
      };
    },

    async sendMessage(tenantId, userId, conversationId, input) {
      assertConsultantWritable((await loadAvailability(tenantId)).status);

      const existing = await deps.conversations.findConversation(tenantId, userId, conversationId);
      if (existing === null || existing.tenantId !== tenantId || existing.userId !== userId) {
        throw new NotFoundError('Conversa não encontrada.');
      }

      try {
        const result = await deps.send.execute({
          tenantId,
          userId,
          conversationId: existing.id,
          question: input.content,
          monthKey: input.month,
        });
        const conversation =
          (await deps.conversations.findConversation(tenantId, userId, existing.id)) ?? existing;

        return {
          conversation: toPublicConversation(conversation),
          userMessage: toPublicMessage(result.userMessage),
          consultantMessage: toPublicMessage(result.consultantMessage),
        };
      } catch (error) {
        mapAdvisorHttpError(error);
      }
    },
  };
}

function assertConsultantWritable(status: PublicConsultantStatus): void {
  if (status === 'NOT_CONFIGURED') {
    throw new ConflictError('Consultor não está configurado para este tenant.');
  }
  if (status === 'DISABLED') {
    throw new ConflictError('Consultor está desabilitado para este tenant.');
  }
  if (status === 'UNAVAILABLE') {
    throw new IntegrationUnavailableError(SAFE_UNAVAILABLE_MESSAGE);
  }
}

function toPublicConversation(row: AiConversationRecord): PublicConsultantConversation {
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    lastMessageAt: row.lastMessageAt.toISOString(),
  };
}

function toPublicMessage(row: AiMessageRecord): PublicConsultantMessage {
  return {
    id: row.id,
    senderType: row.senderType,
    content: row.content,
    createdAt: row.createdAt.toISOString(),
  };
}

function mapAdvisorHttpError(error: unknown): never {
  if (
    error instanceof IntegrationUnavailableError ||
    error instanceof ConflictError ||
    error instanceof NotFoundError ||
    error instanceof ValidationError ||
    error instanceof ForbiddenError
  ) {
    throw error;
  }

  if (error instanceof AdvisorExecutionError || error instanceof IaProviderError) {
    throw new IntegrationUnavailableError(SAFE_UNAVAILABLE_MESSAGE);
  }

  if (error instanceof AdvisorDomainError) {
    if (error.code === 'CONVERSATION_NOT_FOUND') {
      throw new NotFoundError('Conversa não encontrada.');
    }
    if (error.code === 'CONSULTANT_NOT_CONFIGURED' || error.code === 'CONSULTANT_DISABLED') {
      throw new ConflictError(error.message);
    }
    if (error.code === 'USER_NOT_IN_TENANT') {
      throw new ForbiddenError('Sem contexto de empresa para o Consultor.');
    }
    if (
      error.code === 'MONTH_KEY_INVALID' ||
      error.code === 'QUESTION_REQUIRED' ||
      error.code === 'MESSAGE_CONTENT_REQUIRED'
    ) {
      throw new ValidationError(error.message, { httpStatus: 400 });
    }
    throw new ValidationError(error.message, { httpStatus: 400 });
  }

  throw error;
}
