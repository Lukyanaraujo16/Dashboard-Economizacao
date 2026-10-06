import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import {
  ADVISOR_EVIDENCE_GATE_LIMITATION_TEXT,
  ADVISOR_EVIDENCE_SCOPE_LIMITATION_TEXT,
  ADVISOR_MAX_TOOL_ROUNDS,
  ADVISOR_PLATFORM_INSTRUCTIONS,
  AI_PROVIDER_MODEL_CATALOG,
  CASH_REALIZED_BREAKDOWN_TOOL,
  COMPARE_CASH_MONTHS_TOOL_NAME,
  canDeterministicPathFullyAnswer,
  createAdvisorAnalyticalToolExecutor,
  createAdvisorCashBreakdownService,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
  deriveQuestionAnalyticalDemand,
  detectExplicitCostCenterScope,
  deterministicPathCapabilityFromComposer,
  formatAdvisorUiContextBlock,
  gateAdvisorEvidenceBoundAnswer,
  inferEvidenceEntityScope,
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

const HOMOLOG_PHRASES = [
  'torrou dinheiro',
  'ficou estranho',
  'o que puxou',
  'tipo de coisa',
] as const;

const CC_CATALOG = [
  { id: 'cc-laranjeiras', name: 'Clínica Life Laranjeiras', code: 'LAR' },
  { id: 'cc-centro', name: 'Clínica Life Centro', code: 'CEN' },
] as const;

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(
  tenantId: string,
  monthKey: string,
  overrides: Partial<MonthlyCashFlow> = {},
): MonthlyCashFlow {
  return {
    tenantId,
    today: new Date('2026-10-06T00:00:00.000Z'),
    monthKey,
    from: new Date(`${monthKey}-01T00:00:00.000Z`),
    to: new Date(`${monthKey}-28T00:00:00.000Z`),
    costCenterCashSplit: true,
    realized: {
      inflows: dec('100000'),
      outflows: dec('80000'),
      result: dec('20000'),
    },
    realizedByCategory: {
      inflows: {
        total: dec('100000'),
        classified: dec('100000'),
        items: [
          { key: 'conv', name: 'Atendimentos Convênio', kind: 'category', amount: dec('70000') },
        ],
      },
      outflows: {
        total: dec('80000'),
        classified: dec('80000'),
        items: [
          { key: 'folha', name: 'Folha', kind: 'category', amount: dec('50000') },
          { key: 'aluguel', name: 'Aluguel', kind: 'category', amount: dec('30000') },
        ],
      },
    },
    expected: {
      receivables: dec('0'),
      payables: dec('0'),
      result: dec('0'),
    },
    overdue: {
      receivables: dec('0'),
      payables: dec('0'),
      ofMonth: { receivables: dec('0'), payables: dec('0') },
    },
    stock: {
      receivables: { open: null, overdue: null, dueToday: null, upcoming: null },
      payables: { open: null, overdue: null, dueToday: null, upcoming: null },
    },
    coverage: null,
    daily: { realized: [], expected: [] },
    ...overrides,
  };
}

function settings(): AiTenantSettingsRecord {
  const now = new Date('2026-10-06T12:00:00.000Z');
  return {
    id: 'set-a1',
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
    createdAt: new Date('2026-10-06T12:00:00.000Z'),
  };
}

function builtContext(monthKey = '2026-10'): AdvisorBuiltContext {
  return {
    tenantId: 'tenant-a',
    monthKey,
    blocks: [
      {
        type: 'PLATFORM_INSTRUCTIONS',
        content: ADVISOR_PLATFORM_INSTRUCTIONS,
        trustLevel: 'PLATFORM',
      },
      {
        type: 'UI_CONTEXT',
        content: formatAdvisorUiContextBlock({ selectedMonth: monthKey }),
        trustLevel: 'TENANT_CONFIG',
      },
      {
        type: 'FINANCIAL_FACTS',
        content: [
          'entityScope: TENANT',
          'costCenter: NONE',
          `monthKey=${monthKey}`,
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

function createA1Harness(options: {
  readonly openai: ReturnType<typeof createFakeIaProvider>;
  readonly execute?: SendAdvisorMessageDependencies['analyticalTools'];
  readonly cashComparison?: SendAdvisorMessageDependencies['cashComparison'];
  readonly withCostCenters?: boolean;
}) {
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let runSeq = 0;
  let msgSeq = 0;
  const conversationRow = conversation();

  const contextBuild = vi.fn(async (input: BuildAdvisorContextInput) => ({
    ...builtContext(input.monthKey ?? '2026-10'),
    monthKey: input.monthKey ?? '2026-10',
  }));

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
        const row = message(`msg-${++msgSeq}`, input.senderType, input.content, tenantId, conversationId);
        messages.push(row);
        return row;
      },
      async updateConversationTitle(tenantId, conversationId, title) {
        if (conversationRow.tenantId !== tenantId || conversationRow.id !== conversationId) {
          return null;
        }
        return { ...conversationRow, title };
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
      build: contextBuild,
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
    ...(options.withCostCenters === false
      ? {}
      : {
          dailyCashMovements: {
            details: {
              async getCashRealizedDayDetails() {
                throw new Error('day details não deveria rodar neste harness');
              },
            },
            costCenters: {
              async listByTenant(tenantId) {
                expect(tenantId).toBe('tenant-a');
                return CC_CATALOG.map((row) => ({ ...row, active: true }));
              },
            },
          },
        }),
  });

  return { send, messages, runs, contextBuild, openai: options.openai };
}

function scanProductionSourcesForPhrase(phrase: string): string[] {
  const roots = [
    join(process.cwd(), 'src/modules/advisor'),
    join(process.cwd(), 'src/infrastructure/ai'),
  ];
  const hits: string[] = [];
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.ts')) {
        continue;
      }
      const content = readFileSync(full, 'utf8');
      if (content.toLowerCase().includes(phrase.toLowerCase())) {
        hits.push(full);
      }
    }
  };
  for (const root of roots) {
    walk(root);
  }
  return hits;
}

describe('Fase A.1 — coverage, scope contract e provenance', () => {
  it('A) fast-path incompleto (billing tenant + CC + composição) cede ao agente', async () => {
    const demand = deriveQuestionAnalyticalDemand({
      content:
        'Unidade Alfa gastou mais em agosto do que em julho de 2026? E o que explica a diferença nas saídas?',
      comparison: true,
      catalog: [{ id: 'cc-alfa', name: 'Unidade Alfa', code: 'ALF' }],
    });
    expect(demand.explicitCostCenter.status).toBe('FOUND');
    expect(demand.wantsCompositionOrDriver || demand.wantsOutflow).toBe(true);
    expect(
      canDeterministicPathFullyAnswer({
        demand,
        path: deterministicPathCapabilityFromComposer({
          intentKind: 'MONTHLY_COMPARISON',
          toolName: COMPARE_CASH_MONTHS_TOOL_NAME,
          hasCostCenterInFacts: false,
        }),
      }),
    ).toBe(false);

    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'a1',
              name: 'compare_cash_cost_center',
              arguments: {
                monthKey: '2026-08',
                comparisonMonthKey: '2026-07',
                direction: 'OUTFLOW',
                costCenterQuery: 'Laranjeiras',
              },
            },
          ],
        },
        // Compare sozinho não completa COMPOSITION → completion CONTINUE.
        { text: 'Houve queda nas saídas; diferença R$ 1000.' },
        {
          toolCalls: [
            {
              id: 'a2',
              name: 'cash_realized_breakdown',
              arguments: {
                monthKey: '2026-08',
                direction: 'OUTFLOW',
                costCenterQuery: 'Laranjeiras',
              },
            },
          ],
        },
        { text: 'Composição oficial do centro: Folha R$ 50000.' },
      ],
    });
    const calls: string[] = [];
    const execute = vi.fn(async (input: {
      call: { id: string; name: string; arguments: Record<string, unknown> };
      questionScope?: { costCenterQuery?: string };
    }) => {
      expect(input.questionScope?.costCenterQuery).toBeTruthy();
      calls.push(input.call.name);
      if (input.call.name === 'compare_cash_cost_center') {
        return {
          id: input.call.id,
          name: input.call.name,
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            resolvedCostCenter: 'Clínica Life Laranjeiras',
            absoluteDelta: '-1000',
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
          resolvedCostCenter: 'Clínica Life Laranjeiras',
          categories: [{ label: 'Folha', amount: '50000', rank: 1 }],
        }),
      };
    });
    const compare = vi.fn(async () => {
      throw new Error('compare tenant-wide não deveria prefetchar com CC explícito');
    });
    const { send } = createA1Harness({
      openai,
      execute: {
        tools: [
          CASH_REALIZED_BREAKDOWN_TOOL,
          {
            name: 'compare_cash_cost_center',
            description: 'compare cc',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
        execute,
      },
      cashComparison: { compare },
    });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question:
        'Laranjeiras gastou mais em agosto do que em julho de 2026? E o que explica a diferença nas saídas?',
      monthKey: '2026-10',
      now: new Date('2026-10-06T18:00:00.000Z'),
    });
    expect(compare).not.toHaveBeenCalled();
    expect(calls).toEqual(['compare_cash_cost_center', 'cash_realized_breakdown']);
    expect(result.run).not.toBeNull();
    expect(openai.generateCalls[0]?.tools?.length).toBeGreaterThan(0);
    expect(result.consultantMessage.content).toContain('Folha');
  });

  it('B) fast-path completo homologado continua terminal (sem provider)', async () => {
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [{ text: 'não deveria chamar provider' }],
    });
    const breakdown = createAdvisorCashBreakdownService({
      cashFlow: {
        async getMonthlyCashFlow(input) {
          return flow(input.tenantId, input.monthKey ?? '2026-08');
        },
      },
      costCenters: {
        async listByTenant() {
          return CC_CATALOG.map((row) => ({ ...row, active: true }));
        },
      },
    });
    // Maior gasto CC usa plano composável / movements — aqui validamos coverage do path COST_CENTER.
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Qual foi meu maior gasto em Laranjeiras em agosto de 2026?',
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

    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: {
        async compare() {
          throw new Error('unused');
        },
      },
      cashBreakdown: breakdown,
    });
    createA1Harness({ openai, execute: executor });
    // Comparação billing fechada sem CC/composição permanece terminal via coverage.
    const closedDemand = deriveQuestionAnalyticalDemand({
      content: 'Compare o faturamento de julho e agosto de 2026',
      comparison: true,
      catalog: [...CC_CATALOG],
    });
    expect(
      canDeterministicPathFullyAnswer({
        demand: closedDemand,
        path: deterministicPathCapabilityFromComposer({
          intentKind: 'MONTHLY_COMPARISON',
          toolName: COMPARE_CASH_MONTHS_TOOL_NAME,
          hasCostCenterInFacts: false,
        }),
      }),
    ).toBe(true);
    expect(openai.generateCalls).toHaveLength(0);
  });

  it('C) escopo CC explícito + breakdown sem costCenterQuery → MISSING_REQUIRED_SCOPE', async () => {
    const cashFlowCalls: Array<{ costCenterId?: string }> = [];
    const breakdown = createAdvisorCashBreakdownService({
      cashFlow: {
        async getMonthlyCashFlow(input) {
          cashFlowCalls.push({ costCenterId: input.costCenterId });
          return flow(input.tenantId, input.monthKey ?? '2026-08');
        },
      },
      costCenters: {
        async listByTenant() {
          return CC_CATALOG.map((row) => ({ ...row, active: true }));
        },
      },
    });
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: {
        async compare() {
          throw new Error('unused');
        },
      },
      cashBreakdown: breakdown,
    });
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'c1',
              name: 'cash_realized_breakdown',
              arguments: { monthKey: '2026-08', direction: 'OUTFLOW' },
            },
          ],
        },
        {
          text: 'Não concluí a consulta com o escopo do centro.',
        },
      ],
    });
    const { send } = createA1Harness({ openai, execute: executor });
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual categoria mais consumiu caixa em Laranjeiras em agosto de 2026?',
      monthKey: '2026-10',
      now: new Date('2026-10-06T18:00:00.000Z'),
    });
    expect(cashFlowCalls).toHaveLength(0);
    const firstResult = openai.generateCalls[1]?.toolRounds?.[0]?.results[0]?.content ?? '';
    expect(firstResult).toContain('MISSING_REQUIRED_SCOPE');
    expect(firstResult).toContain('costCenterQuery');
  });

  it('D) provider corrige costCenterQuery no round seguinte após MISSING_REQUIRED_SCOPE', async () => {
    const cashFlowCalls: Array<{ costCenterId?: string }> = [];
    const breakdown = createAdvisorCashBreakdownService({
      cashFlow: {
        async getMonthlyCashFlow(input) {
          cashFlowCalls.push({ costCenterId: input.costCenterId });
          return flow(input.tenantId, input.monthKey ?? '2026-08', {
            realizedByCategory: {
              inflows: null,
              outflows: {
                total: dec('28000'),
                classified: dec('28000'),
                items: [
                  {
                    key: 'folha',
                    name: 'Folha',
                    kind: 'category',
                    amount: dec('28000'),
                  },
                ],
              },
            },
          });
        },
      },
      costCenters: {
        async listByTenant() {
          return CC_CATALOG.map((row) => ({ ...row, active: true }));
        },
      },
    });
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: {
        async compare() {
          throw new Error('unused');
        },
      },
      cashBreakdown: breakdown,
    });
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'd1',
              name: 'cash_realized_breakdown',
              arguments: { monthKey: '2026-08', direction: 'OUTFLOW' },
            },
          ],
        },
        {
          toolCalls: [
            {
              id: 'd2',
              name: 'cash_realized_breakdown',
              arguments: {
                monthKey: '2026-08',
                direction: 'OUTFLOW',
                costCenterQuery: 'Laranjeiras',
              },
            },
          ],
        },
        { text: 'No centro Laranjeiras a Folha liderou com R$ 28000.' },
      ],
    });
    const { send } = createA1Harness({ openai, execute: executor });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual categoria mais consumiu caixa em Laranjeiras em agosto de 2026?',
      monthKey: '2026-10',
      now: new Date('2026-10-06T18:00:00.000Z'),
    });
    expect(openai.generateCalls[1]?.toolRounds?.[0]?.results[0]?.content).toContain(
      'MISSING_REQUIRED_SCOPE',
    );
    expect(cashFlowCalls).toEqual([{ costCenterId: 'cc-laranjeiras' }]);
    expect(result.consultantMessage.content).toContain('28000');
  });

  it('E) FINANCIAL_FACTS TENANT não satisfaz resposta CC-scoped (instructions + provenance)', () => {
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toMatch(/entityScope=TENANT/i);
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toMatch(/MISSING_REQUIRED_SCOPE/);
    expect(inferEvidenceEntityScope('entityScope: TENANT\ncostCenter: NONE')).toBe('TENANT');
    expect(
      inferEvidenceEntityScope(
        JSON.stringify({
          entityScope: 'COST_CENTER',
          resolvedCostCenter: 'Clínica Life Laranjeiras',
        }),
      ),
    ).toBe('COST_CENTER');
  });

  it('F) evidence tenant-wide não autoriza cifra CC-scoped', () => {
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'Laranjeiras gastou R$ 51.568,60 em agosto.',
      evidenceItems: [
        {
          text: 'entityScope: TENANT\ncostCenter: NONE\ncash.realized.outflows: R$ 51.568,60',
          entityScope: 'TENANT',
          source: 'FINANCIAL_FACTS',
          resolvedCostCenter: 'NONE',
        },
      ],
      agentToolPath: false,
      requiredEntityScope: 'COST_CENTER',
      requiredCostCenterName: 'Clínica Life Laranjeiras',
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_SCOPE');
    expect(gated.text).toBe(ADVISOR_EVIDENCE_SCOPE_LIMITATION_TEXT);
  });

  it('G) evidence CC correto autoriza cifra scoped', () => {
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText:
        'No centro a Folha somou R$ 28.000,00 (53,56%). A diferença foi R$ 21.535,73 (-25,47%).',
      evidenceItems: [
        {
          text: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            resolvedCostCenter: 'Clínica Life Laranjeiras',
            absoluteDelta: '-21535.73',
            percentageDelta: '-25.472',
            categories: [
              { label: 'Folha', amount: '28000', sharePercent: '53.561728418565040975' },
            ],
          }),
          entityScope: 'COST_CENTER',
          source: 'TOOL_RESULT',
          resolvedCostCenter: 'Clínica Life Laranjeiras',
        },
      ],
      agentToolPath: true,
      requiredEntityScope: 'COST_CENTER',
      requiredCostCenterName: 'Clínica Life Laranjeiras',
    });
    expect(gated.ok).toBe(true);
    expect(gated.reason).toBe('OK');
  });

  it('H) pergunta composta pode executar compare → breakdown em rounds', async () => {
    const calls: string[] = [];
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'h1',
              name: 'compare_cash_cost_center',
              arguments: {
                monthKey: '2026-08',
                comparisonMonthKey: '2026-07',
                costCenterQuery: 'Laranjeiras',
                direction: 'OUTFLOW',
              },
            },
          ],
        },
        {
          toolCalls: [
            {
              id: 'h2',
              name: 'cash_realized_breakdown',
              arguments: {
                monthKey: '2026-08',
                direction: 'OUTFLOW',
                costCenterQuery: 'Laranjeiras',
              },
            },
          ],
        },
        { text: 'A diferença veio da Folha: R$ 50000 no breakdown oficial.' },
      ],
    });
    const { send } = createA1Harness({
      openai,
      execute: {
        tools: [
          CASH_REALIZED_BREAKDOWN_TOOL,
          {
            name: 'compare_cash_cost_center',
            description: 'compare cc',
            inputSchema: { type: 'object', properties: {} },
          },
        ],
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
                resolvedCostCenter: 'Clínica Life Laranjeiras',
                delta: '10000',
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
              resolvedCostCenter: 'Clínica Life Laranjeiras',
              categories: [{ label: 'Folha', amount: '50000', rank: 1 }],
            }),
          };
        },
      },
    });
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question:
        'Laranjeiras gastou mais em agosto do que em julho de 2026? E o que explica a diferença nas saídas?',
      monthKey: '2026-10',
      now: new Date('2026-10-06T18:00:00.000Z'),
    });
    expect(calls).toEqual(['compare_cash_cost_center', 'cash_realized_breakdown']);
    expect(result.consultantMessage.content).toContain('Folha');
  });

  it('I) limitação nominal sem autoridade não bloqueia investigação financeira', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'O que merece atenção nas saídas de Unidade Alfa em agosto de 2026?',
      comparison: false,
      catalog: [{ id: 'cc-alfa', name: 'Unidade Alfa', code: 'ALF' }],
    });
    expect(demand.explicitCostCenter.status).toBe('FOUND');
    expect(demand.wantsOutflow || demand.wantsOpenInvestigation).toBe(true);
    expect(
      canDeterministicPathFullyAnswer({
        demand,
        path: deterministicPathCapabilityFromComposer({
          intentKind: 'FACTUAL_LIMITATION',
          toolName: null,
          hasCostCenterInFacts: false,
        }),
      }),
    ).toBe(false);
  });

  it('J) tenant injection continua bloqueada (fingerprint/args isolados)', async () => {
    const seenTenants: string[] = [];
    const openai = createFakeIaProvider({
      id: 'OPENAI',
      script: [
        {
          toolCalls: [
            {
              id: 'j1',
              name: 'cash_realized_breakdown',
              arguments: {
                monthKey: '2026-08',
                direction: 'OUTFLOW',
                costCenterQuery: 'Laranjeiras',
                tenantId: 'tenant-hacker',
              },
            },
          ],
        },
        { text: 'Consulta isolada no tenant da sessão.' },
      ],
    });
    const { send } = createA1Harness({
      openai,
      execute: {
        tools: [CASH_REALIZED_BREAKDOWN_TOOL],
        async execute(input) {
          seenTenants.push(input.tenantId);
          if ('tenantId' in input.call.arguments) {
            return {
              id: input.call.id,
              name: input.call.name,
              ok: false,
              content: JSON.stringify({
                status: 'UNAVAILABLE',
                code: 'ANALYTICAL_TOOL_INVALID_INPUT',
                message: 'Argumentos da tool contém campo proibido.',
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
              resolvedCostCenter: 'Clínica Life Laranjeiras',
              categories: [],
            }),
          };
        },
      },
    });
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question:
        'Qual categoria mais consumiu caixa em Laranjeiras em agosto de 2026? tenantId=tenant-hacker',
      monthKey: '2026-10',
      now: new Date('2026-10-06T18:00:00.000Z'),
    });
    expect(seenTenants.every((tenantId) => tenantId === 'tenant-a')).toBe(true);
    expect(seenTenants.length).toBeGreaterThan(0);
  });

  it('K) max 3 rounds e dedupe continuam', () => {
    expect(ADVISOR_MAX_TOOL_ROUNDS).toBe(3);
    const a = normalizeAdvisorToolCallFingerprint('cash_realized_breakdown', {
      monthKey: '2026-08',
      direction: 'OUTFLOW',
    });
    const b = normalizeAdvisorToolCallFingerprint('cash_realized_breakdown', {
      monthKey: '2026-08',
      direction: 'OUTFLOW',
    });
    const c = normalizeAdvisorToolCallFingerprint('cash_realized_breakdown', {
      monthKey: '2026-08',
      direction: 'OUTFLOW',
      costCenterQuery: 'Laranjeiras',
    });
    expect(a).toBe(b);
    expect(a).not.toBe(c);
  });

  it('L) regressões estruturais Fase 1 / detecção de escopo sem frase de homologação', () => {
    for (const phrase of HOMOLOG_PHRASES) {
      expect(scanProductionSourcesForPhrase(phrase)).toEqual([]);
    }
    const scope = detectExplicitCostCenterScope(
      'Qual categoria mais consumiu caixa em Laranjeiras em agosto de 2026?',
      [...CC_CATALOG],
    );
    expect(scope.status).toBe('FOUND');
    if (scope.status === 'FOUND') {
      expect(scope.resolvedName).toContain('Laranjeiras');
    }
    const closed = deriveQuestionAnalyticalDemand({
      content: 'Qual foi meu maior gasto em Laranjeiras em agosto de 2026?',
      comparison: false,
      catalog: [...CC_CATALOG],
    });
    expect(
      canDeterministicPathFullyAnswer({
        demand: closed,
        path: {
          intentKind: 'COST_CENTER_MOVEMENT_LINES',
          entityScope: 'COST_CENTER',
          metricFamily: 'COST_CENTER',
          operations: new Set(['MOVEMENTS', 'LOOKUP']),
        },
      }),
    ).toBe(true);
    expect(ADVISOR_EVIDENCE_GATE_LIMITATION_TEXT.length).toBeGreaterThan(20);
  });
});
