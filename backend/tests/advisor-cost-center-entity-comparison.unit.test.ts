import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { createAdvisorCostCenterDimensionService } from '../src/modules/advisor/domain/advisor-cost-center-tools.js';
import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { AI_PROVIDER_MODEL_CATALOG } from '../src/modules/advisor/domain/ai-provider-models.js';
import { classifyAnalyticalOutcome } from '../src/modules/advisor/domain/classify-analytical-outcome.js';
import { composeAdvisorFactualAnswer } from '../src/modules/advisor/domain/compose-advisor-factual-answer.js';
import {
  answerCostCenterEntityComparison,
  planCostCenterEntityComparison,
  type CostCenterEntityLookupRequest,
} from '../src/modules/advisor/domain/plan-cost-center-entity-comparison.js';
import { resolveAdvisorConversationalPeriod } from '../src/modules/advisor/domain/resolve-advisor-conversational-period.js';
import type { AnalyticalEntityRecord } from '../src/modules/advisor/domain/resolve-analytical-entity.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
} from '../src/modules/advisor/domain/types.js';
import { createAllowAllConsultantRateLimiter } from '../src/modules/advisor/services/consultant-rate-limiter.js';
import { createSendAdvisorMessage } from '../src/modules/advisor/services/send-advisor-message.js';

const NOW = new Date('2026-10-06T15:00:00.000Z');
const RESULT_QUESTION = 'Qual das duas unidades, Laranjeiras ou Jacaraípe, teve melhor resultado?';
const OUTFLOW_QUESTION = 'Qual das duas unidades, Laranjeiras ou Jacaraípe, teve maior saída?';

const CLINIC: readonly AnalyticalEntityRecord[] = [
  {
    id: 'cc-laranjeiras',
    dimension: 'COST_CENTER',
    name: 'Clínica Life Laranjeiras',
    code: null,
  },
  {
    id: 'cc-jacaraipe',
    dimension: 'COST_CENTER',
    name: 'Clínica Life Jacaraípe',
    code: null,
  },
];

type PlanInput = Parameters<typeof planCostCenterEntityComparison>[0];
type AnswerInput = Parameters<typeof answerCostCenterEntityComparison>[0];
type PlannerCannotChooseTenant = 'tenantId' extends keyof PlanInput & keyof AnswerInput ? never : true;

function periodFor(content: string) {
  return resolveAdvisorConversationalPeriod({
    content,
    referenceMonthKey: undefined,
    now: NOW,
    priorUserContents: [],
  });
}

function planFor(content: string, catalog: readonly AnalyticalEntityRecord[] = CLINIC) {
  const period = periodFor(content);
  return {
    period,
    plan: planCostCenterEntityComparison({
      content,
      period: { monthKey: period.monthKey, comparison: period.comparison },
      catalog,
    }),
  };
}

function lookupFact(id: string, name: string, amount: string): string {
  return JSON.stringify({
    status: 'OK',
    costCenter: { costCenterId: id, name, amount },
  });
}

