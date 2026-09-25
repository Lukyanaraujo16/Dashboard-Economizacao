import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import {
  AI_PROVIDER_MODEL_CATALOG,
  AI_RUN_ERROR_CODES,
  AdvisorExecutionError,
  createAllowAllConsultantRateLimiter,
  createFailingConsultantRateLimiter,
  createMemoryConsultantRateLimiter,
  createSendAdvisorMessage,
} from '../src/modules/advisor/index.js';
import type { ConsultantRateLimiter } from '../src/modules/advisor/domain/consultant-rate-limit.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type {
  AiProviderId,
  AiRunErrorCode,
  AiRunRecord,
  AiRunStatus,
  AiConversationRecord,
  AiMessageRecord,
  AiTenantSettingsRecord,
  UpdateAiRunInput,
} from '../src/modules/advisor/domain/types.js';
import {
  IntegrationUnavailableError,
  RateLimitedError,
} from '../src/shared/errors/application-error.js';

const EXECUTE_INPUT = {
  tenantId: 'tenant-a',
  userId: 'user-a',
  conversationId: 'conv-a',
  question: 'Quanto faturou?',
} as const;

const CONSULTANT_REPLY_MAX_CHARS = 20_000;

const VENDOR_FAILURES: ReadonlyArray<{
  readonly errorCode: AiRunErrorCode;
  readonly behavior: 'error' | 'timeout';
  readonly expectedStatus: Extract<AiRunStatus, 'FAILED' | 'TIMEOUT'>;
}> = [
  { errorCode: 'AUTH', behavior: 'error', expectedStatus: 'FAILED' },
  { errorCode: 'RATE_LIMIT', behavior: 'error', expectedStatus: 'FAILED' },
  { errorCode: 'TIMEOUT', behavior: 'timeout', expectedStatus: 'TIMEOUT' },
  { errorCode: 'MODEL_UNAVAILABLE', behavior: 'error', expectedStatus: 'FAILED' },
  { errorCode: 'BAD_REQUEST', behavior: 'error', expectedStatus: 'FAILED' },
  { errorCode: 'CONTENT_REJECTED', behavior: 'error', expectedStatus: 'FAILED' },
  { errorCode: 'PROVIDER_ERROR', behavior: 'error', expectedStatus: 'FAILED' },
  { errorCode: 'UNKNOWN', behavior: 'error', expectedStatus: 'FAILED' },
];

