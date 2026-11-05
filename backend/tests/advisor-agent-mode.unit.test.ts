/**
 * ADR-051 — modo agente: histórico real, tools oficiais, tenant do runtime.
 */
import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createOpenAiProvider } from '../src/infrastructure/ai/openai-provider.js';
import { createAnthropicProvider } from '../src/infrastructure/ai/anthropic-provider.js';
import type { GenerationInput, GenerationOutput, IaProvider } from '../src/infrastructure/ai/types.js';
import { createAdvisorAgentToolExecutor } from '../src/modules/advisor/domain/advisor-agent-tools.js';
import { createAdvisorDashboardToolExecutor } from '../src/modules/advisor/domain/advisor-dashboard-tools.js';
import { AI_PROVIDER_MODEL_CATALOG } from '../src/modules/advisor/domain/ai-provider-models.js';
import type {
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
} from '../src/modules/advisor/domain/types.js';
import { createAllowAllConsultantRateLimiter } from '../src/modules/advisor/services/consultant-rate-limiter.js';
import {
  ADVISOR_AGENT_EMPTY_ANSWER,
  ADVISOR_AGENT_MAX_TOOL_ROUNDS,
  runAdvisorAgentLoop,
} from '../src/modules/advisor/services/run-advisor-agent.js';
import { createSendAdvisorMessage } from '../src/modules/advisor/services/send-advisor-message.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';

const NOW = new Date('2026-11-04T15:00:00.000Z');
const d = (value: string) => new Prisma.Decimal(value);

function flow(monthKey: string, inflows: string, receivables: string): MonthlyCashFlow {
  return {
    tenantId: 'tenant-a',
    monthKey,
    costCenterCashSplit: true,
    realized: { inflows: d(inflows), outflows: d('100'), result: d(inflows).minus('100') },
    expected: { receivables: d(receivables), payables: d('50'), result: d(receivables).minus('50') },
    overdue: {
      receivables: d('0'),
      payables: d('0'),
      ofMonth: { receivables: d('0'), payables: d('0') },
    },
    realizedByCategory: { inflows: null, outflows: null },
  } as unknown as MonthlyCashFlow;
}

const FLOWS: Record<string, MonthlyCashFlow> = {
  '2026-08': flow('2026-08', '900000', '100000'),
  '2026-11': flow('2026-11', '300000', '200000'),
};

function agentTools(seenTenants: string[]) {
  return createAdvisorAgentToolExecutor({
    deps: {
      cashFlow: {
        async getMonthlyCashFlow({ tenantId, monthKey }) {
          seenTenants.push(tenantId);
          return FLOWS[monthKey ?? ''] ?? flow(monthKey ?? '2026-01', '0', '0');
        },
      },
      analytics: {
        async getFinancialStockSnapshot() {
          throw new Error('não usado');
        },
      },
      costCenters: {
        async listByTenant() {
          return [{ id: 'cc-1', name: 'Jacaraípe', code: null, active: true }];
        },
      },
    },
  });
}

/** Provider roteirizado: cada passo recebe o input e decide a saída. */
function scriptedProvider(steps: Array<(input: GenerationInput) => GenerationOutput>) {
  const inputs: GenerationInput[] = [];
  const provider: IaProvider = {
    id: 'OPENAI',
    async generate(input) {
      inputs.push(input);
      const step = steps.shift();
      if (step === undefined) throw new Error('roteiro esgotado');
      return step(input);
    },
  };
  return { provider, inputs };
}

const usage = { inputTokens: 10, outputTokens: 5 };

