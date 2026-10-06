import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { AI_PROVIDER_MODEL_CATALOG } from '../src/modules/advisor/domain/ai-provider-models.js';
import { resolveAdvisorBillingIntent } from '../src/modules/advisor/domain/resolve-advisor-billing-intent.js';
import { resolveUniversalAnalyticalIntent } from '../src/modules/advisor/domain/resolve-universal-analytical-intent.js';
import { runAdvisorBillingAnswer } from '../src/modules/advisor/domain/run-advisor-billing-answer.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import { AdvisorExecutionError } from '../src/modules/advisor/services/send-advisor-message.js';
import { createAllowAllConsultantRateLimiter } from '../src/modules/advisor/services/consultant-rate-limiter.js';
import { createSendAdvisorMessage } from '../src/modules/advisor/services/send-advisor-message.js';
import type { RecordAnalyticalResultInput } from '../src/modules/advisor/repositories/advisor-analytical-result.repository.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
} from '../src/modules/advisor/domain/types.js';

const NOW = new Date('2026-10-02T15:00:00.000Z');
/** Pergunta que ainda cai no provider+tools (fora do assembler composável da Fase 1). */
const PROVIDER_TOOL_QUESTION = 'qual o maior gasto?';
const FELIPE_QUESTION = 'qual o maior gasto em laranjeiras e em jacaraipe?';
const UNAVAILABLE_PROSE = 'Não consegui obter esse detalhamento agora.';

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(monthKey: string, inflows: string, receivables: string): MonthlyCashFlow {
  return {
    monthKey,
    realized: { inflows: money(inflows), outflows: money('0'), result: money(inflows) },
    expected: { receivables: money(receivables), payables: null, result: null },
    realizedByCategory: { inflows: null, outflows: null },
  } as MonthlyCashFlow;
}

function cashFlow(rows: Record<string, MonthlyCashFlow>) {
  return {
    async getMonthlyCashFlow(input: { tenantId: string; monthKey?: string }) {
      if (input.tenantId !== 'tenant-a') {
        return flow(input.monthKey ?? '2026-10', '0', '0');
      }
      return rows[input.monthKey ?? '2026-10'] ?? flow(input.monthKey ?? '2026-10', '0', '0');
    },
  };
}

function createHarness(options?: {
  readonly text?: string;
  readonly behavior?: 'success' | 'timeout' | 'error';
  readonly script?: Parameters<typeof createFakeIaProvider>[0]['script'];
  readonly analyticalTools?: {
    tools: ReadonlyArray<{ name: string; description: string; inputSchema: Record<string, unknown> }>;
    execute: (input: {
      call: { id: string; name: string; arguments: Record<string, unknown> };
    }) => Promise<{
      id: string;
      name: string;
      ok: boolean;
      content: string;
      resultCardinality?: number;
    }>;
  };
  readonly monthlyPlanning?: boolean;
  readonly rows?: Record<string, MonthlyCashFlow>;
}) {
  const openai = createFakeIaProvider({
    id: 'OPENAI',
    text: options?.text ?? UNAVAILABLE_PROSE,
    behavior: options?.behavior,
    script: options?.script,
    usage: { inputTokens: 11, outputTokens: 7 },
  });
  const recorded: Array<RecordAnalyticalResultInput & { tenantId: string }> = [];
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let messageSeq = 0;
  let runSeq = 0;
  const now = new Date('2026-09-24T12:00:00.000Z');
  const conversationRow: AiConversationRecord = {
    id: 'conv-a',
    tenantId: 'tenant-a',
    userId: 'user-a',
    status: 'OPEN',
    title: null,
    analyticalContext: null,
    startedAt: now,
    lastMessageAt: now,
    createdAt: now,
    updatedAt: now,
  };
  const settingsRow: AiTenantSettingsRecord = {
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
  const loaded = cashFlow(
    options?.rows ?? {
      '2026-10': flow('2026-10', '1650', '199476.98'),
    },
  );
  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        return tenantId === 'tenant-a' ? settingsRow : null;
      },
    },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        if (
          tenantId === conversationRow.tenantId &&
          userId === conversationRow.userId &&
          conversationId === conversationRow.id
        ) {
          return conversationRow;
        }
        return null;
      },
      async createMessage(tenantId, conversationId, input) {
        const created = {
          id: `msg-${++messageSeq}`,
          conversationId,
          tenantId,
          senderType: input.senderType,
          content: input.content,
          messageType: 'TEXT' as const,
          createdAt: now,
        };
        messages.push(created);
        return created;
      },
      async updateConversationTitle() {
        return conversationRow;
      },
      async listMessages(tenantId, conversationId) {
        return messages.filter(
          (item) => item.tenantId === tenantId && item.conversationId === conversationId,
        );
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
          createdAt: now,
          finishedAt: input.finishedAt ?? null,
        };
        runs.push(created);
        return created;
      },
      async updateRun(tenantId, runId, input) {
        const current = runs.find((item) => item.tenantId === tenantId && item.id === runId);
        if (current === undefined) {
          throw new Error('run ausente');
        }
        const updated = { ...current, ...input };
        runs.splice(runs.indexOf(current), 1, updated);
        return updated;
      },
    },
    analyticalResults: {
      async record(tenantId, input) {
        recorded.push({ tenantId, ...input });
        return { id: 'trail-1' };
      },
    },
    context: {
      async build(): Promise<AdvisorBuiltContext> {
        return { tenantId: 'tenant-a', monthKey: '2026-10', blocks: [] };
      },
    },
    providers: createIaProviderRegistry({
      openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    ...(options?.analyticalTools ? { analyticalTools: options.analyticalTools } : {}),
    ...(options?.monthlyPlanning
      ? {
          monthlyPlanning: {
            cashFlow: loaded,
            revenueGoals: {} as never,
            expenseCeilings: {} as never,
          },
        }
      : {}),
  });
  return { send, openai, recorded, messages, runs, loaded };
}