function settings(overrides: Partial<AiTenantSettingsRecord> = {}): AiTenantSettingsRecord {
  const now = new Date('2026-09-24T12:00:00.000Z');
  return {
    id: 'set-a',
    tenantId: 'tenant-a',
    provider: 'OPENAI',
    model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
    businessSegment: 'Clínica',
    businessDescription: 'Clínica A',
    consultantName: null,
    adminPrompt: null,
    tonePreset: 'PROFISSIONAL_OBJETIVO',
    tone: 'objetivo',
    emojiPreference: 'MODERATE',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function settingsFor(provider: AiProviderId): AiTenantSettingsRecord {
  return settings({
    provider,
    model: AI_PROVIDER_MODEL_CATALOG[provider].defaultModel,
  });
}

function conversation(tenantId = 'tenant-a', userId = 'user-a'): AiConversationRecord {
  const now = new Date('2026-09-24T12:00:00.000Z');
  return {
    id: 'conv-a',
    tenantId,
    userId,
    status: 'OPEN',
    title: null,
    startedAt: now,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

function message(
  id: string,
  senderType: AiMessageRecord['senderType'],
  content: string,
): AiMessageRecord {
  return {
    id,
    conversationId: 'conv-a',
    tenantId: 'tenant-a',
    senderType,
    content,
    messageType: 'TEXT',
    createdAt: new Date('2026-09-24T12:00:00.000Z'),
  };
}

function builtContext(): AdvisorBuiltContext {
  return {
    tenantId: 'tenant-a',
    monthKey: '2026-09',
    blocks: [
      {
        type: 'PLATFORM_INSTRUCTIONS',
        content: 'plataforma',
        trustLevel: 'PLATFORM',
      },
      {
        type: 'USER_QUESTION',
        content: 'Quanto faturou?',
        trustLevel: 'UNTRUSTED',
      },
    ],
  };
}

function otherProvider(provider: AiProviderId): AiProviderId {
  return provider === 'OPENAI' ? 'ANTHROPIC' : 'OPENAI';
}

function createHarness(options?: {
  readonly settingsRow?: AiTenantSettingsRecord | null;
  readonly openai?: ReturnType<typeof createFakeIaProvider>;
  readonly anthropic?: ReturnType<typeof createFakeIaProvider>;
  readonly rateLimiter?: ConsultantRateLimiter;
}) {
  const openai = options?.openai ?? createFakeIaProvider({ id: 'OPENAI', text: 'Faturamento oficial: 0' });
  const anthropic = options?.anthropic ?? createFakeIaProvider({ id: 'ANTHROPIC' });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let messageSeq = 0;
  let runSeq = 0;

  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        const row = options?.settingsRow === undefined ? settings() : options.settingsRow;
        if (row === null || row.tenantId !== tenantId) {
          return null;
        }
        return row;
      },
    },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        const row = conversation();
        if (row.tenantId !== tenantId || row.userId !== userId || row.id !== conversationId) {
          return null;
        }
        return row;
      },
      async createMessage(_tenantId, _conversationId, input) {
        const created = message(`msg-${++messageSeq}`, input.senderType, input.content);
        messages.push(created);
        return created;
      },
      async updateConversationTitle(tenantId, conversationId, title) {
        const row = conversation();
        if (row.tenantId !== tenantId || row.id !== conversationId) {
          return null;
        }
        return { ...row, title };
      },
      async listMessages() {
        return messages;
      },
    },
    runs: {
      async createRun(tenantId, input) {
        const now = new Date();
        const created: AiRunRecord = {
          id: `run-${++runSeq}`,
          tenantId,
          userId: input.userId ?? null,
          conversationId: input.conversationId ?? null,
          messageId: input.messageId ?? null,
          runType: input.runType ?? 'QUESTION_REPLY',
          provider: input.provider,
          model: input.model,
          status: input.status,
          inputTokens: input.inputTokens ?? null,
          outputTokens: input.outputTokens ?? null,
          durationMs: input.durationMs ?? null,
          errorCode: input.errorCode ?? null,
          createdAt: now,
          finishedAt: input.finishedAt ?? null,
        };
        runs.push(created);
        return created;
      },
      async updateRun(tenantId, runId, input: UpdateAiRunInput) {
        const index = runs.findIndex((row) => row.id === runId && row.tenantId === tenantId);
        if (index < 0) {
          throw new Error('run ausente');
        }
        const current = runs[index]!;
        const next: AiRunRecord = {
          ...current,
          status: input.status,
          inputTokens: input.inputTokens === undefined ? current.inputTokens : input.inputTokens,
          outputTokens: input.outputTokens === undefined ? current.outputTokens : input.outputTokens,
          durationMs: input.durationMs === undefined ? current.durationMs : input.durationMs,
          errorCode: input.errorCode === undefined ? current.errorCode : input.errorCode,
          finishedAt: input.finishedAt === undefined ? current.finishedAt : input.finishedAt,
          messageId: input.messageId === undefined ? current.messageId : input.messageId,
        };
        runs[index] = next;
        return next;
      },
    },
    context: {
      build: vi.fn(async () => builtContext()),
    },
    providers: createIaProviderRegistry({ openai, anthropic }),
    rateLimiter: options?.rateLimiter ?? createAllowAllConsultantRateLimiter(),
  });

  return { send, openai, anthropic, messages, runs };
}