describe('planner de comparação entre centros de custo', () => {
  it('não aceita tenant no contrato', () => {
    const proof: PlannerCannotChooseTenant = true;
    expect(proof).toBe(true);
  });

  it('duas unidades resolvidas geram plano de resultado de caixa', () => {
    const { period, plan } = planFor(RESULT_QUESTION);
    expect(period.source).toBe('CURRENT');
    expect(plan).toMatchObject({
      status: 'READY',
      operation: 'COMPARE_ENTITIES',
      dimension: 'COST_CENTER',
      metric: 'CASH_RESULT',
      direction: 'NET',
      period: { kind: 'MONTH', monthKey: period.monthKey },
      capabilityKey: 'cash_result.cost_center.month.lookup',
      toolName: 'cash_result_cost_center_lookup',
      comparisonStrategy: 'HIGHER_AMOUNT',
      entities: [
        { id: 'cc-laranjeiras', name: 'Clínica Life Laranjeiras' },
        { id: 'cc-jacaraipe', name: 'Clínica Life Jacaraípe' },
      ],
    });
    expect(plan?.lookups).toEqual([
      {
        costCenterId: 'cc-laranjeiras',
        toolName: 'cash_result_cost_center_lookup',
        monthKey: period.monthKey,
        direction: 'NET',
        costCenterQuery: 'Clínica Life Laranjeiras',
      },
      {
        costCenterId: 'cc-jacaraipe',
        toolName: 'cash_result_cost_center_lookup',
        monthKey: period.monthKey,
        direction: 'NET',
        costCenterQuery: 'Clínica Life Jacaraípe',
      },
    ]);
    expect(JSON.stringify(plan)).not.toMatch(/tenantId/i);
  });

  it('maior saída usa a capability publicada e os ids resolvidos', () => {
    const { period, plan } = planFor(OUTFLOW_QUESTION);
    expect(plan).toMatchObject({
      status: 'READY',
      metric: 'REALIZED_CASH',
      direction: 'OUTFLOW',
      capabilityKey: 'realized_cash.cost_center.month.lookup',
      toolName: 'cash_cost_center_lookup',
      comparisonStrategy: 'HIGHER_AMOUNT',
      period: { kind: 'MONTH', monthKey: period.monthKey },
    });
    expect(plan?.lookups).toEqual([
      {
        costCenterId: 'cc-laranjeiras',
        toolName: 'cash_cost_center_lookup',
        monthKey: period.monthKey,
        direction: 'OUTFLOW',
        costCenterQuery: 'Clínica Life Laranjeiras',
      },
      {
        costCenterId: 'cc-jacaraipe',
        toolName: 'cash_cost_center_lookup',
        monthKey: period.monthKey,
        direction: 'OUTFLOW',
        costCenterQuery: 'Clínica Life Jacaraípe',
      },
    ]);
  });

  it('não inventa mês quando o período recebido é vazio', () => {
    const plan = planCostCenterEntityComparison({
      content: OUTFLOW_QUESTION,
      period: { monthKey: '', comparison: false },
      catalog: CLINIC,
    });
    expect(plan).toMatchObject({
      status: 'CLARIFICATION_REQUIRED',
      reason: 'PERIOD_REQUIRED',
      lookups: [],
    });
  });

  it('entidade inexistente não consulta', async () => {
    const lookup = vi.fn();
    const answered = await answerCostCenterEntityComparison({
      content: 'Qual teve maior saída, Laranjeiras ou setor inexistente?',
      period: { monthKey: '2026-10', comparison: false },
      catalog: CLINIC,
      lookup,
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(answered?.plan.status).toBe('NOT_FOUND');
    expect(answered?.traces[0]).toMatchObject({
      reason: 'ENTITY_NOT_FOUND',
      unresolvedDimension: 'COST_CENTER',
    });
    expect(
      classifyAnalyticalOutcome({ ...answered!.trail, traces: answered!.traces }),
    ).toBe('NO_DATA');
  });

  it('entidade ambígua não consulta', async () => {
    const catalog: readonly AnalyticalEntityRecord[] = [
      { id: 'cc-alpha', dimension: 'COST_CENTER', name: 'Alpha Centro', code: null },
      { id: 'cc-beta', dimension: 'COST_CENTER', name: 'Beta Centro', code: null },
      { id: 'cc-norte', dimension: 'COST_CENTER', name: 'Unidade Norte', code: null },
    ];
    const lookup = vi.fn();
    const answered = await answerCostCenterEntityComparison({
      content: 'Qual teve maior saída, Centro ou Norte?',
      period: { monthKey: '2026-10', comparison: false },
      catalog,
      lookup,
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(answered?.plan.status).toBe('AMBIGUOUS');
    expect(answered?.traces[0]?.reason).toBe('ENTITY_AMBIGUOUS');
    expect(
      classifyAnalyticalOutcome({ ...answered!.trail, traces: answered!.traces }),
    ).toBe('CLARIFICATION_REQUIRED');
  });

  it('faturamento não vira métrica de caixa', async () => {
    const lookup = vi.fn();
    const answered = await answerCostCenterEntityComparison({
      content: 'Qual das duas unidades, Laranjeiras ou Jacaraípe, teve maior faturamento?',
      period: { monthKey: '2026-10', comparison: false },
      catalog: CLINIC,
      lookup,
    });
    expect(lookup).not.toHaveBeenCalled();
    expect(answered?.plan).toMatchObject({
      status: 'UNSUPPORTED',
      metric: 'BILLING',
      lookups: [],
    });
    expect(
      classifyAnalyticalOutcome({ ...answered!.trail, traces: answered!.traces }),
    ).toBe('UNSUPPORTED');
  });

  it('os valores retornados escolhem o centro e a ausência não inventa vencedor', async () => {
    const period = { monthKey: '2026-10', comparison: false };
    const calls: CostCenterEntityLookupRequest[] = [];
    const first = await answerCostCenterEntityComparison({
      content: OUTFLOW_QUESTION,
      period,
      catalog: CLINIC,
      lookup: async (request) => {
        calls.push(request);
        const amount = request.costCenterId === 'cc-jacaraipe' ? '40.00' : '10.00';
        return {
          ok: true,
          name: request.toolName,
          content: lookupFact(request.costCenterId, request.costCenterQuery, amount),
        };
      },
    });
    expect(calls.map((call) => call.costCenterId)).toEqual(['cc-laranjeiras', 'cc-jacaraipe']);
    const composed = composeAdvisorFactualAnswer({
      content: OUTFLOW_QUESTION,
      anaphora: 'NONE',
      toolName: first?.plan.toolName ?? null,
      toolOk: true,
      toolContent: JSON.stringify(first?.facts),
    });
    expect(composed.answer).toContain('Clínica Life Jacaraípe teve o maior valor');
    expect(classifyAnalyticalOutcome({ ...first!.trail, traces: first!.traces })).toBe('ANSWERED');

    const swapped = await answerCostCenterEntityComparison({
      content: OUTFLOW_QUESTION,
      period,
      catalog: CLINIC,
      lookup: async (request) => ({
        ok: true,
        name: request.toolName,
        content: lookupFact(
          request.costCenterId,
          request.costCenterQuery,
          request.costCenterId === 'cc-laranjeiras' ? '80.00' : '15.00',
        ),
      }),
    });
    const swappedAnswer = composeAdvisorFactualAnswer({
      content: OUTFLOW_QUESTION,
      anaphora: 'NONE',
      toolName: swapped?.plan.toolName ?? null,
      toolOk: true,
      toolContent: JSON.stringify(swapped?.facts),
    });
    expect(swappedAnswer.answer).toContain('Clínica Life Laranjeiras teve o maior valor');

    const empty = await answerCostCenterEntityComparison({
      content: OUTFLOW_QUESTION,
      period,
      catalog: CLINIC,
      lookup: async (request) => ({
        ok: true,
        name: request.toolName,
        content: JSON.stringify({ status: 'EMPTY_RESULT', costCenter: null }),
      }),
    });
    const emptyAnswer = composeAdvisorFactualAnswer({
      content: OUTFLOW_QUESTION,
      anaphora: 'NONE',
      toolName: null,
      toolOk: false,
      toolContent: JSON.stringify(empty?.facts),
    });
    expect(emptyAnswer.answer).toBe(
      'Não há valores identificados para comparar esses centros de custo neste mês.',
    );
    expect(classifyAnalyticalOutcome({ ...empty!.trail, traces: empty!.traces })).toBe('NO_DATA');
  });

  it('id diferente do resolvido não vira vencedor', async () => {
    const answered = await answerCostCenterEntityComparison({
      content: OUTFLOW_QUESTION,
      period: { monthKey: '2026-10', comparison: false },
      catalog: CLINIC,
      lookup: async (request) => ({
        ok: true,
        name: request.toolName,
        content: lookupFact('cc-outro', request.costCenterQuery, '99.00'),
      }),
    });
    expect(answered?.facts).toMatchObject({ status: 'EMPTY_RESULT', winnerCostCenterId: null, rows: [] });
  });

  it('catálogo de outro tenant não resolve os centros', () => {
    const other: readonly AnalyticalEntityRecord[] = [
      { id: 'cc-sul', dimension: 'COST_CENTER', name: 'Clínica Other Sul', code: null },
    ];
    expect(planFor(OUTFLOW_QUESTION, other).plan).toBeNull();
    const mixed = planCostCenterEntityComparison({
      content: 'Qual teve maior saída, Laranjeiras ou Sul?',
      period: { monthKey: '2026-10', comparison: false },
      catalog: [...CLINIC, ...other],
    });
    expect(mixed?.status).toBe('READY');
    expect(mixed?.lookups.map((item) => item.costCenterId)).toEqual(['cc-laranjeiras', 'cc-sul']);
  });

  it('resultado negativo maior é o menos negativo e zero não é ausência', async () => {
    const period = { monthKey: '2026-10', comparison: false };
    const negative = await answerCostCenterEntityComparison({
      content: OUTFLOW_QUESTION.replace('maior saída', 'melhor resultado'),
      period,
      catalog: CLINIC,
      lookup: async (request) => ({
        ok: true,
        name: request.toolName,
        content: lookupFact(
          request.costCenterId,
          request.costCenterQuery,
          request.costCenterId === 'cc-laranjeiras' ? '-10000' : '-5000',
        ),
      }),
    });
    const answer = composeAdvisorFactualAnswer({
      content: RESULT_QUESTION,
      anaphora: 'NONE',
      toolName: negative?.plan.toolName ?? null,
      toolOk: true,
      toolContent: JSON.stringify(negative?.facts),
    });
    expect(negative?.plan).toMatchObject({ metric: 'CASH_RESULT', comparisonStrategy: 'HIGHER_AMOUNT' });
    expect(answer.answer).toContain('Clínica Life Jacaraípe teve o maior valor em resultado de caixa');
    expect(classifyAnalyticalOutcome({ ...negative!.trail, traces: negative!.traces })).toBe('ANSWERED');

    const zeros = await answerCostCenterEntityComparison({
      content: RESULT_QUESTION,
      period,
      catalog: CLINIC,
      lookup: async (request) => ({
        ok: true,
        name: request.toolName,
        content: lookupFact(request.costCenterId, request.costCenterQuery, '0'),
      }),
    });
    const tie = composeAdvisorFactualAnswer({
      content: RESULT_QUESTION,
      anaphora: 'NONE',
      toolName: null,
      toolOk: true,
      toolContent: JSON.stringify(zeros?.facts),
    });
    expect(tie.answer).toContain('tiveram o mesmo valor em resultado de caixa: R$ 0,00');
    expect(classifyAnalyticalOutcome({ ...zeros!.trail, traces: zeros!.traces })).toBe('ANSWERED');
  });

  it('ausência de realized.result vira NO_DATA', async () => {
    const answered = await answerCostCenterEntityComparison({
      content: RESULT_QUESTION,
      period: { monthKey: '2026-10', comparison: false },
      catalog: CLINIC,
      lookup: async (request) => ({
        ok: true,
        name: request.toolName,
        content: JSON.stringify({
          status: 'ABSENT',
          direction: 'NET',
          realizedMeaning: 'RESULTADO_DE_CAIXA',
          costCenter: {
            costCenterId: request.costCenterId,
            name: request.costCenterQuery,
            amount: 'ABSENT',
          },
        }),
      }),
    });
    const text = composeAdvisorFactualAnswer({
      content: RESULT_QUESTION,
      anaphora: 'NONE',
      toolName: null,
      toolOk: false,
      toolContent: JSON.stringify(answered?.facts),
    });
    expect(text.answer).toBe(
      'Não há valores identificados para comparar esses centros de custo neste mês.',
    );
    expect(classifyAnalyticalOutcome({ ...answered!.trail, traces: answered!.traces })).toBe('NO_DATA');
  });

  it('não grava a fixture no planner', () => {
    const source = readFileSync(
      new URL('../src/modules/advisor/domain/plan-cost-center-entity-comparison.ts', import.meta.url),
      'utf8',
    ).toLowerCase();
    expect(source).not.toContain('laranjeiras');
    expect(source).not.toContain('jacaraipe');
    expect(source).not.toContain('jacaraípe');
    expect(source).not.toContain('clínica life');
    expect(source).not.toContain('clinica life');
    expect(source).not.toContain('felipe');
  });
});

describe('envio da comparação de centros', () => {
  it('resultado de caixa compara os fatos e saída usa o tenant da sessão', async () => {
    const lookups: Array<{ tenantId: string; arguments: Record<string, unknown> }> = [];
    const listedTenants: string[] = [];
    const harness = createSendHarness({
      async listByTenant(tenantId) {
        listedTenants.push(tenantId);
        if (tenantId !== 'tenant-a') {
          return [];
        }
        return [
          { id: 'cc-laranjeiras', name: 'Clínica Life Laranjeiras', code: null, active: true },
          { id: 'cc-jacaraipe', name: 'Clínica Life Jacaraípe', code: null, active: true },
        ];
      },
      async execute(input) {
        lookups.push({ tenantId: input.tenantId, arguments: input.call.arguments });
        const query = String(input.call.arguments.costCenterQuery);
        const id = query.includes('Jacaraípe') ? 'cc-jacaraipe' : 'cc-laranjeiras';
        const amount = id === 'cc-jacaraipe' ? '40.00' : '10.00';
        return {
          id: input.call.id,
          name: input.call.name,
          ok: true,
          content: lookupFact(id, query, amount),
          resultCardinality: 1,
        };
      },
    });

    const resultQuestion = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: RESULT_QUESTION,
      now: NOW,
    });
    expect(resultQuestion.run).toBeNull();
    expect(resultQuestion.analyticalOutcome).toBe('ANSWERED');
    expect(resultQuestion.consultantMessage.content).toContain(
      'Clínica Life Jacaraípe teve o maior valor em resultado de caixa',
    );
    expect(harness.openai.generateCalls).toHaveLength(0);
    expect(lookups.map((call) => call.tenantId)).toEqual(['tenant-a', 'tenant-a']);
    expect(lookups.map((call) => call.arguments.costCenterQuery)).toEqual([
      'Clínica Life Laranjeiras',
      'Clínica Life Jacaraípe',
    ]);

    const outflow = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: OUTFLOW_QUESTION,
      now: NOW,
    });
    expect(outflow.run).toBeNull();
    expect(outflow.analyticalOutcome).toBe('ANSWERED');
    expect(outflow.consultantMessage.content).toContain('Clínica Life Jacaraípe teve o maior valor');
    expect(lookups.slice(2).map((call) => call.tenantId)).toEqual(['tenant-a', 'tenant-a']);
    expect(listedTenants.every((tenantId) => tenantId === 'tenant-a')).toBe(true);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });
});