async function ask(
  harness: ReturnType<typeof createHarness>,
  question: string,
) {
  return harness.send.execute({
    tenantId: 'tenant-a',
    userId: 'user-a',
    conversationId: 'conv-a',
    question,
    now: NOW,
  });
}

function toolBox(
  content: string,
): NonNullable<Parameters<typeof createHarness>[0]>['analyticalTools'] {
  return {
    tools: [
      {
        name: 'cash_cost_center_lookup',
        description: 'consulta centro',
        inputSchema: { type: 'object', properties: {} },
      },
    ],
    async execute(input) {
      return {
        id: input.call.id,
        name: input.call.name,
        ok: !content.includes('"UNAVAILABLE"'),
        content,
        resultCardinality: 1,
      };
    },
  };
}

describe('trilha de resultado no envio do consultor', () => {
  it('pergunta sem capability fica SUCCEEDED e UNSUPPORTED', async () => {
    expect(resolveUniversalAnalyticalIntent({ content: PROVIDER_TOOL_QUESTION, now: NOW }).kind).toBe(
      'UNRESOLVED',
    );
    expect(resolveAdvisorBillingIntent(PROVIDER_TOOL_QUESTION)).toBeNull();
    const harness = createHarness({ text: UNAVAILABLE_PROSE, monthlyPlanning: true });
    const result = await ask(harness, PROVIDER_TOOL_QUESTION);
    expect(result.run?.status).toBe('SUCCEEDED');
    expect(result.factualAnswer).toBeNull();
    expect(result.analyticalOutcome).toBe('UNSUPPORTED');
    expect(result.consultantMessage.content).toBe(UNAVAILABLE_PROSE);
    expect(harness.openai.generateCalls.length).toBeGreaterThan(0);
    expect(harness.recorded[0]).toMatchObject({
      tenantId: 'tenant-a',
      outcome: 'UNSUPPORTED',
      answerSource: 'PROVIDER',
      toolCallCount: 0,
      userMessageId: result.userMessage.id,
      consultantMessageId: result.consultantMessage.id,
      runId: result.run?.id,
    });
    expect(JSON.stringify(harness.recorded[0])).not.toContain(UNAVAILABLE_PROSE);
  });

  it('maior gasto em dois centros na mesma frase clarifica sem provider', async () => {
    expect(resolveUniversalAnalyticalIntent({ content: FELIPE_QUESTION, now: NOW }).kind).toBe(
      'UNRESOLVED',
    );
    const harness = createHarness({ text: UNAVAILABLE_PROSE, monthlyPlanning: true });
    const result = await ask(harness, FELIPE_QUESTION);
    expect(result.run).toBeNull();
    expect(result.factualAnswer?.providerCalled).toBe(false);
    expect(result.consultantMessage.content).toMatch(/centro de custo/i);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('faturamento determinístico continua igual, sem provider, ANSWERED', async () => {
    const question = 'Como está meu faturamento este mês?';
    const harness = createHarness({ monthlyPlanning: true });
    const direct = await runAdvisorBillingAnswer({
      content: question,
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      now: NOW,
      cashFlow: harness.loaded,
    });
    const result = await ask(harness, question);
    expect(direct?.answer).toContain('Faturamento em outubro de 2026: R$ 201.126,98.');
    expect(result.consultantMessage.content).toBe(direct?.answer);
    expect(result.run).toBeNull();
    expect(result.factualAnswer?.providerCalled).toBe(false);
    expect(result.analyticalOutcome).toBe('ANSWERED');
    expect(harness.recorded[0]?.answerSource).toBe('BILLING');
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('média histórica preserva o fato e registra ANSWERED', async () => {
    const question = 'qual minha média de faturamento pensando nos últimos 3 meses?';
    const rows = {
      '2026-08': flow('2026-08', '100', '0'),
      '2026-09': flow('2026-09', '200', '0'),
      '2026-10': flow('2026-10', '300', '0'),
    };
    const harness = createHarness({ monthlyPlanning: true, rows });
    const direct = await runAdvisorBillingAnswer({
      content: question,
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      now: NOW,
      cashFlow: harness.loaded,
    });
    const result = await ask(harness, question);
    expect(direct?.answer).toContain('Média dos 3 meses: R$ 200,00.');
    expect(result.consultantMessage.content).toBe(direct?.answer);
    expect(result.analyticalOutcome).toBe('ANSWERED');
    expect(harness.recorded[0]?.answerSource).toBe('BILLING_SERIES');
    expect(result.run).toBeNull();
  });

  it('tool bem-sucedida registra SUCCESS mesmo se a prosa fala em indisponibilidade', async () => {
    const harness = createHarness({
      script: [
        {
          toolCalls: [
            { id: 'call-1', name: 'cash_cost_center_lookup', arguments: { costCenterQuery: 'centro' } },
          ],
        },
        { text: UNAVAILABLE_PROSE },
      ],
      analyticalTools: toolBox(JSON.stringify({ status: 'OK', returnedCount: 2, total: '1500.00' })),
    });
    const result = await ask(harness, PROVIDER_TOOL_QUESTION);
    expect(result.run?.status).toBe('SUCCEEDED');
    expect(result.consultantMessage.content).toBe(UNAVAILABLE_PROSE);
    expect(result.analyticalOutcome).toBe('ANSWERED');
    expect(harness.recorded[0]?.traces[0]).toMatchObject({
      toolName: 'cash_cost_center_lookup',
      status: 'SUCCESS',
      round: 1,
    });
    expect(JSON.stringify(harness.recorded[0]?.traces)).not.toContain('1500.00');
  });

  it('timeout de tool registra TOOL_TIMEOUT e outcome TOOL_ERROR', async () => {
    const harness = createHarness({
      script: [
        {
          toolCalls: [{ id: 'call-1', name: 'cash_cost_center_lookup', arguments: {} }],
        },
        { text: 'Segue o que consegui.' },
      ],
      analyticalTools: toolBox(
        JSON.stringify({
          status: 'UNAVAILABLE',
          code: 'ANALYTICAL_TOOL_FAILED',
          message: 'A tool analítica excedeu o tempo limite.',
        }),
      ),
    });
    const result = await ask(harness, PROVIDER_TOOL_QUESTION);
    expect(result.run?.status).toBe('SUCCEEDED');
    expect(result.analyticalOutcome).toBe('TOOL_ERROR');
    expect(harness.recorded[0]?.traces[0]?.reason).toBe('TOOL_TIMEOUT');
    expect(harness.recorded[0]?.traces[0]?.status).toBe('UNAVAILABLE');
  });

  it('erro do provedor registra PROVIDER_ERROR e preserva o status técnico', async () => {
    const harness = createHarness({ behavior: 'error' });
    await expect(ask(harness, PROVIDER_TOOL_QUESTION)).rejects.toBeInstanceOf(AdvisorExecutionError);
    expect(harness.runs[0]?.status).toBe('FAILED');
    expect(harness.recorded[0]).toMatchObject({
      outcome: 'PROVIDER_ERROR',
      answerSource: 'PROVIDER',
      consultantMessageId: null,
      runId: 'run-1',
    });
  });

  it('ausência real de dados registra NO_DATA', async () => {
    const harness = createHarness({
      script: [
        {
          toolCalls: [{ id: 'call-1', name: 'cash_cost_center_lookup', arguments: {} }],
        },
        { text: 'Não há lançamentos nesse recorte.' },
      ],
      analyticalTools: toolBox(JSON.stringify({ status: 'EMPTY_RESULT', returnedCount: 0 })),
    });
    const result = await ask(harness, PROVIDER_TOOL_QUESTION);
    expect(result.run?.status).toBe('SUCCEEDED');
    expect(result.analyticalOutcome).toBe('NO_DATA');
    expect(harness.recorded[0]?.traces[0]).toMatchObject({ status: 'EMPTY', reason: 'NO_DATA' });
  });
});
