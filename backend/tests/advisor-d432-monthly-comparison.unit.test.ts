import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { Prisma } from '../src/generated/prisma/client.js';
import {
  ADVISOR_FACTUAL_COMPOSER_VERSION,
  AI_PROVIDER_MODEL_CATALOG,
  COMPARE_CASH_MONTHS_TOOL_NAME,
  composeAdvisorFactualAnswer,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
  isAdvisorInterpretiveQuestion,
  listAdvisorNamedPeriodKeys,
  resolveAdvisorConversationalCostCenter,
  resolveAdvisorConversationalPeriod,
  serializeAdvisorMonthlyComparisonFacts,
  type BuildAdvisorContextInput,
} from '../src/modules/advisor/index.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
  UpdateAiRunInput,
} from '../src/modules/advisor/domain/types.js';

const NOW = new Date('2026-09-25T18:00:00.000Z');

function officialComparison() {
  return {
    tenantId: 'tenant-a',
    monthKey: '2026-08',
    comparisonMonthKey: '2026-07',
    periodA: {
      monthKey: '2026-07',
      billing: new Prisma.Decimal('136659.99'),
      realizedInflows: new Prisma.Decimal('136659.99'),
      realizedOutflows: new Prisma.Decimal('135897.54'),
      realizedResult: new Prisma.Decimal('762.45'),
      expectedReceivables: new Prisma.Decimal('0'),
      expectedPayables: new Prisma.Decimal('0'),
    },
    periodB: {
      monthKey: '2026-08',
      billing: new Prisma.Decimal('224790.3'),
      realizedInflows: new Prisma.Decimal('224790.3'),
      realizedOutflows: new Prisma.Decimal('98941.52'),
      realizedResult: new Prisma.Decimal('125848.78'),
      expectedReceivables: new Prisma.Decimal('0'),
      expectedPayables: new Prisma.Decimal('0'),
    },
    difference: {
      billing: new Prisma.Decimal('88130.31'),
      billingPercent: new Prisma.Decimal('64.49'),
      realizedInflows: new Prisma.Decimal('88130.31'),
      realizedOutflows: new Prisma.Decimal('-36955.98'),
      realizedResult: new Prisma.Decimal('125086.33'),
    },
    billingCoverage: 'FULL_BILLING' as const,
    inflowCategories: { available: false, items: [], increases: [], decreases: [] },
    outflowCategories: { available: false, items: [], increases: [], decreases: [] },
  };
}

function settings(): AiTenantSettingsRecord {
  const now = new Date('2026-09-25T12:00:00.000Z');
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
  };
}

function conversation(
  tenantId = 'tenant-a',
  userId = 'user-a',
  id = 'conv-a',
): AiConversationRecord {
  const now = new Date('2026-09-25T12:00:00.000Z');
  return {
    id,
    tenantId,
    userId,
    status: 'OPEN',
    title: 't',
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
    createdAt: new Date('2026-09-25T12:00:00.000Z'),
  };
}

