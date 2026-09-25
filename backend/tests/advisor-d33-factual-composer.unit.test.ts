import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { CashRealizedDetails } from '../src/modules/analytics/domain/cash-realized-details.js';
import {
  ADVISOR_FACTUAL_COMPOSER_VERSION,
  AI_PROVIDER_MODEL_CATALOG,
  aggregateAdvisorNominalDimension,
  classifyAdvisorFactualResponse,
  compareAdvisorNominalAggregations,
  composeAdvisorFactualAnswer,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
  formatAdvisorFactualBrl,
  formatAdvisorFactualPercent,
  isAdvisorInterpretiveQuestion,
  isAdvisorNominalIdentityFollowUp,
  lookupAdvisorNominalEntity,
  rankAdvisorNominalDimension,
  resolveAdvisorConversationalNominal,
  serializeAdvisorNominalComparison,
  serializeAdvisorNominalLookup,
  serializeAdvisorNominalRanking,
  type BuildAdvisorContextInput,
  type SendAdvisorMessageDependencies,
} from '../src/modules/advisor/index.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
  UpdateAiRunInput,
} from '../src/modules/advisor/domain/types.js';
import { RateLimitedError } from '../src/shared/errors/application-error.js';
import type { ConsultantRateLimiter } from '../src/modules/advisor/domain/consultant-rate-limit.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function details(items: CashRealizedDetails['items']): CashRealizedDetails {
  return {
    tenantId: 'tenant-a',
    monthKey: '2026-08',
    from: new Date('2026-08-01T00:00:00.000Z'),
    to: new Date('2026-08-31T00:00:00.000Z'),
    today: new Date('2026-09-24T00:00:00.000Z'),
    direction: 'inflows',
    categoryKey: 'cat-conv',
    categoryKind: 'category',
    available: true,
    total: items.reduce((sum, item) => sum.plus(item.attributedAmount), dec('0')),
    itemCount: items.length,
    limit: items.length,
    offset: 0,
    items,
  };
}

function item(input: {
  readonly id: string;
  readonly amount: string;
  readonly description?: string | null;
  readonly partyId?: string | null;
  readonly partyName?: string | null;
}): CashRealizedDetails['items'][number] {
  return {
    settlementExternalId: input.id,
    installmentExternalId: input.id,
    installmentKind: 'RECEIVABLE',
    occurredOn: new Date('2026-08-10T00:00:00.000Z'),
    netAmount: dec(input.amount),
    attributedAmount: dec(input.amount),
    description: input.description ?? null,
    partyId: input.partyId ?? null,
    partyName: input.partyName ?? null,
    categoryNames: ['Atendimentos Convênio'],
    categoryExternalIds: ['cat-conv'],
    categoryKey: 'cat-conv',
    categoryKind: 'category',
    categoryName: 'Atendimentos Convênio',
  };
}

function agoAggregation() {
  return aggregateAdvisorNominalDimension({
    monthKey: '2026-08',
    categoryKey: 'cat-conv',
    categoryName: 'Atendimentos Convênio',
    details: details([
      item({ id: 'vale-1', amount: '77483.88', description: 'VALE' }),
      item({ id: 'brad-1', amount: '67828', partyId: 'p-brad', partyName: 'Bradesco Seguros' }),
      item({
        id: 'uni-1',
        amount: '31578.84',
        partyId: 'p-uni',
        partyName: 'Unimed',
        description: 'Unimed Fesp',
      }),
      item({ id: 'cap-1', amount: '9009.6', description: 'Capital Prev' }),
      item({ id: 'uni-amb', amount: '21285.18', description: 'Unimed' }),
    ]),
  });
}

function agoRankingFacts(): Record<string, unknown> {
  const aggregation = agoAggregation();
  return serializeAdvisorNominalRanking({
    status: 'OK',
    aggregation,
    ranking: rankAdvisorNominalDimension(aggregation, 5),
  });
}

function agoLookupFacts(entityQuery: string): Record<string, unknown> {
  const aggregation = agoAggregation();
  const looked = lookupAdvisorNominalEntity(aggregation, entityQuery);
  return serializeAdvisorNominalLookup({
    status: looked.status,
    aggregation,
    entityQuery,
    match: looked.matches[0] ?? null,
  });
}

function settings(tenantId = 'tenant-a'): AiTenantSettingsRecord {
  const now = new Date('2026-09-24T12:00:00.000Z');
  return {
    id: `set-${tenantId}`,
    tenantId,
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
  const now = new Date('2026-09-24T12:00:00.000Z');
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
    createdAt: new Date('2026-09-24T12:00:00.000Z'),
  };
}

