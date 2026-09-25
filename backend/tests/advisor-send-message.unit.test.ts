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
  type SendAdvisorMessageDependencies,
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
    emojiPreference: 'MODERATE',
    status: 'ACTIVE',
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

function conversation(
  tenantId = 'tenant-a',
  userId = 'user-a',
  id = 'conv-a',
): AiConversationRecord {
  const now = new Date('2026-09-24T12:00:00.000Z');
  return {
    id,
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
  tenantId = 'tenant-a',
  conversationId = 'conv-a',
): AiMessageRecord {
  return {
    id,
    conversationId,
    tenantId,
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
  readonly extraSettings?: readonly AiTenantSettingsRecord[];
  readonly extraConversations?: readonly AiConversationRecord[];
  readonly openai?: ReturnType<typeof createFakeIaProvider>;
  readonly anthropic?: ReturnType<typeof createFakeIaProvider>;
  readonly rateLimiter?: ConsultantRateLimiter;
  readonly context?: { build: (input: BuildAdvisorContextInput) => Promise<AdvisorBuiltContext> };
  readonly analyticalTools?: SendAdvisorMessageDependencies['analyticalTools'];
  readonly cashComparison?: SendAdvisorMessageDependencies['cashComparison'];
}) {
  const openai = options?.openai ?? createFakeIaProvider({ id: 'OPENAI', text: 'Faturamento oficial: 0' });
  const anthropic = options?.anthropic ?? createFakeIaProvider({ id: 'ANTHROPIC' });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let messageSeq = 0;
  let runSeq = 0;
  const conversationRows = [conversation(), ...(options?.extraConversations ?? [])];

  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        const extras = options?.extraSettings ?? [];
        const extra = extras.find((row) => row.tenantId === tenantId);
        if (extra !== undefined) {
          return extra;
        }
        const row = options?.settingsRow === undefined ? settings() : options.settingsRow;
        if (row === null || row.tenantId !== tenantId) {
          return null;
        }
        return row;
      },
    },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        return (
          conversationRows.find(
            (row) => row.tenantId === tenantId && row.userId === userId && row.id === conversationId,
          ) ?? null
        );
      },
      async createMessage(tenantId, conversationId, input) {
        const created = message(`msg-${++messageSeq}`, input.senderType, input.content, tenantId, conversationId);
        messages.push(created);
        return created;
      },
      async updateConversationTitle(tenantId, conversationId, title) {
        const row = conversationRows.find((item) => item.tenantId === tenantId && item.id === conversationId);
        if (row === undefined) {
          return null;
        }
        return { ...row, title };
      },
      async listMessages(tenantId, conversationId) {
        return messages.filter(
          (item) => item.tenantId === tenantId && item.conversationId === conversationId,
        );
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
    analyticalTools: options?.analyticalTools,
    cashComparison: options?.cashComparison,
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
    expect(result.run).not.toBeNull();
    expect(result.run!.status).toBe('SUCCEEDED');
    expect(result.run!.provider).toBe('OPENAI');
    expect(result.run!.model).toBe(AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel);
    expect(result.run!.errorCode).toBeNull();
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
    expect(result.run).not.toBeNull();
    expect(result.run!.status).toBe('SUCCEEDED');
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

  it('follow-up sem mês herda agosto da conversa e não o Dashboard', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const { send } = createHarness({ context: { build: contextBuild } });
    const now = new Date('2026-09-24T18:00:00.000Z');

    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Como está meu faturamento em agosto de 2026?',
      monthKey: '2026-09',
      now,
    });
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E quanto faltou para atingir nossa meta?',
      monthKey: '2026-09',
      now,
    });

    expect(contextBuild).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        monthKey: '2026-08',
        question: 'E quanto faltou para atingir nossa meta?',
      }),
    );
  });

  it('CONSULTANT mencionando setembro não vira autoridade temporal', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const { send, messages } = createHarness({
      context: { build: contextBuild },
      openai: createFakeIaProvider({
        id: 'OPENAI',
        text: 'Em setembro de 2026 o faturamento oficial foi 10.',
      }),
    });
    const now = new Date('2026-09-24T18:00:00.000Z');
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Como está meu faturamento?',
      monthKey: '2026-09',
      now,
    });
    expect(messages.some((item) => item.senderType === 'CONSULTANT')).toBe(true);
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E as despesas?',
      monthKey: '2026-09',
      now,
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        monthKey: '2026-09',
        question: 'E as despesas?',
      }),
    );
  });

  it('conversa de outro tenant/user não influencia o período', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const now = new Date('2026-09-24T18:00:00.000Z');
    const { send } = createHarness({
      context: { build: contextBuild },
      extraSettings: [settings({ id: 'set-b', tenantId: 'tenant-b' })],
      extraConversations: [conversation('tenant-b', 'user-b', 'conv-b')],
    });
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Como está meu faturamento em agosto de 2026?',
      monthKey: '2026-09',
      now,
    });
    await expect(
      send.execute({
        tenantId: 'tenant-b',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'E quanto faltou para a meta?',
        monthKey: '2026-09',
        now,
      }),
    ).rejects.toMatchObject({ code: 'CONVERSATION_NOT_FOUND' });
    await send.execute({
      tenantId: 'tenant-b',
      userId: 'user-b',
      conversationId: 'conv-b',
      question: 'E quanto faltou para a meta?',
      monthKey: '2026-09',
      now,
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-b',
        monthKey: '2026-09',
        question: 'E quanto faltou para a meta?',
      }),
    );
  });

  it('nova conversa sem USER anterior usa o mês do Dashboard', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const { send } = createHarness({ context: { build: contextBuild } });
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Como está meu faturamento?',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(contextBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        monthKey: '2026-09',
        question: 'Como está meu faturamento?',
      }),
    );
  });

  it('reload reconstrói agosto a partir das mensagens USER persistidas', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const { send, messages } = createHarness({ context: { build: contextBuild } });
    messages.push(
      message('prior-user', 'USER', 'Como está meu faturamento em agosto de 2026?'),
    );
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E quanto faltou para atingir nossa meta?',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(contextBuild).toHaveBeenCalledWith(
      expect.objectContaining({
        monthKey: '2026-08',
        question: 'E quanto faltou para atingir nossa meta?',
      }),
    );
  });

  it('E em julho troca o período e o follow-up seguinte herda julho', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const { send } = createHarness({ context: { build: contextBuild } });
    const now = new Date('2026-09-24T18:00:00.000Z');
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Como foi agosto de 2026?',
      monthKey: '2026-09',
      now,
    });
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em julho?',
      monthKey: '2026-09',
      now,
    });
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E as despesas?',
      monthKey: '2026-09',
      now,
    });
    expect(contextBuild).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ monthKey: '2026-07', question: 'E em julho?' }),
    );
    expect(contextBuild).toHaveBeenNthCalledWith(
      3,
      expect.objectContaining({ monthKey: '2026-07', question: 'E as despesas?' }),
    );
  });

  it('comparando jul/ago pré-carrega os dois períodos e não cai em setembro', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
      comparisonMonthKey: input.comparisonMonthKey,
    }));
    const compare = vi.fn(async (input: { tenantId: string; monthKey: string; comparisonMonthKey: string }) => {
      expect(input.tenantId).toBe('tenant-a');
      return {
        tenantId: 'tenant-a',
        monthKey: input.monthKey,
        comparisonMonthKey: input.comparisonMonthKey,
        periodA: {
          monthKey: input.comparisonMonthKey,
          billing: new Prisma.Decimal('136659.99'),
          realizedInflows: new Prisma.Decimal('136659.99'),
          realizedOutflows: new Prisma.Decimal('0'),
          realizedResult: new Prisma.Decimal('136659.99'),
          expectedReceivables: new Prisma.Decimal('0'),
          expectedPayables: new Prisma.Decimal('0'),
        },
        periodB: {
          monthKey: input.monthKey,
          billing: new Prisma.Decimal('224790.3'),
          realizedInflows: new Prisma.Decimal('224790.3'),
          realizedOutflows: new Prisma.Decimal('0'),
          realizedResult: new Prisma.Decimal('224790.3'),
          expectedReceivables: new Prisma.Decimal('0'),
          expectedPayables: new Prisma.Decimal('0'),
        },
        difference: {
          billing: new Prisma.Decimal('88130.31'),
          billingPercent: new Prisma.Decimal('64.49'),
          realizedInflows: new Prisma.Decimal('88130.31'),
          realizedOutflows: new Prisma.Decimal('0'),
          realizedResult: new Prisma.Decimal('88130.31'),
        },
        billingCoverage: 'FULL_BILLING' as const,
        inflowCategories: { available: false, items: [], increases: [], decreases: [] },
        outflowCategories: { available: false, items: [], increases: [], decreases: [] },
      };
    });
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'tool-1',
              name: 'compare_cash_months',
              arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07', tenantId: 'XYZ' },
            },
          ],
        },
        { text: 'A diferença oficial é 88130.31.' },
      ],
    });
    const executeTool = vi.fn(async (input: { tenantId: string; call: { id: string; name: string; arguments: Record<string, unknown> } }) => {
      expect(input.tenantId).toBe('tenant-a');
      expect(input.call.arguments.tenantId).toBe('XYZ');
      return {
        id: input.call.id,
        name: input.call.name,
        ok: false,
        content: JSON.stringify({ status: 'UNAVAILABLE', code: 'ANALYTICAL_TOOL_INVALID_INPUT' }),
      };
    });
    const { send, messages } = createHarness({
      openai,
      context: { build: contextBuild },
      cashComparison: { compare },
      analyticalTools: {
        tools: [{ name: 'compare_cash_months', description: 'cmp', inputSchema: {} }],
        execute: executeTool,
      },
    });
    const now = new Date('2026-09-24T18:00:00.000Z');
    messages.push(
      message('seed-ago', 'USER', 'Como está meu faturamento em agosto de 2026?'),
      message('seed-jul', 'USER', 'E em julho?'),
    );
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'qual foi a diferença de faturamento comparando esses dois meses?',
      monthKey: '2026-09',
      now,
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
        question: 'qual foi a diferença de faturamento comparando esses dois meses?',
      }),
    );
    expect(compare).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId: 'tenant-a',
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
      }),
    );
    expect(result.factualAnswer?.classification).toBe('FACTUAL_CLOSED');
    expect(result.factualAnswer?.providerCalled).toBe(false);
    expect(result.run).toBeNull();
    expect(result.consultantMessage.content).toContain('R$ 136.659,99');
    expect(result.consultantMessage.content).toContain('R$ 224.790,30');
    expect(result.consultantMessage.content).toContain('64,49%');
    expect(openai.generateCalls).toHaveLength(0);
    expect(executeTool).not.toHaveBeenCalled();
  });

  it('excede o máximo de tool rounds sem fabricar zero', async () => {
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        { toolCalls: [{ id: '1', name: 'compare_cash_months', arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' } }] },
        { toolCalls: [{ id: '2', name: 'compare_cash_months', arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' } }] },
        { toolCalls: [{ id: '3', name: 'compare_cash_months', arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' } }] },
        { text: '', toolCalls: [{ id: '4', name: 'compare_cash_months', arguments: { monthKey: '2026-08', comparisonMonthKey: '2026-07' } }] },
      ],
    });
    let executions = 0;
    const { send } = createHarness({
      openai,
      analyticalTools: {
        tools: [{ name: 'compare_cash_months', description: 'cmp', inputSchema: {} }],
        async execute(input) {
          executions += 1;
          return {
            id: input.call.id,
            name: input.call.name,
            ok: true,
            content: JSON.stringify({ difference: { billing: '88130.31' } }),
          };
        },
      },
    });
    await expect(
      send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Compare julho e agosto',
      }),
    ).rejects.toMatchObject({ code: 'PROVIDER_ERROR' });
    expect(executions).toBe(3);
    expect(openai.generateCalls).toHaveLength(4);
    expect(openai.generateCalls[3]?.tools).toBeUndefined();
  });

  it('executa cash_realized_breakdown e devolve a resposta final', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'bd-1',
              name: 'cash_realized_breakdown',
              arguments: { monthKey: '2026-08', direction: 'INFLOW' },
            },
          ],
        },
        { text: 'As categorias oficiais de agosto foram ranqueadas no backend.' },
      ],
    });
    const executeTool = vi.fn(async (input: { tenantId: string; call: { id: string; name: string } }) => {
      expect(input.tenantId).toBe('tenant-a');
      return {
        id: input.call.id,
        name: input.call.name,
        ok: true,
        content: JSON.stringify({
          status: 'OK',
          monthKey: '2026-08',
          categories: [{ label: 'Atendimentos Convênio', rank: 1 }],
        }),
      };
    });
    const { send } = createHarness({
      openai,
      context: { build: contextBuild },
      analyticalTools: {
        tools: [{ name: 'cash_realized_breakdown', description: 'bd', inputSchema: {} }],
        execute: executeTool,
      },
    });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quais categorias mais faturaram em agosto?',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({ monthKey: '2026-08' }),
    );
    expect(result.consultantMessage.content).toBe(
      'As categorias oficiais de agosto foram ranqueadas no backend.',
    );
    expect(executeTool).toHaveBeenCalled();
    expect(openai.generateCalls).toHaveLength(2);
  });

  it('executa cash_movement_lines com julho herdado da conversa', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'mv-1',
              name: 'cash_movement_lines',
              arguments: { monthKey: '2026-07', direction: 'INFLOW', limit: 5 },
            },
          ],
        },
        { text: 'Estou mostrando os 5 maiores recebimentos individuais de julho.' },
      ],
    });
    const executeTool = vi.fn(async (input: { tenantId: string; call: { id: string; arguments: Record<string, unknown> } }) => {
      expect(input.tenantId).toBe('tenant-a');
      expect(input.call.arguments.monthKey).toBe('2026-07');
      return {
        id: input.call.id,
        name: 'cash_movement_lines',
        ok: true,
        content: JSON.stringify({
          status: 'OK',
          monthKey: '2026-07',
          returnedCount: 5,
          hasMore: true,
          notAConvenioRanking: true,
        }),
      };
    });
    const { send, messages } = createHarness({
      openai,
      context: { build: contextBuild },
      analyticalTools: {
        tools: [{ name: 'cash_movement_lines', description: 'mv', inputSchema: {} }],
        execute: executeTool,
      },
    });
    messages.push(
      message('seed-ago', 'USER', 'Como está agosto?'),
      message('seed-jul', 'USER', 'E julho?'),
    );
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quais foram os maiores recebimentos desse mês?',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({ monthKey: '2026-07' }),
    );
    expect(result.consultantMessage.content).toBe(
      'Estou mostrando os 5 maiores recebimentos individuais de julho.',
    );
    expect(executeTool).toHaveBeenCalled();
  });

  it('pré-carrega os 10 maiores recebimentos de julho no período explícito', async () => {
    const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
      ...builtContext(),
      monthKey: input.monthKey ?? 'missing',
    }));
    const executeTool = vi.fn(async (input: {
      tenantId: string;
      resolvedMonthKey?: string;
      call: { id: string; name: string; arguments: Record<string, unknown> };
    }) => {
      expect(input.tenantId).toBe('tenant-a');
      expect(input.resolvedMonthKey).toBe('2026-07');
      expect(input.call.name).toBe('cash_movement_lines');
      expect(input.call.arguments).toEqual({
        monthKey: '2026-07',
        direction: 'INFLOW',
        sort: 'AMOUNT_DESC',
        limit: 10,
      });
      return {
        id: input.call.id,
        name: input.call.name,
        ok: true,
        monthKey: '2026-07',
        content: JSON.stringify({
          status: 'OK',
          monthKey: '2026-07',
          direction: 'INFLOW',
          sort: 'AMOUNT_DESC',
          requestedLimit: 10,
          effectiveLimit: 10,
          returnedCount: 10,
          hasMore: true,
        }),
      };
    });
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      text: 'Estes são os 10 maiores recebimentos individuais de julho.',
    });
    const { send, messages } = createHarness({
      openai,
      context: { build: contextBuild },
      analyticalTools: {
        tools: [{ name: 'cash_movement_lines', description: 'mv', inputSchema: {} }],
        execute: executeTool,
      },
    });
    messages.push(
      message('seed-ago', 'USER', 'Quais foram os 5 maiores recebimentos de agosto?'),
      message('seed-cmp', 'USER', 'Qual foi a diferença entre julho e agosto?'),
    );
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Me mostre os 10 maiores recebimentos de julho.',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(contextBuild).toHaveBeenLastCalledWith(
      expect.objectContaining({
        monthKey: '2026-07',
        drilldown: expect.objectContaining({
          toolName: 'cash_movement_lines',
          monthKey: '2026-07',
          ok: true,
        }),
      }),
    );
    expect(result.consultantMessage.content).toBe(
      'Estes são os 10 maiores recebimentos individuais de julho.',
    );
    expect(executeTool).toHaveBeenCalled();
  });
});