describe('resultado de caixa por centro', () => {
  it('devolve realized.result do fluxo filtrado pelo id, sem recalcular', async () => {
    const calls: Array<{ tenantId: string; costCenterId?: string }> = [];
    const service = createAdvisorCostCenterDimensionService({
      cashFlow: {
        async getMonthlyCashFlow(input) {
          calls.push({ tenantId: input.tenantId, costCenterId: input.costCenterId });
          const result =
            input.costCenterId === 'cc-b' ? '-5000' : input.costCenterId === 'cc-a' ? '-10000' : '0';
          return {
            tenantId: input.tenantId,
            realized: {
              inflows: new Prisma.Decimal('1'),
              outflows: new Prisma.Decimal('1'),
              result: new Prisma.Decimal(result),
            },
          } as MonthlyCashFlow;
        },
      },
      ledger: {} as never,
      receivables: {} as never,
      payables: {} as never,
      costCenters: {
        async listByTenant(tenantId) {
          if (tenantId !== 'tenant-a') {
            return [];
          }
          return [
            { id: 'cc-a', name: 'Unidade Alfa', code: null, active: true },
            { id: 'cc-b', name: 'Unidade Beta', code: null, active: true },
            { id: 'cc-z', name: 'Unidade Zero', code: null, active: true },
            { id: 'cc-off', name: 'Unidade Inativa', code: null, active: false },
          ];
        },
      },
      costCenterAllocations: {} as never,
    });

    const worse = await service.cashResult({
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      costCenterQuery: 'Unidade Alfa',
    });
    const better = await service.cashResult({
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      costCenterQuery: 'Unidade Beta',
    });
    const zero = await service.cashResult({
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      costCenterQuery: 'Unidade Zero',
    });
    const missing = await service.cashResult({
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      costCenterQuery: 'Unidade Inativa',
    });
    expect(worse).toMatchObject({
      status: 'OK',
      direction: 'NET',
      realizedMeaning: 'RESULTADO_DE_CAIXA',
      costCenter: { costCenterId: 'cc-a', amount: '-10000' },
    });
    expect(better).toMatchObject({
      status: 'OK',
      costCenter: { costCenterId: 'cc-b', amount: '-5000' },
    });
    expect(zero).toMatchObject({
      status: 'OK',
      costCenter: { costCenterId: 'cc-z', amount: '0' },
    });
    expect(calls.map((call) => call.costCenterId)).toEqual(['cc-a', 'cc-b', 'cc-z']);
    expect(calls.every((call) => call.tenantId === 'tenant-a')).toBe(true);
    expect(missing).toMatchObject({ status: 'NOT_FOUND', costCenter: null });

    const absentFlow = createAdvisorCostCenterDimensionService({
      cashFlow: {
        async getMonthlyCashFlow(input) {
          if (input.tenantId !== 'tenant-a') {
            throw new Error('tenant inesperado');
          }
          return {
            tenantId: 'tenant-a',
            realized: { inflows: null, outflows: null, result: null },
          } as MonthlyCashFlow;
        },
      },
      ledger: {} as never,
      receivables: {} as never,
      payables: {} as never,
      costCenters: {
        async listByTenant() {
          return [{ id: 'cc-a', name: 'Unidade Alfa', code: null, active: true }];
        },
      },
      costCenterAllocations: {} as never,
    });
    const absent = await absentFlow.cashResult({
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      costCenterQuery: 'Unidade Alfa',
    });
    expect(absent).toMatchObject({
      status: 'ABSENT',
      costCenter: { costCenterId: 'cc-a', amount: 'ABSENT' },
    });
  });
});

