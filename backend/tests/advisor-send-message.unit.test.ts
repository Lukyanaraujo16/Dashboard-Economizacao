import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import {
  AI_PROVIDER_MODEL_CATALOG,
  AdvisorDomainError,
  AdvisorExecutionError,
  createAllowAllConsultantRateLimiter,
  createBuildAdvisorContext,
  createSendAdvisorMessage,
  type BuildAdvisorContextInput,
} from '../src/modules/advisor/index.js';
import type { ConsultantRateLimiter } from '../src/modules/advisor/domain/consultant-rate-limit.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
  UpdateAiRunInput,
} from '../src/modules/advisor/domain/types.js';

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
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
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

function createHarness(options?: {
  readonly settingsRow?: AiTenantSettingsRecord | null;
  readonly openai?: ReturnType<typeof createFakeIaProvider>;
  readonly anthropic?: ReturnType<typeof createFakeIaProvider>;
  readonly rateLimiter?: ConsultantRateLimiter;
  readonly context?: { build: (input: BuildAdvisorContextInput) => Promise<AdvisorBuiltContext> };
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
    context: options?.context ?? {
      build: vi.fn(async () => builtContext()),
    },
    providers: createIaProviderRegistry({ openai, anthropic }),
    rateLimiter: options?.rateLimiter ?? createAllowAllConsultantRateLimiter(),
  });

  return { send, openai, anthropic, messages, runs };
}