describe('advisor provider failures / ai_runs', () => {
  it('cobre todos os error codes de vendor exigidos', () => {
    expect(VENDOR_FAILURES.map((item) => item.errorCode)).toEqual([...AI_RUN_ERROR_CODES]);
  });

  describe.each(['OPENAI', 'ANTHROPIC'] as const)('%s', (provider) => {
    it.each(VENDOR_FAILURES)(
      '$errorCode → ai_run $expectedStatus sem fallback cruzado',
      async ({ errorCode, behavior, expectedStatus }) => {
        const peer = otherProvider(provider);
        const failing = createFakeIaProvider({
          id: provider,
          behavior,
          errorCode,
        });
        const unused = createFakeIaProvider({
          id: peer,
          text: 'não deveria gerar no provider cruzado',
        });
        const failingSpy = vi.spyOn(failing, 'generate');
        const unusedSpy = vi.spyOn(unused, 'generate');
        const { send, messages, runs } = createHarness({
          settingsRow: settingsFor(provider),
          openai: provider === 'OPENAI' ? failing : unused,
          anthropic: provider === 'ANTHROPIC' ? failing : unused,
        });

        const pending = send.execute(EXECUTE_INPUT);
        await expect(pending).rejects.toBeInstanceOf(AdvisorExecutionError);
        await expect(pending).rejects.toMatchObject({ code: errorCode });

        const run = runs[0];
        expect(messages.map((item) => item.senderType)).toEqual(['USER']);
        expect(messages[0]?.content).toBe(EXECUTE_INPUT.question);
        expect(run?.provider).toBe(provider);
        expect(run?.status).toBe(expectedStatus);
        expect(run?.status).not.toBe('STARTED');
        expect(run?.status).not.toBe('LIMIT_BLOCKED');
        expect(run?.errorCode).toBe(errorCode);
        expect(run?.finishedAt).not.toBeNull();
        expect(failing.lastInput?.provider).toBe(provider);
        expect(failingSpy).toHaveBeenCalledTimes(1);
        expect(unusedSpy).not.toHaveBeenCalled();

        if (errorCode === 'RATE_LIMIT') {
          expect(run?.status).toBe('FAILED');
          expect(run?.errorCode).toBe('RATE_LIMIT');
          expect(run?.status).not.toBe('LIMIT_BLOCKED');
        }
      },
    );
  });

  it('plataforma limiter recusa → LIMIT_BLOCKED, generate não chamado, USER não persistida', async () => {
    const openai = createFakeIaProvider({ id: 'OPENAI', text: 'não deveria' });
    const anthropic = createFakeIaProvider({ id: 'ANTHROPIC', text: 'não deveria' });
    const openaiSpy = vi.spyOn(openai, 'generate');
    const anthropicSpy = vi.spyOn(anthropic, 'generate');
    const { send, messages, runs } = createHarness({
      openai,
      anthropic,
      rateLimiter: createMemoryConsultantRateLimiter({ userMax: 0 }),
    });

    const pending = send.execute(EXECUTE_INPUT);
    await expect(pending).rejects.toBeInstanceOf(RateLimitedError);
    await expect(pending).rejects.toMatchObject({
      code: 'RATE_LIMITED',
      httpStatus: 429,
    });

    expect(messages).toEqual([]);
    expect(runs[0]?.status).toBe('LIMIT_BLOCKED');
    expect(runs[0]?.errorCode).toBe('RATE_LIMIT');
    expect(runs[0]?.finishedAt).not.toBeNull();
    expect(runs[0]?.status).not.toBe('STARTED');
    expect(openaiSpy).not.toHaveBeenCalled();
    expect(anthropicSpy).not.toHaveBeenCalled();
  });

  it('store_unavailable → IntegrationUnavailableError 503, generate não chamado', async () => {
    const openai = createFakeIaProvider({ id: 'OPENAI', text: 'não deveria' });
    const anthropic = createFakeIaProvider({ id: 'ANTHROPIC', text: 'não deveria' });
    const openaiSpy = vi.spyOn(openai, 'generate');
    const anthropicSpy = vi.spyOn(anthropic, 'generate');
    const { send, messages, runs } = createHarness({
      openai,
      anthropic,
      rateLimiter: createFailingConsultantRateLimiter(),
    });

    const pending = send.execute(EXECUTE_INPUT);
    await expect(pending).rejects.toBeInstanceOf(IntegrationUnavailableError);
    await expect(pending).rejects.toMatchObject({
      code: 'INTEGRATION_UNAVAILABLE',
      httpStatus: 503,
    });

    expect(messages).toEqual([]);
    expect(runs[0]?.status).toBe('FAILED');
    expect(runs[0]?.errorCode).toBe('UNKNOWN');
    expect(runs[0]?.finishedAt).not.toBeNull();
    expect(runs[0]?.status).not.toBe('STARTED');
    expect(openaiSpy).not.toHaveBeenCalled();
    expect(anthropicSpy).not.toHaveBeenCalled();
  });

  it.each(['', '   ', '\n\t  '])(
    'output vazio/whitespace %j → FAILED PROVIDER_ERROR, USER preservada, sem CONSULTANT',
    async (text) => {
      const openai = createFakeIaProvider({ id: 'OPENAI', text });
      const anthropic = createFakeIaProvider({ id: 'ANTHROPIC', text: 'cruzado' });
      const openaiSpy = vi.spyOn(openai, 'generate');
      const anthropicSpy = vi.spyOn(anthropic, 'generate');
      const { send, messages, runs } = createHarness({ openai, anthropic });

      await expect(send.execute(EXECUTE_INPUT)).rejects.toMatchObject({
        code: 'PROVIDER_ERROR',
      });

      expect(messages.map((item) => item.senderType)).toEqual(['USER']);
      expect(messages[0]?.content).toBe(EXECUTE_INPUT.question);
      expect(runs[0]?.status).toBe('FAILED');
      expect(runs[0]?.errorCode).toBe('PROVIDER_ERROR');
      expect(runs[0]?.finishedAt).not.toBeNull();
      expect(runs[0]?.status).not.toBe('STARTED');
      expect(openaiSpy).toHaveBeenCalledTimes(1);
      expect(anthropicSpy).not.toHaveBeenCalled();
    },
  );

  it('HTML/script do Fake é persistido como texto, sem strip de HTML nem de números', async () => {
    const html =
      '<script>alert(1)</script><p>Faturamento oficial: R$ 1.234,56</p><!-- comentário -->';
    const { send, messages, runs } = createHarness({
      openai: createFakeIaProvider({ id: 'OPENAI', text: html }),
    });

    const result = await send.execute(EXECUTE_INPUT);

    expect(result.consultantMessage.content).toBe(html);
    expect(result.consultantMessage.content).toContain('<script>alert(1)</script>');
    expect(result.consultantMessage.content).toContain('1.234,56');
    expect(messages.map((item) => item.senderType)).toEqual(['USER', 'CONSULTANT']);
    expect(messages[1]?.content).toBe(html);
    expect(runs[0]?.status).toBe('SUCCEEDED');
    expect(runs[0]?.finishedAt).not.toBeNull();
  });

  it('texto enorme do provider é truncado em 20000 chars', async () => {
    const huge = `prefixo-12345-${'A'.repeat(25_000)}`;
    const { send, messages } = createHarness({
      openai: createFakeIaProvider({ id: 'OPENAI', text: huge }),
    });

    const result = await send.execute(EXECUTE_INPUT);

    expect(result.consultantMessage.content).toHaveLength(CONSULTANT_REPLY_MAX_CHARS);
    expect(result.consultantMessage.content).toBe(huge.slice(0, CONSULTANT_REPLY_MAX_CHARS));
    expect(messages[1]?.content).toHaveLength(CONSULTANT_REPLY_MAX_CHARS);
  });
});