function createSendHarness(input: {
  readonly listByTenant: (tenantId: string) => Promise<
    Array<{ id: string; name: string; code: string | null; active: boolean }>
  >;
  readonly execute: (toolInput: {
    readonly tenantId: string;
    readonly call: { id: string; name: string; arguments: Record<string, unknown> };
  }) => Promise<{
    id: string;
    name: string;
    ok: boolean;
    content: string;
    resultCardinality?: number;
  }>;
}) {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'prosa inventada' });
  const now = NOW;
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let messageSeq = 0;
  let runSeq = 0;
  const conversationRow: AiConversationRecord = {
    id: 'conv-a',
    tenantId: 'tenant-a',
    userId: 'user-a',
    status: 'OPEN',
    title: 'titulo',
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
      async createMessage(tenantId, conversationId, message) {
        const created = {
          id: `msg-${++messageSeq}`,
          conversationId,
          tenantId,
          senderType: message.senderType,
          content: message.content,
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
      async createRun(tenantId, run) {
        const created: AiRunRecord = {
          id: `run-${++runSeq}`,
          tenantId,
          userId: run.userId ?? null,
          conversationId: run.conversationId ?? null,
          messageId: run.messageId ?? null,
          runType: run.runType ?? 'QUESTION_REPLY',
          provider: run.provider,
          model: run.model,
          status: run.status,
          inputTokens: run.inputTokens ?? null,
          outputTokens: run.outputTokens ?? null,
          durationMs: run.durationMs ?? null,
          errorCode: run.errorCode ?? null,
          createdAt: now,
          finishedAt: run.finishedAt ?? null,
        };
        runs.push(created);
        return created;
      },
      async updateRun(tenantId, runId, patch) {
        const current = runs.find((item) => item.tenantId === tenantId && item.id === runId);
        if (current === undefined) {
          throw new Error('run ausente');
        }
        const updated = { ...current, ...patch };
        runs.splice(runs.indexOf(current), 1, updated);
        return updated;
      },
    },
    context: {
      async build() {
        return { tenantId: 'tenant-a', monthKey: '2026-10', blocks: [] };
      },
    },
    providers: createIaProviderRegistry({
      openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    dailyCashMovements: {
      details: { async getCashRealizedDayDetails() { throw new Error('não usado'); } },
      costCenters: { listByTenant: input.listByTenant },
    },
    analyticalTools: {
      tools: [],
      execute: input.execute,
    },
    analyticalResults: {
      async record() {
        return { id: 'trail-1' };
      },
    },
  });
  return { send, openai };
}