function builtContext(): AdvisorBuiltContext {
  return {
    tenantId: 'tenant-a',
    monthKey: '2026-08',
    blocks: [
      { type: 'PLATFORM_INSTRUCTIONS', content: 'plataforma', trustLevel: 'PLATFORM' },
      { type: 'USER_QUESTION', content: 'q', trustLevel: 'UNTRUSTED' },
    ],
  };
}

function createHarness(options?: {
  readonly extraConversations?: readonly AiConversationRecord[];
  readonly extraSettings?: readonly AiTenantSettingsRecord[];
  readonly analyticalTools?: SendAdvisorMessageDependencies['analyticalTools'];
  readonly context?: { build: (input: BuildAdvisorContextInput) => Promise<AdvisorBuiltContext> };
  readonly rateLimiter?: ConsultantRateLimiter;
  readonly info?: ReturnType<typeof vi.spyOn>;
}) {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'não tenho acesso aos dados' });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let messageSeq = 0;
  let runSeq = 0;
  const conversationRows = [conversation(), ...(options?.extraConversations ?? [])];
  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        const extra = options?.extraSettings?.find((row) => row.tenantId === tenantId);
        if (extra !== undefined) {
          return extra;
        }
        return tenantId === 'tenant-a' ? settings() : null;
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
      async updateConversationTitle() {
        return conversationRows[0] ?? null;
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
        const current = runs[index]!;
        const next = {
          ...current,
          status: input.status,
          messageId: input.messageId === undefined ? current.messageId : input.messageId,
          finishedAt: input.finishedAt === undefined ? current.finishedAt : input.finishedAt,
        };
        runs[index] = next;
        return next;
      },
    },
    context: options?.context ?? { build: vi.fn(async () => builtContext()) },
    providers: createIaProviderRegistry({
      openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: options?.rateLimiter ?? createAllowAllConsultantRateLimiter(),
    analyticalTools: options?.analyticalTools,
  });
  return { send, messages, openai, runs };
}

function agoTools() {
  const ranking = agoRankingFacts();
  const execute = vi.fn(async (input: { call: { id: string; name: string; arguments: Record<string, unknown> } }) => {
    if (input.call.name === 'cash_nominal_dimension_ranking') {
      return {
        id: input.call.id,
        name: input.call.name,
        ok: true,
        monthKey: '2026-08',
        content: JSON.stringify(ranking),
      };
    }
    if (input.call.name === 'cash_nominal_dimension_lookup') {
      const entityQuery = String(input.call.arguments.entityQuery ?? 'VALE');
      return {
        id: input.call.id,
        name: input.call.name,
        ok: true,
        monthKey: '2026-08',
        content: JSON.stringify(agoLookupFacts(entityQuery)),
      };
    }
    if (input.call.name === 'compare_cash_nominal_dimension') {
      const jul = aggregateAdvisorNominalDimension({
        monthKey: '2026-07',
        categoryKey: 'cat-conv',
        categoryName: 'Atendimentos Convênio',
        details: details([item({ id: 'vale-jul', amount: '44604.02', description: 'VALE' })]),
      });
      const ago = agoAggregation();
      const compared = compareAdvisorNominalAggregations({
        periodA: jul,
        periodB: ago,
        entityQuery: 'vale',
      });
      return {
        id: input.call.id,
        name: input.call.name,
        ok: true,
        monthKey: '2026-08',
        content: JSON.stringify(
          serializeAdvisorNominalComparison({
            status: 'OK',
            category: { key: 'cat-conv', name: 'Atendimentos Convênio' },
            monthKey: '2026-08',
            comparisonMonthKey: '2026-07',
            periodA: jul,
            periodB: ago,
            items: compared.items,
            requestedLimit: 5,
            effectiveLimit: 5,
          }),
        ),
      };
    }
    throw new Error(`tool inesperada: ${input.call.name}`);
  });
  return {
    tools: [
      { name: 'cash_nominal_dimension_ranking', description: 'rk', inputSchema: {} },
      { name: 'cash_nominal_dimension_lookup', description: 'lk', inputSchema: {} },
      { name: 'compare_cash_nominal_dimension', description: 'cmp', inputSchema: {} },
    ],
    execute,
    ranking,
  };
}

