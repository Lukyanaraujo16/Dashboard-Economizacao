import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import {
  ADVISOR_MAX_TOOL_ROUNDS,
  ADVISOR_PLATFORM_INSTRUCTIONS,
  AI_PROVIDER_MODEL_CATALOG,
  CASH_REALIZED_BREAKDOWN_TOOL,
  COMPARE_CASH_MONTHS_TOOL_NAME,
  analyzeToolEvidence,
  buildAnalyticalCompletionFeedback,
  canDeterministicPathFullyAnswer,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
  deriveAnalyticalObligations,
  deriveQuestionAnalyticalDemand,
  deterministicPathCapabilityFromComposer,
  evaluateAnalyticalCompletion,
  formatAdvisorUiContextBlock,
  gateAdvisorEvidenceBoundAnswer,
  normalizeAdvisorToolCallFingerprint,
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

const CC_CATALOG = [
  { id: 'cc-alfa', name: 'Unidade Alfa', code: 'ALF' },
  { id: 'cc-beta', name: 'Unidade Beta', code: 'BET' },
] as const;

function settings(): AiTenantSettingsRecord {
  const now = new Date('2026-10-06T12:00:00.000Z');
  return {
    id: 'set-a2',
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

function conversation(): AiConversationRecord {
  const now = new Date('2026-10-06T12:00:00.000Z');
  return {
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
    createdAt: new Date('2026-10-06T12:00:00.000Z'),
  };
}

function builtContext(): AdvisorBuiltContext {
  return {
    tenantId: 'tenant-a',
    monthKey: '2026-10',
    blocks: [
      {
        type: 'PLATFORM_INSTRUCTIONS',
        content: ADVISOR_PLATFORM_INSTRUCTIONS,
        trustLevel: 'PLATFORM',
      },
      {
        type: 'UI_CONTEXT',
        content: formatAdvisorUiContextBlock({ selectedMonth: '2026-10' }),
        trustLevel: 'TENANT_CONFIG',
      },
      {
        type: 'FINANCIAL_FACTS',
        content: [
          'entityScope: TENANT',
          'costCenter: NONE',
          'monthKey=2026-08',
          'cash.realized.outflows: R$ 51.568,60',
        ].join('\n'),
        trustLevel: 'ANALYTICAL_FACT',
      },
      {
        type: 'USER_QUESTION',
        content: 'pergunta',
        trustLevel: 'UNTRUSTED',
      },
    ],
  };
}

function createA2Harness(options: {
  readonly openai: ReturnType<typeof createFakeIaProvider>;
  readonly execute?: SendAdvisorMessageDependencies['analyticalTools'];
  readonly cashComparison?: SendAdvisorMessageDependencies['cashComparison'];
}) {
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let runSeq = 0;
  let msgSeq = 0;
  const conversationRow = conversation();
  const completionEvents: Array<Record<string, unknown>> = [];
  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string') {
      try {
        const parsed = JSON.parse(first) as Record<string, unknown>;
        if (parsed.event === 'advisor_agent_completion_gate') {
          completionEvents.push(parsed);
        }
      } catch {
        // ignore
      }
    }
    originalInfo.apply(console, args as never);
  };

  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        return tenantId === 'tenant-a' ? settings() : null;
      },
    },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        return tenantId === 'tenant-a' && userId === 'user-a' && conversationId === 'conv-a'
          ? conversationRow
          : null;
      },
      async createMessage(tenantId, conversationId, input) {
        const row = message(`msg-${++msgSeq}`, input.senderType, input.content);
        messages.push({ ...row, tenantId, conversationId });
        return { ...row, tenantId, conversationId };
      },
      async updateConversationTitle() {
        return conversationRow;
      },
      async listMessages(tenantId, conversationId) {
        return messages.filter(
          (item) => item.tenantId === tenantId && item.conversationId === conversationId,
        );
      },
      async saveAnalyticalContext() {
        return;
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
      async updateRun(tenantId, runId, patch: UpdateAiRunInput) {
        const index = runs.findIndex((row) => row.id === runId && row.tenantId === tenantId);
        const current = runs[index]!;
        const next: AiRunRecord = {
          ...current,
          status: patch.status,
          inputTokens: patch.inputTokens === undefined ? current.inputTokens : patch.inputTokens,
          outputTokens:
            patch.outputTokens === undefined ? current.outputTokens : patch.outputTokens,
          durationMs: patch.durationMs === undefined ? current.durationMs : patch.durationMs,
          errorCode: patch.errorCode === undefined ? current.errorCode : patch.errorCode,
          finishedAt: patch.finishedAt === undefined ? current.finishedAt : patch.finishedAt,
          messageId: patch.messageId === undefined ? current.messageId : patch.messageId,
        };
        runs[index] = next;
        return next;
      },
    },
    context: {
      async build(input: BuildAdvisorContextInput) {
        return { ...builtContext(), monthKey: input.monthKey ?? '2026-10' };
      },
      async withDocumentKnowledge(built) {
        return built;
      },
    },
    providers: createIaProviderRegistry({
      openai: options.openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    analyticalTools: options.execute,
    cashComparison: options.cashComparison,
    dailyCashMovements: {
      details: {
        async getCashRealizedDayDetails() {
          throw new Error('day details não deveria rodar');
        },
      },
      costCenters: {
        async listByTenant() {
          return CC_CATALOG.map((row) => ({ ...row, active: true }));
        },
      },
    },
  });

  return {
    send,
    messages,
    openai: options.openai,
    completionEvents,
    restore() {
      console.info = originalInfo;
    },
  };
}

