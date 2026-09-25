import type { IaProviderRegistry } from '../../../infrastructure/ai/ia-provider-registry.js';
import {
  IaProviderError,
  type GenerationInput,
  type GenerationOutput,
  type GenerationUsage,
  type IaToolRound,
} from '../../../infrastructure/ai/types.js';
import {
  IntegrationUnavailableError,
  RateLimitedError,
} from '../../../shared/errors/application-error.js';
import {
  ADVISOR_MAX_TOOL_ROUNDS,
  type AdvisorAnalyticalToolExecutor,
  type AdvisorCashComparisonService,
} from '../domain/advisor-analytical-tools.js';
import { AdvisorDomainError } from '../domain/advisor-domain-error.js';
import { deriveConsultantConversationTitle } from '../domain/conversation-title.js';
import { resolveAdvisorConversationalPeriod } from '../domain/resolve-advisor-conversational-period.js';
import { resolveAdvisorDrilldownIntent } from '../domain/resolve-advisor-drilldown-intent.js';
import { resolveAdvisorNominalIntent } from '../domain/resolve-advisor-nominal-intent.js';
import {
  COMPARE_CASH_NOMINAL_TOOL_NAME,
  CASH_NOMINAL_RANKING_TOOL_NAME,
} from '../domain/advisor-nominal-dimension.js';
import { assertAllowedAiModel } from '../domain/ai-provider-models.js';
import {
  CONSULTANT_PLATFORM_LIMIT_MESSAGE,
  CONSULTANT_UNAVAILABLE_MESSAGE,
  type ConsultantRateLimiter,
} from '../domain/consultant-rate-limit.js';
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
  readonly conversations: Pick<
    AdvisorConversationRepository,
    'findConversation' | 'createMessage' | 'updateConversationTitle' | 'listMessages'
  >;
  readonly runs: Pick<AdvisorRunRepository, 'createRun' | 'updateRun'>;
  readonly context: AdvisorContextBuilder;
  readonly providers: IaProviderRegistry;
  readonly rateLimiter: ConsultantRateLimiter;
  readonly analyticalTools?: AdvisorAnalyticalToolExecutor;
  readonly cashComparison?: AdvisorCashComparisonService;
};

