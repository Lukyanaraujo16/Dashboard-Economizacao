import type { PrismaClient } from '../../../generated/prisma/client.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import { assertAiProviderId, assertAllowedAiModel } from '../domain/ai-provider-models.js';
import type {
  AiRunErrorCode,
  AiRunRecord,
  AiRunStatus,
  CreateAiRunInput,
  UpdateAiRunInput,
} from '../domain/types.js';
import { AI_RUN_ERROR_CODES, AI_RUN_STATUSES } from '../domain/types.js';
import { assertAdvisorTenantId } from './assert-tenant-id.js';

function assertRunStatus(status: string): asserts status is AiRunStatus {
  if (!(AI_RUN_STATUSES as readonly string[]).includes(status)) {
    throw new AdvisorDomainError('AI_RUN_STATUS_INVALID', 'Status de ai_run inválido.');
  }
}

function assertErrorCode(code: string): asserts code is AiRunErrorCode {
  if (!(AI_RUN_ERROR_CODES as readonly string[]).includes(code)) {
    throw new AdvisorDomainError('AI_RUN_ERROR_CODE_INVALID', 'error_code de ai_run inválido.');
  }
}

function toRecord(row: {
  id: string;
  tenantId: string;
  userId: string | null;
  conversationId: string | null;
  messageId: string | null;
  runType: AiRunRecord['runType'];
  provider: AiRunRecord['provider'];
  model: string;
  status: AiRunStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  durationMs: number | null;
  errorCode: AiRunErrorCode | null;
  createdAt: Date;
  finishedAt: Date | null;
}): AiRunRecord {
  return {
    id: row.id,
    tenantId: row.tenantId,
    userId: row.userId,
    conversationId: row.conversationId,
    messageId: row.messageId,
    runType: row.runType,
    provider: row.provider,
    model: row.model,
    status: row.status,
    inputTokens: row.inputTokens,
    outputTokens: row.outputTokens,
    durationMs: row.durationMs,
    errorCode: row.errorCode,
    createdAt: row.createdAt,
    finishedAt: row.finishedAt,
  };
}

export type AdvisorRunRepository = {
  createRun(tenantId: string, input: CreateAiRunInput): Promise<AiRunRecord>;
  findRunById(tenantId: string, runId: string): Promise<AiRunRecord | null>;
  updateRun(tenantId: string, runId: string, input: UpdateAiRunInput): Promise<AiRunRecord>;
};

export function createAdvisorRunRepository(prisma: PrismaClient): AdvisorRunRepository {
  return {
    async createRun(tenantId, input) {
      assertAdvisorTenantId(tenantId);
      assertAiProviderId(input.provider);
      const model = assertAllowedAiModel(input.provider, input.model);
      assertRunStatus(input.status);
      if (input.errorCode != null) {
        assertErrorCode(input.errorCode);
      }

      if (input.conversationId) {
        const conversation = await prisma.aiConversation.findFirst({
          where: { id: input.conversationId, tenantId },
          select: { id: true },
        });
        if (conversation === null) {
          throw new AdvisorDomainError(
            'CONVERSATION_NOT_FOUND',
            'Conversa da execução não encontrada neste tenant.',
          );
        }
      }

      if (input.messageId) {
        const message = await prisma.aiMessage.findFirst({
          where: { id: input.messageId, tenantId },
          select: { id: true, conversationId: true },
        });
        if (message === null) {
          throw new AdvisorDomainError(
            'MESSAGE_NOT_FOUND',
            'Mensagem da execução não encontrada neste tenant.',
          );
        }
        if (input.conversationId && message.conversationId !== input.conversationId) {
          throw new AdvisorDomainError(
            'MESSAGE_CONVERSATION_MISMATCH',
            'Mensagem não pertence à conversa informada.',
          );
        }
      }

      if (input.userId) {
        const user = await prisma.user.findUnique({
          where: { id: input.userId },
          select: { tenantId: true },
        });
        if (user === null || (user.tenantId !== null && user.tenantId !== tenantId)) {
          throw new AdvisorDomainError('USER_NOT_IN_TENANT', 'Usuário da execução não pertence ao tenant.');
        }
      }

      const row = await prisma.aiRun.create({
        data: {
          tenantId,
          userId: input.userId ?? null,
          conversationId: input.conversationId ?? null,
          messageId: input.messageId ?? null,
          runType: input.runType ?? 'QUESTION_REPLY',
          provider: input.provider,
          model,
          status: input.status,
          inputTokens: input.inputTokens ?? null,
          outputTokens: input.outputTokens ?? null,
          durationMs: input.durationMs ?? null,
          errorCode: input.errorCode ?? null,
          finishedAt: input.finishedAt ?? null,
        },
      });
      return toRecord(row);
    },

    async findRunById(tenantId, runId) {
      assertAdvisorTenantId(tenantId);
      const row = await prisma.aiRun.findFirst({
        where: { id: runId, tenantId },
      });
      return row === null ? null : toRecord(row);
    },

    async updateRun(tenantId, runId, input) {
      assertAdvisorTenantId(tenantId);
      assertRunStatus(input.status);
      if (input.errorCode != null) {
        assertErrorCode(input.errorCode);
      }

      const existing = await prisma.aiRun.findFirst({
        where: { id: runId, tenantId },
        select: { id: true },
      });
      if (existing === null) {
        throw new AdvisorDomainError('RUN_NOT_FOUND', 'Execução de IA não encontrada neste tenant.');
      }

      const row = await prisma.aiRun.update({
        where: { id: existing.id },
        data: {
          status: input.status,
          inputTokens: input.inputTokens,
          outputTokens: input.outputTokens,
          durationMs: input.durationMs,
          errorCode: input.errorCode,
          finishedAt: input.finishedAt,
          messageId: input.messageId,
        },
      });
      return toRecord(row);
    },
  };
}
