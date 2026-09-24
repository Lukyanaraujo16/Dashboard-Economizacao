import type { IaProviderRegistry } from '../../../infrastructure/ai/ia-provider-registry.js';
import { IaProviderError } from '../../../infrastructure/ai/types.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import { assertAllowedAiModel } from '../domain/ai-provider-models.js';
import type {
  AiMessageRecord,
  AiRunErrorCode,
  AiRunRecord,
  AiRunStatus,
  AiTenantSettingsRecord,
} from '../domain/types.js';
import { assertAdvisorTenantId } from '../repositories/assert-tenant-id.js';
import type { AdvisorConversationRepository } from '../repositories/advisor-conversation.repository.js';
import type { AdvisorRunRepository } from '../repositories/advisor-run.repository.js';
import type { AdvisorSettingsRepository } from '../repositories/advisor-settings.repository.js';
import type { AdvisorContextBuilder } from './build-advisor-context.js';

const CONSULTANT_REPLY_MAX_CHARS = 20_000;

export type SendAdvisorMessageInput = {
  readonly tenantId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly question: string;
  readonly monthKey?: string;
  readonly now?: Date;
};

export type SendAdvisorMessageResult = {
  readonly conversationId: string;
  readonly userMessage: AiMessageRecord;
  readonly consultantMessage: AiMessageRecord;
  readonly run: AiRunRecord;
};

export class AdvisorExecutionError extends AdvisorDomainError {
  readonly run: AiRunRecord;
  readonly userMessage: AiMessageRecord;

  constructor(code: string, message: string, run: AiRunRecord, userMessage: AiMessageRecord) {
    super(code, message);
    this.name = 'AdvisorExecutionError';
    this.run = run;
    this.userMessage = userMessage;
  }
}

export type SendAdvisorMessageDependencies = {
  readonly settings: Pick<AdvisorSettingsRepository, 'findSettingsByTenant'>;
  readonly conversations: Pick<AdvisorConversationRepository, 'findConversation' | 'createMessage'>;
  readonly runs: Pick<AdvisorRunRepository, 'createRun' | 'updateRun'>;
  readonly context: AdvisorContextBuilder;
  readonly providers: IaProviderRegistry;
};

/**
 * Caso de uso reativo F13.3.
 * Rate limit Redis: ponto de integração F13.6 — não antecipar limiter aqui.
 */
export function createSendAdvisorMessage(deps: SendAdvisorMessageDependencies) {
  return {
    async execute(input: SendAdvisorMessageInput): Promise<SendAdvisorMessageResult> {
      assertAdvisorTenantId(input.tenantId);
      const tenantId = input.tenantId.trim();
      const userId = requireId(input.userId, 'USER_ID_REQUIRED', 'userId é obrigatório na conversa do Consultor.');
      const conversationId = requireId(
        input.conversationId,
        'CONVERSATION_ID_REQUIRED',
        'conversationId é obrigatório.',
      );
      const question = requireText(input.question, 'QUESTION_REQUIRED', 'Pergunta do usuário é obrigatória.');

      const settings = await deps.settings.findSettingsByTenant(tenantId);
      const ready = requireActiveSettings(settings, tenantId);
      const model = assertAllowedAiModel(ready.provider, ready.model);

      const conversation = await deps.conversations.findConversation(tenantId, userId, conversationId);
      if (conversation === null || conversation.tenantId !== tenantId || conversation.userId !== userId) {
        throw new AdvisorDomainError('CONVERSATION_NOT_FOUND', 'Conversa não encontrada neste tenant.');
      }

      const userMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
        senderType: 'USER',
        content: question,
      });

      const built = await deps.context.build({
        tenantId,
        userId,
        conversationId: conversation.id,
        question,
        monthKey: input.monthKey,
        now: input.now,
      });

      let run = await deps.runs.createRun(tenantId, {
        userId,
        conversationId: conversation.id,
        messageId: userMessage.id,
        provider: ready.provider,
        model,
        status: 'STARTED',
      });

      const startedAt = Date.now();
      try {
        const provider = deps.providers.resolve(ready.provider);
        if (provider.id !== ready.provider) {
          throw new IaProviderError('PROVIDER_ERROR', 'Registry devolveu provider diferente do configurado.');
        }

        const generated = await provider.generate({
          tenantId,
          provider: ready.provider,
          model,
          blocks: built.blocks,
        });
        const text = sanitizeConsultantText(generated.text);
        const consultantMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
          senderType: 'CONSULTANT',
          content: text,
        });

        run = await deps.runs.updateRun(tenantId, run.id, {
          status: 'SUCCEEDED',
          inputTokens: generated.usage.inputTokens,
          outputTokens: generated.usage.outputTokens,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date(),
          messageId: consultantMessage.id,
        });

        return {
          conversationId: conversation.id,
          userMessage,
          consultantMessage,
          run,
        };
      } catch (error) {
        const { status, errorCode, message } = normalizeExecutionFailure(error);
        run = await deps.runs.updateRun(tenantId, run.id, {
          status,
          errorCode,
          durationMs: Date.now() - startedAt,
          finishedAt: new Date(),
        });
        throw new AdvisorExecutionError(errorCode, message, run, userMessage);
      }
    },
  };
}