describe('send-advisor-message (F13.3)', () => {
  it('executa fluxo reativo com sucesso e registra ai_run SUCCEEDED', async () => {
    const { send, openai, messages, runs } = createHarness();
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto faturou?',
    });

    expect(result.userMessage.senderType).toBe('USER');
    expect(result.consultantMessage.senderType).toBe('CONSULTANT');
    expect(result.consultantMessage.content).toBe('Faturamento oficial: 0');
    expect(result.run.status).toBe('SUCCEEDED');
    expect(result.run.provider).toBe('OPENAI');
    expect(result.run.model).toBe(AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel);
    expect(result.run.errorCode).toBeNull();
    expect(messages.map((item) => item.senderType)).toEqual(['USER', 'CONSULTANT']);
    expect(runs[0]?.status).toBe('SUCCEEDED');
    expect(openai.lastInput?.tenantId).toBe('tenant-a');
    expect(openai.lastInput?.provider).toBe('OPENAI');
  });

  it('em falha do provider atualiza ai_run e não cria resposta CONSULTANT', async () => {
    const { send, messages, runs } = createHarness({
      openai: createFakeIaProvider({ id: 'OPENAI', behavior: 'error', errorCode: 'RATE_LIMIT' }),
    });

    await expect(
      send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Quanto faturou?',
      }),
    ).rejects.toBeInstanceOf(AdvisorExecutionError);

    expect(messages.map((item) => item.senderType)).toEqual(['USER']);
    expect(runs[0]?.status).toBe('FAILED');
    expect(runs[0]?.errorCode).toBe('RATE_LIMIT');
    expect(runs[0]?.finishedAt).not.toBeNull();
  });

  it('timeout do provider conclui ai_run TIMEOUT sem fallback cruzado', async () => {
    const anthropic = createFakeIaProvider({ id: 'ANTHROPIC', text: 'não deveria' });
    const generateSpy = vi.spyOn(anthropic, 'generate');
    const { send, runs } = createHarness({
      openai: createFakeIaProvider({ id: 'OPENAI', behavior: 'timeout' }),
      anthropic,
    });

    await expect(
      send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Quanto faturou?',
      }),
    ).rejects.toMatchObject({ code: 'TIMEOUT' });

    expect(runs[0]?.status).toBe('TIMEOUT');
    expect(runs[0]?.errorCode).toBe('TIMEOUT');
    expect(generateSpy).not.toHaveBeenCalled();
  });

  it('tenant Anthropic usa só Anthropic; falha não chama OpenAI', async () => {
    const openai = createFakeIaProvider({ id: 'OPENAI', text: 'cruzado' });
    const openaiSpy = vi.spyOn(openai, 'generate');
    const { send, anthropic, runs } = createHarness({
      settingsRow: settings({
        provider: 'ANTHROPIC',
        model: AI_PROVIDER_MODEL_CATALOG.ANTHROPIC.defaultModel,
      }),
      openai,
      anthropic: createFakeIaProvider({
        id: 'ANTHROPIC',
        behavior: 'error',
        errorCode: 'AUTH',
      }),
    });

    await expect(
      send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Quanto faturou?',
      }),
    ).rejects.toMatchObject({ code: 'AUTH' });

    expect(anthropic.lastInput?.provider).toBe('ANTHROPIC');
    expect(openaiSpy).not.toHaveBeenCalled();
    expect(runs[0]?.provider).toBe('ANTHROPIC');
    expect(runs[0]?.status).toBe('FAILED');
  });

  it('aborta sem settings ACTIVE antes de persistir mensagem USER', async () => {
    const { send, messages, runs } = createHarness({ settingsRow: null });
    await expect(
      send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Quanto faturou?',
      }),
    ).rejects.toMatchObject({ code: 'CONSULTANT_NOT_CONFIGURED' });
    expect(messages).toEqual([]);
    expect(runs).toEqual([]);

    const disabled = createHarness({ settingsRow: settings({ status: 'DISABLED' }) });
    await expect(
      disabled.send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Quanto faturou?',
      }),
    ).rejects.toMatchObject({ code: 'CONSULTANT_DISABLED' });
    expect(disabled.messages).toEqual([]);
  });

  it('não carrega conversa de outro tenant/user e rejeita tenant vazio', async () => {
    const { send, messages } = createHarness();
    await expect(
      send.execute({
        tenantId: 'tenant-a',
        userId: 'user-b',
        conversationId: 'conv-a',
        question: 'Quanto faturou?',
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
    await expect(
      send.execute({
        tenantId: '   ',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Quanto faturou?',
      }),
    ).rejects.toBeInstanceOf(AdvisorDomainError);
    expect(messages).toEqual([]);
  });

  it('resolve agosto explícito antes do Context Builder mesmo com reference setembro', async () => {
    const build = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'MISSING',
    }));
    const { send } = createHarness({ context: { build } });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu faturamento em agosto de 2026?',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({
        monthKey: '2026-08',
        question: 'Qual foi meu faturamento em agosto de 2026?',
      }),
    );
    expect(result.run.status).toBe('SUCCEEDED');
  });

  it('regression smoke: FINANCIAL_FACTS de agosto chegam ao Fake com selected setembro', async () => {
    const cashFlowMonths: string[] = [];
    const context = createBuildAdvisorContext({
      settings: {
        async findSettingsByTenant() {
          return settings();
        },
      },
      knowledge: {
        async listKnowledge() {
          return [];
        },
      },
      conversations: {
        async findConversation() {
          return conversation();
        },
        async listMessages() {
          return [];
        },
      },
      cashFlow: {
        async getMonthlyCashFlow(input) {
          cashFlowMonths.push(input.monthKey ?? 'MISSING');
          const billingAugust = input.monthKey === '2026-08';
          return {
            tenantId: 'tenant-a',
            today: new Date('2026-09-24T00:00:00.000Z'),
            monthKey: input.monthKey ?? '2026-09',
            from: new Date('2026-08-01T00:00:00.000Z'),
            to: new Date('2026-08-31T00:00:00.000Z'),
            costCenterCashSplit: true,
            realized: {
              inflows: new Prisma.Decimal(billingAugust ? '224790.3' : '0'),
              outflows: new Prisma.Decimal('0'),
              result: new Prisma.Decimal(billingAugust ? '224790.3' : '0'),
            },
            realizedByCategory: { inflows: null, outflows: null },
            expected: {
              receivables: new Prisma.Decimal('0'),
              payables: new Prisma.Decimal('0'),
              result: new Prisma.Decimal('0'),
            },
            overdue: {
              receivables: new Prisma.Decimal('0'),
              payables: new Prisma.Decimal('0'),
              ofMonth: { receivables: new Prisma.Decimal('0'), payables: new Prisma.Decimal('0') },
            },
            stock: {
              receivables: { open: null, overdue: null, dueToday: null, upcoming: null },
              payables: { open: null, overdue: null, dueToday: null, upcoming: null },
            },
            coverage: null,
            daily: { realized: [], expected: [] },
          } satisfies MonthlyCashFlow;
        },
      },
      analytics: {
        async getFinancialStockSnapshot() {
          return {
            tenantId: 'tenant-a',
            today: new Date('2026-09-24T00:00:00.000Z'),
            receivables: { open: new Prisma.Decimal('0'), overdue: new Prisma.Decimal('0'), upcoming: new Prisma.Decimal('0') },
            payables: { open: new Prisma.Decimal('0'), overdue: new Prisma.Decimal('0'), upcoming: new Prisma.Decimal('0') },
            receivableDelinquency: {
              overdueUnpaid: new Prisma.Decimal('0'),
              openUnpaid: new Prisma.Decimal('0'),
              rate: null,
            },
          };
        },
      },
    });
    const { send, openai } = createHarness({ context });
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu faturamento em agosto de 2026?',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    const facts = openai.lastInput?.blocks.find((block) => block.type === 'FINANCIAL_FACTS');
    expect(cashFlowMonths).toEqual(['2026-08']);
    expect(facts?.content).toContain('monthKey: 2026-08');
    expect(facts?.content).toContain('billing: 224790.3');
    expect(facts?.content).not.toContain('monthKey: 2026-09');
  });
});