/**
 * Caso de uso reativo. Rate limit da plataforma ocorre antes do contexto e do provider.
 * Comparação já resolvida é pré-carregada. Tools têm teto de rodadas.
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

      const limit = await deps.rateLimiter.consume({ tenantId, userId });
      if (limit.ok === false && limit.kind === 'store_unavailable') {
        await persistBlockedRun(deps.runs, {
          tenantId,
          userId,
          conversationId: conversation.id,
          provider: ready.provider,
          model,
          status: 'FAILED',
          errorCode: 'UNKNOWN',
        });
        throw new IntegrationUnavailableError(CONSULTANT_UNAVAILABLE_MESSAGE);
      }
      if (limit.ok === false && limit.kind === 'limit') {
        await persistBlockedRun(deps.runs, {
          tenantId,
          userId,
          conversationId: conversation.id,
          provider: ready.provider,
          model,
          status: 'LIMIT_BLOCKED',
          errorCode: 'RATE_LIMIT',
        });
        throw new RateLimitedError(CONSULTANT_PLATFORM_LIMIT_MESSAGE);
      }

      const userMessage = await deps.conversations.createMessage(tenantId, conversation.id, {
        senderType: 'USER',
        content: question,
      });

      if (conversation.title === null) {
        await deps.conversations.updateConversationTitle(
          tenantId,
          conversation.id,
          deriveConsultantConversationTitle(question),
        );
      }

      const history = await deps.conversations.listMessages(tenantId, conversation.id);
      const priorUserContents = history
        .filter(
          (item) =>
            item.tenantId === tenantId &&
            item.conversationId === conversation.id &&
            item.senderType === 'USER' &&
            item.id !== userMessage.id,
        )
        .map((item) => item.content);
      const period = resolveAdvisorConversationalPeriod({
        content: question,
        referenceMonthKey: input.monthKey,
        now: input.now,
        priorUserContents,
      });
      console.info(
        JSON.stringify({
          event: 'advisor_period_resolved',
          tenantId,
          conversationId: conversation.id,
          monthKey: period.monthKey,
          source: period.source,
          comparison: period.comparison,
          comparisonMonthKey: period.comparisonMonthKey ?? null,
        }),
      );

      const comparison =
        period.comparison &&
        period.comparisonMonthKey !== undefined &&
        deps.cashComparison !== undefined
          ? await deps.cashComparison.compare({
              tenantId,
              monthKey: period.monthKey,
              comparisonMonthKey: period.comparisonMonthKey,
              now: input.now,
            })
          : undefined;

      const nominalIntent = resolveAdvisorNominalIntent(question, {
        comparison: period.comparison,
      });
      const drilldownIntent =
        nominalIntent === null && period.comparison === false
          ? resolveAdvisorDrilldownIntent(question)
          : null;
      const preloadedTool =
        deps.analyticalTools === undefined
          ? null
          : nominalIntent !== null
            ? await deps.analyticalTools.execute({
                tenantId,
                resolvedMonthKey: period.monthKey,
                now: input.now,
                call: {
                  id: 'preload-nominal',
                  name: nominalIntent.toolName,
                  arguments: {
                    monthKey: period.monthKey,
                    ...(nominalIntent.toolName === COMPARE_CASH_NOMINAL_TOOL_NAME &&
                    period.comparisonMonthKey !== undefined
                      ? { comparisonMonthKey: period.comparisonMonthKey }
                      : {}),
                    ...(nominalIntent.categoryReference !== undefined
                      ? { categoryReference: nominalIntent.categoryReference }
                      : {}),
                    ...(nominalIntent.entityQuery !== undefined
                      ? { entityQuery: nominalIntent.entityQuery }
                      : {}),
                    ...(nominalIntent.toolName === CASH_NOMINAL_RANKING_TOOL_NAME ||
                    nominalIntent.toolName === COMPARE_CASH_NOMINAL_TOOL_NAME
                      ? { limit: nominalIntent.limit }
                      : {}),
                  },
                },
              })
            : drilldownIntent !== null
              ? await deps.analyticalTools.execute({
                  tenantId,
                  resolvedMonthKey: period.monthKey,
                  now: input.now,
                  call: {
                    id: 'preload-drilldown',
                    name: drilldownIntent.toolName,
                    arguments: {
                      monthKey: period.monthKey,
                      direction: drilldownIntent.direction,
                      limit: drilldownIntent.limit,
                      ...(drilldownIntent.toolName === 'cash_movement_lines'
                        ? { sort: drilldownIntent.sort }
                        : {}),
                    },
                  },
                })
              : null;
      const drilldown = preloadedTool;

      const built = await deps.context.build({
        tenantId,
        userId,
        conversationId: conversation.id,
        question,
        monthKey: period.monthKey,
        comparisonMonthKey: period.comparison ? period.comparisonMonthKey : undefined,
        comparison: comparison ?? null,
        drilldown:
          drilldown === null
            ? null
            : {
                toolName: drilldown.name,
                monthKey: drilldown.monthKey ?? period.monthKey,
                ok: drilldown.ok,
                content: drilldown.content,
              },
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

        const generated = await runAdvisorGeneration({
          tenantId,
          resolvedMonthKey: period.monthKey,
          providerId: ready.provider,
          model,
          blocks: built.blocks,
          generate: (payload) => provider.generate(payload),
          analyticalTools: deps.analyticalTools,
          now: input.now,
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
  return 'FAILED';
}

async function persistBlockedRun(
  runs: Pick<AdvisorRunRepository, 'createRun'>,
  input: {
    readonly tenantId: string;
    readonly userId: string;
    readonly conversationId: string;
    readonly provider: AiTenantSettingsRecord['provider'];
    readonly model: string;
    readonly status: Extract<AiRunStatus, 'LIMIT_BLOCKED' | 'FAILED'>;
    readonly errorCode: AiRunErrorCode;
  },
): Promise<void> {
  await runs.createRun(input.tenantId, {
    userId: input.userId,
    conversationId: input.conversationId,
    provider: input.provider,
    model: input.model,
    status: input.status,
    errorCode: input.errorCode,
    finishedAt: new Date(),
  });
}

async function runAdvisorGeneration(input: {
  readonly tenantId: string;
  readonly resolvedMonthKey: string;
  readonly providerId: GenerationInput['provider'];
  readonly model: string;
  readonly blocks: GenerationInput['blocks'];
  readonly generate: (payload: GenerationInput) => Promise<GenerationOutput>;
  readonly analyticalTools?: AdvisorAnalyticalToolExecutor;
  readonly now?: Date;
}): Promise<GenerationOutput> {
  const tools = input.analyticalTools?.tools ?? [];
  const toolRounds: IaToolRound[] = [];
  let usage: GenerationUsage = { inputTokens: null, outputTokens: null };

  for (let round = 0; round <= ADVISOR_MAX_TOOL_ROUNDS; round += 1) {
    const allowTools = tools.length > 0 && round < ADVISOR_MAX_TOOL_ROUNDS;
    const generated = await input.generate({
      tenantId: input.tenantId,
      provider: input.providerId,
      model: input.model,
      blocks: input.blocks,
      ...(allowTools ? { tools } : {}),
      ...(toolRounds.length > 0 ? { toolRounds } : {}),
    });
    usage = addUsage(usage, generated.usage);
    const toolCalls = generated.toolCalls ?? [];
    if (toolCalls.length === 0 || input.analyticalTools === undefined || !allowTools) {
      return { text: generated.text, usage };
    }
    const results = [];
    for (const call of toolCalls) {
      results.push(
        await input.analyticalTools.execute({
          tenantId: input.tenantId,
          resolvedMonthKey: input.resolvedMonthKey,
          call,
          now: input.now,
        }),
      );
    }
    toolRounds.push({ calls: toolCalls, results });
  }

  throw new IaProviderError('PROVIDER_ERROR', 'O provedor excedeu o limite de tool rounds.');
}

function addUsage(left: GenerationUsage, right: GenerationUsage): GenerationUsage {
  return {
    inputTokens: sumNullable(left.inputTokens, right.inputTokens),
    outputTokens: sumNullable(left.outputTokens, right.outputTokens),
  };
}

function sumNullable(left: number | null, right: number | null): number | null {
  if (left === null && right === null) {
    return null;
  }
  return (left ?? 0) + (right ?? 0);
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