function createHarness() {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'resposta interpretativa do provider' });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  const toolCalls: string[] = [];
  let messageSeq = 0;
  let runSeq = 0;
  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        return tenantId === 'tenant-a' ? settings() : null;
      },
    },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        if (conversationId === 'conv-a' && tenantId === 'tenant-a' && userId === 'user-a') {
          return conversation();
        }
        return conversationId === 'conv-b' ? conversation('tenant-a', 'user-a', 'conv-b') : null;
      },
      async createMessage(tenantId, conversationId, input) {
        const created = message(`msg-${++messageSeq}`, input.senderType, input.content, tenantId, conversationId);
        messages.push(created);
        return created;
      },
      async updateConversationTitle() {
        return conversation();
      },
      async listMessages(tenantId, conversationId) {
        return messages.filter((item) => item.tenantId === tenantId && item.conversationId === conversationId);
      },
    },
    runs: {
      async createRun(tenantId, input) {
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
          createdAt: new Date(),
          finishedAt: input.finishedAt ?? null,
        };
        runs.push(created);
        return created;
      },
      async updateRun(tenantId, runId, input: UpdateAiRunInput) {
        const index = runs.findIndex((row) => row.id === runId && row.tenantId === tenantId);
        runs[index] = { ...runs[index]!, status: input.status };
        return runs[index]!;
      },
    },
    context: {
      build: vi.fn(async (input: BuildAdvisorContextInput): Promise<AdvisorBuiltContext> => ({
        tenantId: input.tenantId,
        monthKey: input.monthKey,
        comparisonMonthKey: input.comparisonMonthKey,
        blocks: [
          { type: 'PLATFORM_INSTRUCTIONS', content: 'plataforma', trustLevel: 'PLATFORM' },
          { type: 'USER_QUESTION', content: input.question, trustLevel: 'UNTRUSTED' },
        ],
      })),
    },
    providers: createIaProviderRegistry({
      openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    cashComparison: {
      async compare() {
        toolCalls.push(COMPARE_CASH_MONTHS_TOOL_NAME);
        return officialComparison();
      },
    },
    analyticalTools: {
      tools: [],
      async execute({ call }) {
        toolCalls.push(call.name);
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: JSON.stringify({ status: 'OK', ranking: [], winner: { name: 'X', amount: '1', shareOfPopulation: '1' } }),
        };
      },
    },
  });
  return { send, messages, openai, runs, toolCalls };
}