const TOOLS_CATALOG = [
  CASH_REALIZED_BREAKDOWN_TOOL,
  {
    name: 'compare_cash_cost_center',
    description: 'compare cc',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'compare_cash_months',
    description: 'compare months',
    inputSchema: { type: 'object', properties: {} },
  },
  {
    name: 'cash_cost_center_movement_lines',
    description: 'cc movements',
    inputSchema: { type: 'object', properties: {} },
  },
];

describe('Fase A.2 — completion contract do agente', () => {
  it('A) scoped + zero evidence → texto rejeitado; nova oportunidade de tool', async () => {
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        { text: 'Unidade Alfa gastou R$ 51.568,60 em agosto.' },
        {
          toolCalls: [
            {
              id: 'a1',
              name: 'cash_realized_breakdown',
              arguments: {
                monthKey: '2026-08',
                direction: 'OUTFLOW',
                costCenterQuery: 'Alfa',
              },
            },
          ],
        },
        { text: 'No centro Alfa a Folha somou R$ 28000.' },
      ],
    });
    const execute = vi.fn(async (input: { call: { id: string; name: string } }) => ({
      id: input.call.id,
      name: input.call.name,
      ok: true,
      content: JSON.stringify({
        status: 'OK',
        entityScope: 'COST_CENTER',
        resolvedCostCenter: 'Unidade Alfa',
        categories: [{ label: 'Folha', amount: '28000', rank: 1 }],
      }),
    }));
    const harness = createA2Harness({
      openai,
      execute: { tools: TOOLS_CATALOG, execute },
    });
    try {
      const result = await harness.send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Qual categoria mais consumiu caixa em Unidade Alfa em agosto de 2026?',
        monthKey: '2026-10',
        now: new Date('2026-10-06T18:00:00.000Z'),
      });
      expect(harness.completionEvents.some((e) => e.completionDecision === 'CONTINUE')).toBe(true);
      const feedbackRound = openai.generateCalls[1]?.toolRounds?.find((round) =>
        round.results.some((row) => row.name === 'analytical_completion_gate'),
      );
      expect(feedbackRound?.results[0]?.content).toContain('INSUFFICIENT_ANALYTICAL_EVIDENCE');
      expect(execute).toHaveBeenCalled();
      expect(result.consultantMessage.content).toContain('28000');
      expect(result.consultantMessage.content).not.toContain('51.568,60');
    } finally {
      harness.restore();
    }
  });

  it('B) uma tool satisfaz toda demanda → aceita sem round extra de completion', async () => {
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'b1',
              name: 'cash_realized_breakdown',
              arguments: {
                monthKey: '2026-08',
                direction: 'OUTFLOW',
                costCenterQuery: 'Alfa',
              },
            },
          ],
        },
        { text: 'No centro Alfa a Folha somou R$ 28000.' },
      ],
    });
    const harness = createA2Harness({
      openai,
      execute: {
        tools: TOOLS_CATALOG,
        async execute(input) {
          return {
            id: input.call.id,
            name: input.call.name,
            ok: true,
            content: JSON.stringify({
              status: 'OK',
              entityScope: 'COST_CENTER',
              resolvedCostCenter: 'Unidade Alfa',
              categories: [{ label: 'Folha', amount: '28000', rank: 1 }],
            }),
          };
        },
      },
    });
    try {
      const result = await harness.send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'Qual categoria mais consumiu caixa em Unidade Alfa em agosto de 2026?',
        monthKey: '2026-10',
        now: new Date('2026-10-06T18:00:00.000Z'),
      });
      expect(harness.completionEvents.some((e) => e.completionDecision === 'CONTINUE')).toBe(false);
      expect(harness.completionEvents.some((e) => e.completionDecision === 'ANSWER')).toBe(true);
      expect(result.consultantMessage.content).toContain('Folha');
      expect(openai.generateCalls).toHaveLength(2);
    } finally {
      harness.restore();
    }
  });

  it('C) COMPARISON ok + COMPOSITION faltando → texto prematuro rejeitado', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content:
        'Unidade Alfa gastou mais em agosto do que em julho de 2026? E o que explica a diferença nas saídas?',
      comparison: true,
      catalog: [...CC_CATALOG],
    });
    const required = deriveAnalyticalObligations(demand);
    expect(required).toEqual(expect.arrayContaining(['COMPARISON', 'COMPOSITION', 'ENTITY_SCOPE']));
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [
        {
          toolName: 'compare_cash_cost_center',
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            resolvedCostCenter: 'Unidade Alfa',
            absoluteDelta: '-1000',
          }),
        },
      ],
      availableToolNames: TOOLS_CATALOG.map((tool) => tool.name),
      roundsRemaining: 2,
    });
    expect(state.satisfiedObligations.has('COMPARISON')).toBe(true);
    expect(state.satisfiedObligations.has('COMPOSITION')).toBe(false);
    expect(state.decision).toBe('CONTINUE');
    expect(state.missingObligations).toContain('COMPOSITION');
    const feedback = buildAnalyticalCompletionFeedback({ state, zeroToolAttempt: false });
    expect(feedback.status).toBe('INCOMPLETE_ANALYTICAL_ANSWER');
  });

  it('D) após tool de composição → obligations completas → ANSWER', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content:
        'Unidade Alfa gastou mais em agosto do que em julho de 2026? E o que explica a diferença nas saídas?',
      comparison: true,
      catalog: [...CC_CATALOG],
    });
    const required = deriveAnalyticalObligations(demand);
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [
        {
          toolName: 'compare_cash_cost_center',
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            resolvedCostCenter: 'Unidade Alfa',
            absoluteDelta: '-1000',
          }),
        },
        {
          toolName: 'cash_realized_breakdown',
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            resolvedCostCenter: 'Unidade Alfa',
            categories: [{ label: 'Folha', amount: '28000' }],
          }),
        },
      ],
      availableToolNames: TOOLS_CATALOG.map((tool) => tool.name),
      roundsRemaining: 1,
    });
    expect(state.decision).toBe('ANSWER');
    expect(state.missingObligations).toEqual([]);
  });

  it('E) investigação com evidência insuficiente → CONTINUE', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'O que merece atenção nas saídas de Unidade Alfa em agosto de 2026?',
      comparison: false,
      catalog: [...CC_CATALOG],
    });
    const required = deriveAnalyticalObligations(demand);
    expect(required).toContain('INVESTIGATION');
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [
        {
          toolName: 'cash_cost_center_lookup',
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            resolvedCostCenter: 'Unidade Alfa',
            costCenter: { name: 'Unidade Alfa', amount: '1000' },
          }),
        },
      ],
      availableToolNames: TOOLS_CATALOG.map((tool) => tool.name),
      roundsRemaining: 2,
    });
    expect(state.decision).toBe('CONTINUE');
    expect(state.missingObligations).toContain('INVESTIGATION');
  });

  it('F) investigação com evidências complementares → ANSWER', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'O que merece atenção nas saídas de Unidade Alfa em agosto de 2026?',
      comparison: false,
      catalog: [...CC_CATALOG],
    });
    const required = deriveAnalyticalObligations(demand);
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [
        {
          toolName: 'cash_realized_breakdown',
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            resolvedCostCenter: 'Unidade Alfa',
            categories: [{ label: 'Folha', amount: '28000' }],
          }),
        },
        {
          toolName: 'cash_cost_center_movement_lines',
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            resolvedCostCenter: 'Unidade Alfa',
            lines: [{ attributedAmount: '11000', description: 'Folha X' }],
          }),
        },
      ],
      availableToolNames: TOOLS_CATALOG.map((tool) => tool.name),
      roundsRemaining: 0,
    });
    expect(state.satisfiedObligations.has('INVESTIGATION')).toBe(true);
    expect(state.decision).toBe('ANSWER');
  });

  it('G) obligation impossível pelo catálogo → PARTIAL sem loop', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content:
        'Unidade Alfa gastou mais em agosto do que em julho de 2026? E o que explica a diferença nas saídas?',
      comparison: true,
      catalog: [...CC_CATALOG],
    });
    const required = deriveAnalyticalObligations(demand);
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [
        {
          toolName: 'compare_cash_cost_center',
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            resolvedCostCenter: 'Unidade Alfa',
            absoluteDelta: '-1000',
          }),
        },
      ],
      // Catálogo sem breakdown → COMPOSITION impossível.
      availableToolNames: ['compare_cash_cost_center', 'cash_cost_center_lookup'],
      roundsRemaining: 3,
    });
    expect(state.impossibleObligations).toContain('COMPOSITION');
    expect(state.decision).toBe('PARTIAL_LIMITATION');
  });

  it('H) fast-path homologado continua sem agent overhead', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Qual foi meu maior gasto em Unidade Alfa em agosto de 2026?',
      comparison: false,
      catalog: [...CC_CATALOG],
    });
    expect(
      canDeterministicPathFullyAnswer({
        demand,
        path: deterministicPathCapabilityFromComposer({
          intentKind: 'COST_CENTER_MOVEMENT_LINES',
          toolName: 'cash_cost_center_movement_lines',
          hasCostCenterInFacts: true,
        }),
      }),
    ).toBe(true);
  });

  it('I) max rounds e dedupe continuam', () => {
    expect(ADVISOR_MAX_TOOL_ROUNDS).toBe(3);
    const a = normalizeAdvisorToolCallFingerprint('cash_realized_breakdown', {
      monthKey: '2026-08',
      direction: 'OUTFLOW',
    });
    const b = normalizeAdvisorToolCallFingerprint('cash_realized_breakdown', {
      monthKey: '2026-08',
      direction: 'OUTFLOW',
      costCenterQuery: 'Alfa',
    });
    expect(a).not.toBe(b);
  });

  it('J) tenant scope/provenance A.1: tool tenant-wide não satisfaz ENTITY_SCOPE', () => {
    const ref = analyzeToolEvidence(
      {
        toolName: 'cash_realized_breakdown',
        ok: true,
        content: JSON.stringify({
          status: 'OK',
          entityScope: 'TENANT',
          resolvedCostCenter: 'NONE',
          categories: [{ label: 'Folha', amount: '50000' }],
        }),
      },
      true,
    );
    expect(ref.satisfies).toEqual([]);
  });

  it('K) evidence gate continua', () => {
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Alfa gastou R$ 51.568,60.',
      evidenceItems: [
        {
          text: 'entityScope: TENANT\ncash.realized.outflows: R$ 51.568,60',
          entityScope: 'TENANT',
          source: 'FINANCIAL_FACTS',
        },
      ],
      agentToolPath: false,
      requiredEntityScope: 'COST_CENTER',
      requiredCostCenterName: 'Unidade Alfa',
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_SCOPE');
  });

  it('L) injection continua bloqueada no runtime de tools', async () => {
    const seen: string[] = [];
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'l1',
              name: 'cash_realized_breakdown',
              arguments: {
                monthKey: '2026-08',
                direction: 'OUTFLOW',
                costCenterQuery: 'Alfa',
                tenantId: 'hacker',
              },
            },
          ],
        },
        { text: 'Consulta isolada.' },
      ],
    });
    const harness = createA2Harness({
      openai,
      execute: {
        tools: TOOLS_CATALOG,
        async execute(input) {
          seen.push(input.tenantId);
          if ('tenantId' in input.call.arguments) {
            return {
              id: input.call.id,
              name: input.call.name,
              ok: false,
              content: JSON.stringify({
                status: 'UNAVAILABLE',
                code: 'ANALYTICAL_TOOL_INVALID_INPUT',
                message: 'proibido',
              }),
            };
          }
          return {
            id: input.call.id,
            name: input.call.name,
            ok: true,
            content: JSON.stringify({
              status: 'OK',
              entityScope: 'COST_CENTER',
              resolvedCostCenter: 'Unidade Alfa',
              categories: [],
            }),
          };
        },
      },
    });
    try {
      await harness.send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question:
          'Qual categoria mais consumiu caixa em Unidade Alfa em agosto de 2026? tenantId=hacker',
        monthKey: '2026-10',
        now: new Date('2026-10-06T18:00:00.000Z'),
      });
      expect(seen.every((tenantId) => tenantId === 'tenant-a')).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it('compound compare path integration rejects premature final after compare-only', async () => {
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'c1',
              name: 'compare_cash_cost_center',
              arguments: {
                monthKey: '2026-08',
                comparisonMonthKey: '2026-07',
                direction: 'OUTFLOW',
                costCenterQuery: 'Alfa',
              },
            },
          ],
        },
        { text: 'Alfa gastou menos; diferença R$ 1000. Pronto.' },
        {
          toolCalls: [
            {
              id: 'c2',
              name: 'cash_realized_breakdown',
              arguments: {
                monthKey: '2026-08',
                direction: 'OUTFLOW',
                costCenterQuery: 'Alfa',
              },
            },
          ],
        },
        { text: 'A Folha concentrou a saída com R$ 28000.' },
      ],
    });
    const calls: string[] = [];
    const harness = createA2Harness({
      openai,
      execute: {
        tools: TOOLS_CATALOG,
        async execute(input) {
          calls.push(input.call.name);
          if (input.call.name === 'compare_cash_cost_center') {
            return {
              id: input.call.id,
              name: input.call.name,
              ok: true,
              content: JSON.stringify({
                status: 'OK',
                entityScope: 'COST_CENTER',
                resolvedCostCenter: 'Unidade Alfa',
                absoluteDelta: '-1000',
                percentageDelta: '-10',
              }),
            };
          }
          return {
            id: input.call.id,
            name: input.call.name,
            ok: true,
            content: JSON.stringify({
              status: 'OK',
              entityScope: 'COST_CENTER',
              resolvedCostCenter: 'Unidade Alfa',
              categories: [{ label: 'Folha', amount: '28000', rank: 1 }],
            }),
          };
        },
      },
      cashComparison: {
        async compare() {
          throw new Error('tenant compare não deveria prefetchar com CC');
        },
      },
    });
    try {
      const result = await harness.send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question:
          'Unidade Alfa gastou mais em agosto do que em julho de 2026? E o que explica a diferença nas saídas?',
        monthKey: '2026-10',
        now: new Date('2026-10-06T18:00:00.000Z'),
      });
      expect(calls).toEqual(['compare_cash_cost_center', 'cash_realized_breakdown']);
      expect(
        harness.completionEvents.some(
          (e) =>
            e.completionDecision === 'CONTINUE' &&
            Array.isArray(e.missingObligations) &&
            (e.missingObligations as string[]).includes('COMPOSITION'),
        ),
      ).toBe(true);
      expect(result.consultantMessage.content).toContain('Folha');
      const incomplete = openai.generateCalls.some((call) =>
        call.toolRounds?.some((round) =>
          round.results.some((row) => row.content.includes('INCOMPLETE_ANALYTICAL_ANSWER')),
        ),
      );
      expect(incomplete).toBe(true);
    } finally {
      harness.restore();
    }
  });

  it('tenant-wide VALUE pode ser satisfeito por FINANCIAL_FACTS sem tool', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Qual foi o total de saídas realizadas em agosto de 2026?',
      comparison: false,
      catalog: [...CC_CATALOG],
    });
    const required = deriveAnalyticalObligations(demand);
    expect(required).toEqual(['VALUE']);
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [],
      preloadFactScopes: ['TENANT'],
      availableToolNames: TOOLS_CATALOG.map((tool) => tool.name),
      roundsRemaining: 3,
    });
    expect(state.decision).toBe('ANSWER');
  });

  it('COMPARE_CASH_MONTHS tool name ainda no catálogo de comparação', () => {
    expect(COMPARE_CASH_MONTHS_TOOL_NAME).toBe('compare_cash_months');
  });
});