describe('F13.8.1D3.3 classificação', () => {
  it('T4 identity follow-up é detectado sem depender de "desse convênio"', () => {
    expect(
      isAdvisorNominalIdentityFollowUp(
        'Então posso somar aqueles outros R$ 21.285,18 na Unimed e considerar tudo como Unimed? Por quê?',
      ),
    ).toBe(true);
    expect(isAdvisorInterpretiveQuestion('O que você acha dessa concentração e que estratégia recomenda?')).toBe(
      true,
    );
    expect(isAdvisorInterpretiveQuestion('Quanto recebi da Vale e como posso aumentar esse valor?')).toBe(true);
    const resolved = resolveAdvisorConversationalNominal({
      content:
        'Então posso somar aqueles outros R$ 21.285,18 na Unimed e considerar tudo como Unimed? Por quê?',
      priorUserContents: ['Qual convênio individual mais faturou em agosto de 2026?'],
    });
    expect(resolved.anaphora).toBe('IDENTITY_FOLLOW_UP');
    expect(resolved.intent).toMatchObject({ toolName: 'cash_nominal_dimension_ranking' });
  });

  it('pergunta mista e interpretativa não fecham o composer', () => {
    const ranking = agoRankingFacts();
    expect(
      classifyAdvisorFactualResponse({
        content: 'O que você acha dessa concentração e que estratégia recomenda?',
        anaphora: 'NONE',
        toolName: 'cash_nominal_dimension_ranking',
        toolOk: true,
        facts: ranking,
      }).kind,
    ).toBe('INTERPRETIVE');
    expect(
      classifyAdvisorFactualResponse({
        content: 'Quanto recebi da Vale e como posso aumentar esse valor?',
        anaphora: 'NONE',
        toolName: 'cash_nominal_dimension_lookup',
        toolOk: true,
        facts: agoLookupFacts('VALE'),
      }).kind,
    ).toBe('INTERPRETIVE');
  });

  it('sem fatos fechados o composer não inventa', () => {
    const composed = composeAdvisorFactualAnswer({
      content: 'Qual convênio individual mais faturou em agosto de 2026?',
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify({ status: 'UNAVAILABLE' }),
    });
    expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
    expect(composed.classification.intentKind).toBe('FACTUAL_LIMITATION');
    expect(composed.answer).toContain('Não há fatos nominais suficientes');
  });
});

describe('F13.8.1D3.3 formatação', () => {
  it('formata BRL e percentual sem recalcular domínio', () => {
    expect(formatAdvisorFactualBrl('77483.88')).toBe('R$ 77.483,88');
    expect(formatAdvisorFactualBrl('207185.5')).toBe('R$ 207.185,50');
    expect(formatAdvisorFactualPercent('37.4')).toBe('37,40%');
    expect(formatAdvisorFactualPercent('89.73')).toBe('89,73%');
  });
});

describe('F13.8.1D3.3 T1 ranking', () => {
  it('compõe o vencedor e não chama o provider', async () => {
    const tools = agoTools();
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { send, messages, openai, runs } = createHarness({ analyticalTools: tools });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual convênio individual mais faturou em agosto de 2026?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(result.factualAnswer?.classification).toBe('FACTUAL_CLOSED');
    expect(result.factualAnswer?.providerCalled).toBe(false);
    expect(result.run).toBeNull();
    expect(openai.generateCalls).toHaveLength(0);
    expect(runs).toHaveLength(0);
    expect(result.consultantMessage.content).toContain('VALE');
    expect(result.consultantMessage.content).toContain('R$ 77.483,88');
    expect(result.consultantMessage.content).toContain('37,40%');
    expect(result.consultantMessage.content).toContain('R$ 207.185,50');
    expect(result.consultantMessage.content).toContain('89,73%');
    expect(result.consultantMessage.content).toContain('R$ 21.285,18');
    expect(result.consultantMessage.content).not.toMatch(/não tenho acesso/i);
    expect(result.consultantMessage.content).not.toMatch(/5 convênios/);
    expect(result.consultantMessage.content).not.toContain('41,68%');
    expect(messages.filter((item) => item.senderType === 'CONSULTANT')).toHaveLength(1);
    expect(info.mock.calls.some((call) => String(call[0]).includes('advisor_factual_answer_composed'))).toBe(
      true,
    );
    expect(tools.execute).toHaveBeenCalledTimes(1);
    info.mockRestore();
  });
});