function createHarness(provider: IaProvider, seenTenants: string[]) {
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let seq = 0;
  const settings: AiTenantSettingsRecord = {
    id: 'set-a',
    tenantId: 'tenant-a',
    provider: 'OPENAI',
    model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
    businessSegment: null,
    businessDescription: null,
    consultantName: null,
    adminPrompt: null,
    tonePreset: 'PROFISSIONAL_OBJETIVO',
    tone: null,
    emojiPreference: 'MODERATE',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const send = createSendAdvisorMessage({
    settings: { findSettingsByTenant: async (tenantId) => (tenantId === 'tenant-a' ? settings : null) },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        return {
          id: conversationId,
          tenantId,
          userId,
          status: 'OPEN',
          title: 't',
          analyticalContext: null,
          startedAt: NOW,
          lastMessageAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        };
      },
      async createMessage(tenantId, conversationId, message) {
        const created: AiMessageRecord = {
          id: `msg-${++seq}`,
          tenantId,
          conversationId,
          senderType: message.senderType,
          content: message.content,
          messageType: 'TEXT',
          createdAt: NOW,
        };
        messages.push(created);
        return created;
      },
      updateConversationTitle: async () => {
        throw new Error('não usado');
      },
      listMessages: async (tenantId, conversationId) =>
        messages.filter((m) => m.tenantId === tenantId && m.conversationId === conversationId),
      saveAnalyticalContext: async () => true,
    },
    runs: {
      async createRun(tenantId, run) {
        const created = { id: `run-${++seq}`, tenantId, ...run } as unknown as AiRunRecord;
        runs.push(created);
        return created;
      },
      async updateRun(_tenantId, runId, patch) {
        const current = runs.find((r) => r.id === runId)!;
        return { ...current, ...patch };
      },
    },
    context: {
      withDocumentKnowledge: async (built) => built,
      async build() {
        return {
          tenantId: 'tenant-a',
          monthKey: '2026-11',
          blocks: [
            { type: 'PLATFORM_INSTRUCTIONS', content: 'LEGADO', trustLevel: 'PLATFORM' },
            { type: 'CONVERSATION_HISTORY', content: 'USER: velho', trustLevel: 'UNTRUSTED' },
            { type: 'USER_QUESTION', content: 'pergunta', trustLevel: 'UNTRUSTED' },
          ],
        };
      },
    },
    providers: createIaProviderRegistry({
      openai: provider,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    agent: { tools: agentTools(seenTenants) },
  });
  return { send, messages };
}

const ask = (question: string) => ({
  tenantId: 'tenant-a',
  userId: 'user-a',
  conversationId: 'conv-a',
  question,
  now: NOW,
});

describe('modo agente — conversa multi-turno', () => {
  it('"faturamento de agosto" → "e desse mês?" responde com histórico real e tool oficial', async () => {
    const seenTenants: string[] = [];
    const { provider, inputs } = scriptedProvider([
      () => ({
        text: '',
        usage,
        toolCalls: [
          {
            id: 'c1',
            name: 'financial_month_summary',
            // tenantId no argumento é ignorado: o executor usa o runtime.
            arguments: { monthKey: '2026-08' },
          },
        ],
      }),
      (input) => {
        const result = JSON.parse(input.toolRounds![0]!.results[0]!.content) as { billing: string };
        return { text: `Faturamento de agosto/2026: ${result.billing}`, usage };
      },
      (input) => {
        // O modelo vê o turno anterior como conversa real e resolve "desse mês" sozinho.
        expect(input.conversation).toEqual([
          { role: 'user', content: 'qual foi meu faturamento de agosto?' },
          { role: 'assistant', content: 'Faturamento de agosto/2026: 1000000' },
        ]);
        return {
          text: '',
          usage,
          toolCalls: [{ id: 'c2', name: 'financial_month_summary', arguments: { monthKey: '2026-11' } }],
        };
      },
      (input) => {
        const result = JSON.parse(input.toolRounds![0]!.results[0]!.content) as { billing: string };
        return { text: `Faturamento de novembro/2026: ${result.billing}`, usage };
      },
    ]);
    const { send } = createHarness(provider, seenTenants);

    const first = await send.execute(ask('qual foi meu faturamento de agosto?'));
    expect(first.consultantMessage.content).toBe('Faturamento de agosto/2026: 1000000');

    const second = await send.execute(ask('e desse mês?'));
    expect(second.consultantMessage.content).toBe('Faturamento de novembro/2026: 500000');
    expect(second.consultantMessage.content).not.toMatch(/Não consegui identificar/);

    // Instruções do agente substituem as legadas; histórico vai como turnos, não como bloco.
    const blocks = inputs[0]!.blocks;
    expect(blocks[0]!.content).toContain('Consultor Financeiro');
    expect(blocks[0]!.content).toContain('Hoje é 2026-11-04');
    expect(blocks.some((b) => b.type === 'CONVERSATION_HISTORY')).toBe(false);
    expect(seenTenants.every((t) => t === 'tenant-a')).toBe(true);
  });
});

describe('runAdvisorAgentLoop', () => {
  const base = {
    tenantId: 'tenant-a',
    provider: 'OPENAI' as const,
    model: 'm',
    blocks: [],
    conversation: [],
    resolvedMonthKey: '2026-11',
    now: NOW,
  };

  it('reaproveita chamada idêntica e força resposta ao esgotar o teto', async () => {
    let executions = 0;
    const tools = {
      tools: [],
      async execute({ call }: { call: { id: string; name: string } }) {
        executions += 1;
        return { id: call.id, name: call.name, ok: true, content: '{"status":"OK"}' };
      },
    };
    const looping = (): GenerationOutput => ({
      text: '',
      usage,
      toolCalls: [{ id: 'x', name: 'financial_month_summary', arguments: { monthKey: '2026-11' } }],
    });
    const { provider } = scriptedProvider([
      ...Array.from({ length: ADVISOR_AGENT_MAX_TOOL_ROUNDS }, () => looping),
      (input) => {
        const last = input.toolRounds!.at(-1)!.results[0]!;
        expect(last.content).toContain('LIMIT_REACHED');
        return { text: 'resposta com o que tenho', usage };
      },
    ]);
    const result = await runAdvisorAgentLoop({ ...base, tools, generate: (p) => provider.generate(p) });
    expect(result.text).toBe('resposta com o que tenho');
    expect(executions).toBe(1);
  });

  it('resposta vazia vira mensagem de fallback', async () => {
    const { provider } = scriptedProvider([() => ({ text: '  ', usage })]);
    const result = await runAdvisorAgentLoop({
      ...base,
      tools: { tools: [], execute: async () => ({ id: '', name: '', ok: false, content: '' }) },
      generate: (p) => provider.generate(p),
    });
    expect(result.text).toBe(ADVISOR_AGENT_EMPTY_ANSWER);
  });
});

describe('agent tools', () => {
  const call = (name: string, args: Record<string, unknown>) => ({
    tenantId: 'tenant-a',
    call: { id: 'c', name, arguments: args },
    now: NOW,
  });

  it('série mensal termina no endMonthKey e usa faturamento oficial', async () => {
    const tools = agentTools([]);
    const result = await tools.execute(call('financial_month_series', { endMonthKey: '2026-11', months: 4 }));
    expect(result.ok).toBe(true);
    const payload = JSON.parse(result.content) as { months: Array<{ monthKey: string; billing: string }> };
    expect(payload.months.map((m) => m.monthKey)).toEqual(['2026-08', '2026-09', '2026-10', '2026-11']);
    expect(payload.months[0]!.billing).toBe('1000000');
  });

  it('entrada inválida volta como erro legível ao modelo', async () => {
    const tools = agentTools([]);
    const result = await tools.execute(call('financial_month_series', { endMonthKey: '2026-13', months: 99 }));
    expect(result.ok).toBe(false);
    expect(result.content).toContain('YYYY-MM');
  });
});

describe('providers — histórico real', () => {
  function capture() {
    const bodies: Array<Record<string, unknown>> = [];
    const fetchImpl = (async (_url: string, init: { body: string }) => {
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: 'ok' } }],
          content: [{ type: 'text', text: 'ok' }],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;
    return { bodies, fetchImpl };
  }
  const input = (provider: 'OPENAI' | 'ANTHROPIC'): GenerationInput => ({
    tenantId: 'tenant-a',
    provider,
    model: 'm',
    blocks: [
      { type: 'PLATFORM_INSTRUCTIONS', content: 'SYS', trustLevel: 'PLATFORM' },
      { type: 'USER_QUESTION', content: 'e desse mês?', trustLevel: 'UNTRUSTED' },
    ],
    conversation: [
      { role: 'user', content: 'faturamento de agosto?' },
      { role: 'assistant', content: 'R$ 1.000.000,00' },
    ],
    maxOutputTokens: 4096,
  });

  it('OpenAI envia turnos antes da pergunta atual', async () => {
    const { bodies, fetchImpl } = capture();
    await createOpenAiProvider({ apiKey: 'k', fetchImpl }).generate(input('OPENAI'));
    const roles = (bodies[0]!.messages as Array<{ role: string }>).map((m) => m.role);
    expect(roles).toEqual(['system', 'user', 'assistant', 'user']);
    expect(bodies[0]!.max_completion_tokens).toBe(4096);
  });

  it('Anthropic envia turnos alternados e max_tokens do agente', async () => {
    const { bodies, fetchImpl } = capture();
    await createAnthropicProvider({ apiKey: 'k', fetchImpl }).generate(input('ANTHROPIC'));
    const roles = (bodies[0]!.messages as Array<{ role: string }>).map((m) => m.role);
    expect(roles).toEqual(['user', 'assistant', 'user']);
    expect(bodies[0]!.max_tokens).toBe(4096);
  });
});