describe('F13.8.1D4.3.2 temporal e compositor', () => {
  it('resolve pares mensais com ano compartilhado e virada de ano', () => {
    expect(listAdvisorNamedPeriodKeys({ content: 'Compare julho e agosto de 2026.', now: NOW })).toEqual([
      '2026-07',
      '2026-08',
    ]);
    expect(
      resolveAdvisorConversationalPeriod({ content: 'Compare junho e julho de 2026.', now: NOW }),
    ).toMatchObject({ monthKey: '2026-07', comparisonMonthKey: '2026-06', comparison: true });
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'Compare dezembro de 2025 e janeiro de 2026.',
        now: NOW,
      }),
    ).toMatchObject({ monthKey: '2026-01', comparisonMonthKey: '2025-12', comparison: true });
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Compare julho e agosto de 2026.',
        period: resolveAdvisorConversationalPeriod({
          content: 'Compare julho e agosto de 2026.',
          now: NOW,
        }),
        priorUserContents: ['Qual centro teve maior saída em agosto de 2026?'],
      }),
    ).toMatchObject({ intent: null, anaphora: 'NONE' });
  });

  it('compõe D1 factual e winner sem usar HISTORY', () => {
    const facts = serializeAdvisorMonthlyComparisonFacts(officialComparison());
    const compare = composeAdvisorFactualAnswer({
      content: 'Compare julho e agosto de 2026.',
      anaphora: 'NONE',
      toolName: COMPARE_CASH_MONTHS_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(compare.classification.kind).toBe('FACTUAL_CLOSED');
    expect(compare.answer).toContain('R$ 136.659,99');
    expect(compare.answer).toContain('R$ 224.790,30');
    expect(compare.answer).toContain('R$ 88.130,31');
    expect(compare.answer).toContain('64,49%');
    expect(compare.answer).not.toContain('84.568,61');
    expect(compare.meta?.composerVersion).toBe(ADVISOR_FACTUAL_COMPOSER_VERSION);

    const winner = composeAdvisorFactualAnswer({
      content: 'E qual mês teve maior faturamento?',
      anaphora: 'NONE',
      toolName: COMPARE_CASH_MONTHS_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(winner.classification.intentKind).toBe('MONTHLY_BILLING_WINNER');
    expect(winner.answer).toContain('agosto de 2026');
    expect(winner.answer).toContain('R$ 224.790,30');

    const increased = composeAdvisorFactualAnswer({
      content: 'Quanto aumentou o faturamento de julho para agosto de 2026?',
      anaphora: 'NONE',
      toolName: COMPARE_CASH_MONTHS_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(increased.classification.kind).toBe('FACTUAL_CLOSED');
  });

  it('mantém interpretativo sem fechar por keyword compare', () => {
    expect(
      isAdvisorInterpretiveQuestion('Compare julho e agosto de 2026 e me diga o que mais chama atenção.'),
    ).toBe(true);
    expect(isAdvisorInterpretiveQuestion('Por que agosto cresceu?')).toBe(true);
    expect(isAdvisorInterpretiveQuestion('Isso foi bom?')).toBe(true);
    expect(isAdvisorInterpretiveQuestion('O que você recomenda?')).toBe(true);
    expect(isAdvisorInterpretiveQuestion('Que estratégia devo seguir?')).toBe(true);
    expect(isAdvisorInterpretiveQuestion('Analise julho e agosto de 2026.')).toBe(true);
    const interpretive = composeAdvisorFactualAnswer({
      content: 'Compare julho e agosto de 2026 e me diga o que mais chama atenção.',
      anaphora: 'NONE',
      toolName: COMPARE_CASH_MONTHS_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify(serializeAdvisorMonthlyComparisonFacts(officialComparison())),
    });
    expect(interpretive.classification.kind).toBe('INTERPRETIVE');
    expect(interpretive.answer).toBeNull();
  });
});

describe('F13.8.1D4.3.2 send e isolamento', () => {
  it('fecha D1 em conversa nova e após cadeia CC sem contaminar totais', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { send, openai, runs, toolCalls } = createHarness();
    const fresh = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Compare julho e agosto de 2026.',
      now: NOW,
    });
    expect(fresh.factualAnswer?.classification).toBe('FACTUAL_CLOSED');
    expect(fresh.run).toBeNull();
    expect(openai.generateCalls).toHaveLength(0);
    expect(runs).toHaveLength(0);
    expect(toolCalls).toContain(COMPARE_CASH_MONTHS_TOOL_NAME);
    expect(fresh.consultantMessage.content).toContain('R$ 136.659,99');
    expect(fresh.consultantMessage.content).not.toContain('84.568,61');

    const winner = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E qual mês teve maior faturamento?',
      now: NOW,
    });
    expect(winner.factualAnswer?.intentKind).toBe('MONTHLY_BILLING_WINNER');
    expect(winner.run).toBeNull();
    expect(winner.consultantMessage.content).toContain('R$ 224.790,30');
    expect(openai.generateCalls).toHaveLength(0);

    const afterCc = createHarness();
    await afterCc.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual centro de custo teve maior saída em agosto de 2026?',
      now: NOW,
    });
    afterCc.messages.push(
      message(
        'cc-compare',
        'CONSULTANT',
        'Clínica X teve R$ 84.568,61 em saídas realizadas em julho de 2026 e R$ 63.032,88 em agosto de 2026, uma variação de -R$ 21.535,73 (-25,47%).',
      ),
    );
    const monthly = await afterCc.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Compare julho e agosto de 2026.',
      now: NOW,
    });
    expect(monthly.factualAnswer?.classification).toBe('FACTUAL_CLOSED');
    expect(monthly.consultantMessage.content).toContain('R$ 88.130,31');
    expect(monthly.consultantMessage.content).not.toContain('84.568,61');
    expect(monthly.consultantMessage.content).not.toContain('63.032,88');
    expect(monthly.consultantMessage.content).not.toContain('25,47');
    expect(monthly.run).toBeNull();
    expect(monthly.factualAnswer?.providerCalled).toBe(false);
    info.mockRestore();
  });

  it('D1 interpretativo chama provider com o par oficial pré-carregado', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { send, openai, runs, toolCalls } = createHarness();
    const interpretive = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Compare julho e agosto de 2026 e me diga o que mais chama atenção.',
      now: NOW,
    });
    expect(interpretive.factualAnswer).toBeNull();
    expect(interpretive.run).not.toBeNull();
    expect(runs).toHaveLength(1);
    expect(openai.generateCalls).toHaveLength(1);
    expect(toolCalls).toContain(COMPARE_CASH_MONTHS_TOOL_NAME);
    const recommend = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Com base em julho e agosto de 2026, o que você recomenda?',
      now: NOW,
    });
    expect(recommend.factualAnswer).toBeNull();
    expect(recommend.run).not.toBeNull();
    expect(isAdvisorInterpretiveQuestion('Por que agosto cresceu em relação a julho?')).toBe(true);
    info.mockRestore();
  });
});