describe('F13.8.1D3.3 T2 lookup anafórico', () => {
  it('resolve VALE, usa população e não chama o provider', async () => {
    const tools = agoTools();
    const { send, messages, openai } = createHarness({ analyticalTools: tools });
    messages.push(message('seed-rank', 'USER', 'Qual convênio individual mais faturou em agosto de 2026?'));
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question:
        'Quanto eu recebi desse convênio no mês e quanto isso representa do total de Atendimentos Convênio?',
      monthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(result.factualAnswer?.intentKind).toBe('LOOKUP');
    expect(result.run).toBeNull();
    expect(openai.generateCalls).toHaveLength(0);
    expect(result.consultantMessage.content).toContain('VALE');
    expect(result.consultantMessage.content).toContain('R$ 77.483,88');
    expect(result.consultantMessage.content).toContain('37,40%');
    expect(result.consultantMessage.content).toContain('R$ 207.185,50');
    expect(result.consultantMessage.content).not.toContain('41,68%');
    expect(tools.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({
          name: 'cash_nominal_dimension_lookup',
          arguments: expect.objectContaining({ entityQuery: 'VALE' }),
        }),
      }),
    );
  });
});

describe('F13.8.1D3.3 T3 topN share', () => {
  it('não transforma requestedLimit=5 em 5 convênios', async () => {
    const tools = agoTools();
    const { send, openai } = createHarness({ analyticalTools: tools });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question:
        'Quanto os 5 maiores convênios representam do total de Atendimentos Convênio em agosto?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(result.factualAnswer?.intentKind).toBe('RANKING_SHARE');
    expect(result.run).toBeNull();
    expect(openai.generateCalls).toHaveLength(0);
    expect(result.consultantMessage.content).toContain('4 convênios nominalmente identificados');
    expect(result.consultantMessage.content).toContain('R$ 185.900,32');
    expect(result.consultantMessage.content).toContain('89,73%');
    expect(result.consultantMessage.content).toContain('R$ 21.285,18');
    expect(result.consultantMessage.content).not.toMatch(/5 convênios/);
    expect(result.consultantMessage.content).not.toMatch(/os 5 maiores/);
  });
});

describe('F13.8.1D3.3 T4 identidade ambígua', () => {
  it('recusa consolidar ambíguo sem identidade estruturada compartilhada', async () => {
    const tools = agoTools();
    const { send, messages, openai } = createHarness({ analyticalTools: tools });
    messages.push(message('seed-rank', 'USER', 'Qual convênio individual mais faturou em agosto de 2026?'));
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question:
        'Então posso somar aqueles outros R$ 21.285,18 na Unimed e considerar tudo como Unimed? Por quê?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(result.factualAnswer?.intentKind).toBe('IDENTITY_AMBIGUITY');
    expect(result.run).toBeNull();
    expect(openai.generateCalls).toHaveLength(0);
    expect(result.consultantMessage.content).toMatch(/não é seguro/i);
    expect(result.consultantMessage.content).toContain('R$ 21.285,18');
    expect(result.consultantMessage.content).toContain('R$ 31.578,84');
    expect(result.consultantMessage.content).toContain('identificador estruturado compartilhado');
    expect(result.consultantMessage.content).not.toMatch(/contrato/i);
    expect(result.consultantMessage.content).not.toMatch(/planos?/i);
    expect(result.consultantMessage.content).not.toMatch(/tipo(?:s)? de atendimento/i);
    expect(result.consultantMessage.content).not.toMatch(/tratamento contábil/i);
    expect(tools.execute).toHaveBeenCalledTimes(1);
  });
});

describe('F13.8.1D3.3 interpretativo e misto', () => {
  it('pergunta interpretativa continua no provider com fatos oficiais', async () => {
    const tools = agoTools();
    const { send, messages, openai } = createHarness({ analyticalTools: tools });
    messages.push(message('seed-rank', 'USER', 'Qual convênio individual mais faturou em agosto de 2026?'));
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'O que você acha dessa concentração e que estratégia recomenda?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(result.factualAnswer).toBeNull();
    expect(result.run).not.toBeNull();
    expect(openai.generateCalls.length).toBeGreaterThan(0);
    expect(tools.execute).toHaveBeenCalledWith(
      expect.objectContaining({
        call: expect.objectContaining({ name: 'cash_nominal_dimension_ranking' }),
      }),
    );
  });

  it('pergunta mista é INTERPRETIVE e chama o provider', async () => {
    const tools = agoTools();
    const { send, openai } = createHarness({ analyticalTools: tools });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto recebi da Vale e como posso aumentar esse valor?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(result.factualAnswer).toBeNull();
    expect(result.run).not.toBeNull();
    expect(openai.generateCalls.length).toBeGreaterThan(0);
    expect(result.consultantMessage.content).toContain('não tenho acesso');
  });
});