describe('dashboard tools — leitura completa da Dashboard', () => {
  const CC_ID = '11111111-1111-4111-8111-111111111111';
  function harness() {
    const calls: Array<{ method: string; args: unknown[] }> = [];
    const facade = new Proxy(
      {},
      {
        get: (_target, method: string) =>
          async (...args: unknown[]) => {
            if (method === 'getMonthEndCashPressure') throw new Error('prisma: segredo interno');
            calls.push({ method, args });
            return { ok: method };
          },
      },
    ) as never;
    const base = { tools: [], execute: async () => ({ id: 'b', name: 'base', ok: true, content: 'base' }) };
    const executor = createAdvisorDashboardToolExecutor({
      base,
      deps: {
        facade,
        costCenters: { listByTenant: async () => [{ id: CC_ID, name: 'Jacaraípe', code: 'JAC', active: true }] },
        categories: { listByTenant: async () => [] as never },
      },
    });
    const run = (name: string, args: Record<string, unknown>) =>
      executor.execute({ tenantId: 'tenant-a', call: { id: 'c', name, arguments: args } });
    return { executor, run, calls };
  }

  it('expõe todas as leituras e nenhuma escrita', () => {
    const names = harness().executor.tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining([
      'dashboard_bank_balance',
      'dashboard_revenue_goal',
      'dashboard_expense_ceiling',
      'dashboard_day_movements',
      'dashboard_expected_receivables',
      'dashboard_cash_projection',
      'dashboard_revenue_report',
    ]));
    expect(names.some((n) => /upsert|set_|update/i.test(n))).toBe(false);
  });

  it('saldo bancário usa o tenant do runtime', async () => {
    const { run, calls } = harness();
    const result = await run('dashboard_bank_balance', { month: '2026-10', tenantId: 'tenant-b' });
    expect(result.ok).toBe(true);
    const auth = calls[0]!.args[0] as { tenantId: string; role: string };
    expect(auth).toMatchObject({ tenantId: 'tenant-a', role: 'USER' });
    expect(calls[0]!.args[1]).toBe('2026-10');
  });

  it('centro de custo por nome sem acento vira id do tenant', async () => {
    const { run, calls } = harness();
    await run('dashboard_day_movements', { date: '2026-10-15', direction: 'inflows', costCenter: 'jacaraipe' });
    expect(calls[0]!.method).toBe('getCashRealizedDayDetails');
    expect(calls[0]!.args[1]).toMatchObject({ date: '2026-10-15', direction: 'inflows', costCenterId: CC_ID });
  });

  it('meta e teto aceitam centro de custo; sem centro = geral', async () => {
    const { run, calls } = harness();
    await run('dashboard_revenue_goal', { month: '2026-10', costCenter: 'JAC' });
    await run('dashboard_expense_ceiling', { month: '2026-10', costCenter: 'jacaraipe' });
    await run('dashboard_revenue_goal', { month: '2026-10' });
    expect(calls.map((c) => [c.method, c.args[1], c.args[2]])).toEqual([
      ['getRevenueGoal', '2026-10', CC_ID],
      ['getExpenseCeiling', '2026-10', CC_ID],
      ['getRevenueGoal', '2026-10', null],
    ]);
  });

  it('validação volta ao modelo; erro interno não vaza', async () => {
    const { run } = harness();
    const invalid = await run('dashboard_upcoming_dues', { days: 9 });
    expect(invalid.ok).toBe(false);
    expect(invalid.content).toContain('7, 15 ou 30');
    const unknownCenter = await run('dashboard_overview', { costCenter: 'Vitória' });
    expect(unknownCenter.content).toContain('Jacaraípe');
    const internal = await run('dashboard_month_end_cash_pressure', {});
    expect(internal.content).not.toContain('segredo');
  });

  it('tools fora da Dashboard seguem para o executor base', async () => {
    const result = await harness().run('financial_month_summary', {});
    expect(result.content).toBe('base');
  });
});