export type SendAdvisorMessage = ReturnType<typeof createSendAdvisorMessage>;

function requireActiveSettings(
  settings: AiTenantSettingsRecord | null,
  tenantId: string,
): AiTenantSettingsRecord {
  if (settings === null || settings.tenantId !== tenantId) {
    throw new AdvisorDomainError(
      'CONSULTANT_NOT_CONFIGURED',
      'Consultor não está configurado para este tenant.',
    );
  }
  if (settings.status !== 'ACTIVE') {
    throw new AdvisorDomainError('CONSULTANT_DISABLED', 'Consultor está desabilitado para este tenant.');
  }
  return settings;
}

function requireId(value: string, code: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AdvisorDomainError(code, message);
  }
  return trimmed;
}

function requireText(value: string, code: string, message: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new AdvisorDomainError(code, message);
  }
  return trimmed;
}

function sanitizeConsultantText(value: string): string {
  const text = value.split(String.fromCharCode(0)).join('').trim();
  if (!text) {
    throw new IaProviderError('PROVIDER_ERROR', 'O provedor de IA retornou texto vazio.');
  }
  if (text.length > CONSULTANT_REPLY_MAX_CHARS) {
    return text.slice(0, CONSULTANT_REPLY_MAX_CHARS);
  }
  return text;
}

function normalizeExecutionFailure(error: unknown): {
  readonly status: AiRunStatus;
  readonly errorCode: AiRunErrorCode;
  readonly message: string;
} {
  if (error instanceof IaProviderError) {
    return {
      status: statusForErrorCode(error.code),
      errorCode: error.code,
      message: error.message,
    };
  }
  if (error instanceof AdvisorDomainError && isRunErrorCode(error.code)) {
    return {
      status: statusForErrorCode(error.code),
      errorCode: error.code,
      message: error.message,
    };
  }
  return {
    status: 'FAILED',
    errorCode: 'UNKNOWN',
    message: 'Falha ao executar o Consultor.',
  };
}

function statusForErrorCode(code: AiRunErrorCode): AiRunStatus {
  if (code === 'TIMEOUT') {
    return 'TIMEOUT';
  }
  if (code === 'RATE_LIMIT') {
    return 'LIMIT_BLOCKED';
  }
  return 'FAILED';
}

function isRunErrorCode(code: string): code is AiRunErrorCode {
  return (
    code === 'AUTH' ||
    code === 'RATE_LIMIT' ||
    code === 'TIMEOUT' ||
    code === 'MODEL_UNAVAILABLE' ||
    code === 'BAD_REQUEST' ||
    code === 'CONTENT_REJECTED' ||
    code === 'PROVIDER_ERROR' ||
    code === 'UNKNOWN'
  );
}