describe('F13.8.1D3.3 comparison e isolamento', () => {
  it('comparison objetiva fecha sem provider e preserva denominador zero', () => {
    const jul = aggregateAdvisorNominalDimension({
      monthKey: '2026-07',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([item({ id: 'empty', amount: '0', description: 'VALE' })]),
    });
    const ago = aggregateAdvisorNominalDimension({
      monthKey: '2026-08',
      categoryKey: 'cat-conv',
      categoryName: 'Atendimentos Convênio',
      details: details([item({ id: 'vale', amount: '77483.88', description: 'VALE' })]),
    });
    const compared = compareAdvisorNominalAggregations({
      periodA: jul,
      periodB: ago,
      entityQuery: 'vale',
    });
    const composed = composeAdvisorFactualAnswer({
      content: 'Quanto a Vale cresceu de julho para agosto?',
      anaphora: 'NONE',
      toolName: 'compare_cash_nominal_dimension',
      toolOk: true,
      toolContent: JSON.stringify(
        serializeAdvisorNominalComparison({
          status: 'OK',
          category: { key: 'cat-conv', name: 'Atendimentos Convênio' },
          monthKey: '2026-08',
          comparisonMonthKey: '2026-07',
          periodA: jul,
          periodB: ago,
          items: compared.items,
          requestedLimit: 5,
          effectiveLimit: 5,
        }),
      ),
    });
    expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
    expect(composed.answer).toContain('R$ 77.483,88');
    expect(composed.answer).toMatch(/denominador do período anterior é zero/);
  });

  it('não herda ranking entre conversas', async () => {
    const tools = agoTools();
    const { send, messages, openai } = createHarness({
      extraConversations: [conversation('tenant-a', 'user-a', 'conv-b')],
      analyticalTools: tools,
    });
    messages.push(
      message('seed-a', 'USER', 'Qual convênio individual mais faturou em agosto de 2026?', 'tenant-a', 'conv-a'),
    );
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-b',
      question:
        'Então posso somar aqueles outros R$ 21.285,18 na Unimed e considerar tudo como Unimed? Por quê?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(openai.generateCalls.length).toBeGreaterThan(0);
    expect(result.factualAnswer).toBeNull();
  });

  it('não herda ranking entre tenants', async () => {
    const tools = agoTools();
    const { send, messages, openai } = createHarness({
      extraConversations: [conversation('tenant-b', 'user-b', 'conv-b')],
      extraSettings: [settings('tenant-b')],
      analyticalTools: tools,
    });
    messages.push(message('seed-a', 'USER', 'Qual convênio individual mais faturou em agosto de 2026?'));
    const result = await send.execute({
      tenantId: 'tenant-b',
      userId: 'user-b',
      conversationId: 'conv-b',
      question:
        'Então posso somar aqueles outros R$ 21.285,18 na Unimed e considerar tudo como Unimed? Por quê?',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(openai.generateCalls.length).toBeGreaterThan(0);
    expect(result.factualAnswer).toBeNull();
  });

  it('rate limit continua bloqueando antes do composer', async () => {
    const tools = agoTools();
    const { send, openai, runs } = createHarness({
      analyticalTools: tools,
      rateLimiter: {
        async consume() {
          return { ok: false, kind: 'limit', retryAfterSeconds: 30 };
        },
      },
    });
    await expect(
      send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Qual convênio individual mais faturou em agosto de 2026?',
        now: new Date('2026-09-24T18:00:00.000Z'),
      }),
    ).rejects.toBeInstanceOf(RateLimitedError);
    expect(openai.generateCalls).toHaveLength(0);
    expect(tools.execute).not.toHaveBeenCalled();
    expect(runs.some((run) => run.status === 'LIMIT_BLOCKED')).toBe(true);
  });
});

describe('F13.8.1D3.3 composer version', () => {
  it('expõe versão explícita sem fingir provider', () => {
    expect(ADVISOR_FACTUAL_COMPOSER_VERSION).toBe('d4.3-1');
    const composed = composeAdvisorFactualAnswer({
      content: 'Qual convênio individual mais faturou em agosto de 2026?',
      anaphora: 'NONE',
      toolName: 'cash_nominal_dimension_ranking',
      toolOk: true,
      toolContent: JSON.stringify(agoRankingFacts()),
    });
    expect(composed.meta?.composerVersion).toBe('d4.3-1');
    expect(composed.meta?.providerCalled).toBe(false);
  });
});
