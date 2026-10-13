/**
 * C.2.2 — Integridade semântica das métricas (BILLING ≠ INFLOW ≠ CASH_RESULT ≠ lucro).
 */
import { describe, expect, it } from 'vitest';

import {
  canDeterministicPathFullyAnswer,
  deriveQuestionAnalyticalDemand,
} from '../src/modules/advisor/domain/advisor-question-scope.js';
import {
  analyzeToolEvidence,
  deriveAnalyticalObligations,
  evaluateAnalyticalCompletion,
} from '../src/modules/advisor/domain/advisor-analytical-completion.js';
import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { AI_PROVIDER_MODEL_CATALOG } from '../src/modules/advisor/domain/ai-provider-models.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
} from '../src/modules/advisor/domain/types.js';
import { createAllowAllConsultantRateLimiter } from '../src/modules/advisor/services/consultant-rate-limiter.js';
import { createSendAdvisorMessage } from '../src/modules/advisor/services/send-advisor-message.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { Prisma } from '../src/generated/prisma/client.js';

const NOW = new Date('2026-10-06T15:00:00.000Z');

const CATALOG = [
  { id: 'cc-jac', name: 'Clínica Life Jacaraípe', code: null, active: true },
  { id: 'cc-laranj', name: 'Clínica Life Laranjeiras', code: null, active: true },
];

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(input: {
  readonly monthKey: string;
  readonly inflows: string;
  readonly receivables: string;
  readonly costCenterCashSplit?: boolean;
}): MonthlyCashFlow {
  const split = input.costCenterCashSplit ?? true;
  return {
    monthKey: input.monthKey,
    costCenterCashSplit: split,
    realized: {
      inflows: split ? money(input.inflows) : null,
      outflows: split ? money('0') : null,
      result: split ? money(input.inflows) : null,
    },
    expected: {
      receivables: split ? money(input.receivables) : null,
      payables: split ? money('0') : null,
      result: split ? money(input.receivables) : null,
    },
    realizedByCategory: { inflows: null, outflows: null },
  } as MonthlyCashFlow;
}

describe('C.2.2 demanda semântica', () => {
  it('T1 — faturamento → wantsBilling, não wantsInflow', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Qual foi o faturamento de outubro?',
      comparison: false,
    });
    expect(demand.wantsBilling).toBe(true);
    expect(demand.wantsInflow).toBe(false);
    expect(deriveAnalyticalObligations(demand)).toContain('BILLING');
    expect(deriveAnalyticalObligations(demand)).not.toContain('VALUE');
  });

  it('T2/T3 — faturamento por centro e série', () => {
    const month = deriveQuestionAnalyticalDemand({
      content: 'Qual foi o faturamento de Jacaraípe?',
      comparison: false,
      catalog: CATALOG,
    });
    expect(month.wantsBilling).toBe(true);
    expect(month.wantsInflow).toBe(false);
    expect(month.explicitCostCenter.status).toBe('FOUND');
    expect(deriveAnalyticalObligations(month)).toEqual(
      expect.arrayContaining(['ENTITY_SCOPE', 'BILLING']),
    );

    const series = deriveQuestionAnalyticalDemand({
      content: 'Faturamento de Laranjeiras nos últimos 3 meses',
      comparison: false,
      catalog: CATALOG,
    });
    expect(series.wantsBilling).toBe(true);
    expect(series.wantsInflow).toBe(false);
  });

  it('T4/T5 — entradas / recebimentos → INFLOW, não BILLING', () => {
    const entered = deriveQuestionAnalyticalDemand({
      content: 'Quanto entrou no caixa em outubro?',
      comparison: false,
    });
    expect(entered.wantsInflow).toBe(true);
    expect(entered.wantsBilling).toBe(false);

    const receipts = deriveQuestionAnalyticalDemand({
      content: 'Quais foram os maiores recebimentos?',
      comparison: false,
    });
    expect(receipts.wantsInflow).toBe(true);
    expect(receipts.wantsBilling).toBe(false);
    expect(deriveAnalyticalObligations(receipts)).toContain('VALUE');
    expect(deriveAnalyticalObligations(receipts)).not.toContain('BILLING');
  });

  it('T6 — faturamento e recebimentos: duas métricas', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Compare faturamento e recebimentos realizados de outubro',
      comparison: true,
    });
    expect(demand.wantsBilling).toBe(true);
    expect(demand.wantsInflow).toBe(true);
    const obligations = deriveAnalyticalObligations(demand);
    expect(obligations).toEqual(expect.arrayContaining(['BILLING', 'VALUE', 'COMPARISON']));
    expect(
      canDeterministicPathFullyAnswer({
        demand,
        path: {
          intentKind: 'BILLING_MONTH',
          entityScope: 'TENANT',
          metricFamily: 'BILLING',
          operations: new Set(['VALUE']),
        },
      }),
    ).toBe(false);
  });

  it('T7/T8 — a receber e resultado de caixa não colapsam em BILLING', () => {
    const receivable = deriveQuestionAnalyticalDemand({
      content: 'Quanto temos a receber?',
      comparison: false,
    });
    expect(receivable.wantsBilling).toBe(false);

    const cashResult = deriveQuestionAnalyticalDemand({
      content: 'Qual foi o resultado de caixa?',
      comparison: false,
    });
    expect(cashResult.wantsBilling).toBe(false);
    expect(cashResult.wantsAccountingProfit).toBe(false);
  });

  it('T9 — lucro contábil não é CASH_RESULT', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Qual foi o lucro contábil?',
      comparison: false,
    });
    expect(demand.wantsAccountingProfit).toBe(true);
    expect(
      canDeterministicPathFullyAnswer({
        demand,
        path: {
          intentKind: 'COST_CENTER_LOOKUP',
          entityScope: 'TENANT',
          metricFamily: 'COST_CENTER',
          operations: new Set(['LOOKUP']),
        },
      }),
    ).toBe(false);
  });

  it('BILLING path aceita só capability BILLING; lookup CC não fecha faturamento', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Qual foi o faturamento de Jacaraípe em setembro?',
      comparison: false,
      catalog: CATALOG,
    });
    expect(
      canDeterministicPathFullyAnswer({
        demand,
        path: {
          intentKind: 'BILLING_MONTH',
          entityScope: 'COST_CENTER',
          metricFamily: 'BILLING',
          operations: new Set(['VALUE']),
        },
      }),
    ).toBe(true);
    expect(
      canDeterministicPathFullyAnswer({
        demand,
        path: {
          intentKind: 'COST_CENTER_LOOKUP',
          entityScope: 'COST_CENTER',
          metricFamily: 'COST_CENTER',
          operations: new Set(['LOOKUP']),
        },
      }),
    ).toBe(false);
  });

  it('T13 — evidência de lookup INFLOW não satisfaz obrigação BILLING', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Qual foi o faturamento de Jacaraípe?',
      comparison: false,
      catalog: CATALOG,
    });
    const required = deriveAnalyticalObligations(demand);
    const lookup = analyzeToolEvidence(
      {
        toolName: 'cash_cost_center_lookup',
        ok: true,
        content: JSON.stringify({
          status: 'OK',
          entityScope: 'COST_CENTER',
          costCenter: { name: 'Clínica Life Jacaraípe', amount: '100' },
        }),
      },
      true,
    );
    expect(lookup.satisfies).toContain('VALUE');
    expect(lookup.satisfies).not.toContain('BILLING');

    const completion = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [
        {
          toolName: 'cash_cost_center_lookup',
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            entityScope: 'COST_CENTER',
            costCenter: { name: 'Clínica Life Jacaraípe' },
          }),
        },
      ],
      availableToolNames: ['cash_cost_center_lookup', 'cash_movement_lines'],
      roundsRemaining: 0,
    });
    expect(completion.missingObligations).toContain('BILLING');
    expect(completion.decision).not.toBe('ANSWER');
  });
});

describe('C.2.2 envio — identidade preservada', () => {
  it('T1 — faturamento consolidado usa BILLING', async () => {
    const harness = createHarness({
      byKey: {
        '2026-10': flow({ monthKey: '2026-10', inflows: '40', receivables: '60' }),
      },
    });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de outubro?',
      now: NOW,
    });
    expect(result.run).toBeNull();
    expect(result.factualAnswer?.intentKind).toMatch(/BILLING/);
    expect(result.consultantMessage.content).toMatch(/faturamento/i);
    expect(result.consultantMessage.content).toContain('100,00');
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('T2/T13 — faturamento por centro não vira INFLOW', async () => {
    const harness = createHarness({
      byKey: {
        '2026-10': flow({ monthKey: '2026-10', inflows: '9000', receivables: '1000' }),
      },
      byCenter: {
        'cc-jac': {
          '2026-10': flow({ monthKey: '2026-10', inflows: '70', receivables: '30' }),
        },
      },
    });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Jacaraípe?',
      now: NOW,
    });
    expect(result.run).toBeNull();
    expect(result.factualAnswer?.factKind).toMatch(/BILLING_COST_CENTER/);
    expect(result.consultantMessage.content).toMatch(/faturamento oficial/i);
    expect(result.consultantMessage.content).toContain('100,00');
    expect(result.consultantMessage.content).not.toContain('10.000,00');
    expect(result.consultantMessage.content).not.toMatch(/entradas realizadas de caixa/i);
  });

  it('T3 — série por centro', async () => {
    const harness = createHarness({
      byKey: {},
      byCenter: {
        'cc-laranj': {
          '2026-08': flow({ monthKey: '2026-08', inflows: '10', receivables: '0' }),
          '2026-09': flow({ monthKey: '2026-09', inflows: '20', receivables: '0' }),
          '2026-10': flow({ monthKey: '2026-10', inflows: '30', receivables: '0' }),
        },
      },
    });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Faturamento de Laranjeiras nos últimos 3 meses',
      now: NOW,
    });
    expect(result.run).toBeNull();
    expect(result.consultantMessage.content).toContain('10,00');
    expect(result.consultantMessage.content).toContain('20,00');
    expect(result.consultantMessage.content).toContain('30,00');
  });

  it('T9 — lucro contábil → limitação, não resultado de caixa', async () => {
    const harness = createHarness({ byKey: {} });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o lucro contábil?',
      now: NOW,
    });
    expect(result.run).toBeNull();
    expect(result.factualAnswer?.intentKind).toBe('FACTUAL_LIMITATION');
    expect(result.consultantMessage.content).toMatch(/lucro contábil/i);
    expect(result.consultantMessage.content).toMatch(/não substitui|resultado de caixa/i);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('T10 — rateio indisponível → UNAVAILABLE, não INFLOW', async () => {
    const harness = createHarness({
      byKey: {},
      byCenter: {
        'cc-jac': {
          '2026-10': flow({
            monthKey: '2026-10',
            inflows: '999',
            receivables: '999',
            costCenterCashSplit: false,
          }),
        },
      },
    });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Jacaraípe em outubro?',
      now: NOW,
    });
    expect(result.run).toBeNull();
    expect(result.consultantMessage.content).toMatch(/indisponível|rateio/i);
    expect(result.consultantMessage.content).not.toContain('999');
    expect(result.consultantMessage.content).not.toMatch(/entradas realizadas/i);
  });

  it('T11 — faturamento por CC não vira consolidado', async () => {
    const harness = createHarness({
      byKey: {
        '2026-09': flow({ monthKey: '2026-09', inflows: '5000', receivables: '0' }),
      },
      byCenter: {
        'cc-jac': {
          '2026-09': flow({ monthKey: '2026-09', inflows: '80', receivables: '20' }),
        },
      },
    });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Jacaraípe em setembro?',
      now: NOW,
    });
    expect(result.consultantMessage.content).toContain('100,00');
    expect(result.consultantMessage.content).not.toContain('5.000,00');
  });
});

function createHarness(input: {
  readonly byKey: Record<string, MonthlyCashFlow>;
  readonly byCenter?: Record<string, Record<string, MonthlyCashFlow>>;
}) {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'prosa inventada' });
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
    startedAt: NOW,
    lastMessageAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
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
    createdAt: NOW,
    updatedAt: NOW,
  };

  const cashFlow = {
    async getMonthlyCashFlow(args: {
      tenantId: string;
      monthKey?: string;
      costCenterId?: string;
    }) {
      const monthKey = args.monthKey ?? '2026-10';
      if (args.tenantId !== 'tenant-a') {
        return flow({ monthKey, inflows: '0', receivables: '0', costCenterCashSplit: false });
      }
      if (args.costCenterId !== undefined) {
        return (
          input.byCenter?.[args.costCenterId]?.[monthKey] ??
          flow({ monthKey, inflows: '0', receivables: '0', costCenterCashSplit: false })
        );
      }
      return (
        input.byKey[monthKey] ??
        flow({ monthKey, inflows: '0', receivables: '0' })
      );
    },
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
          return { ...conversationRow };
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
          createdAt: NOW,
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
      async saveAnalyticalContext() {
        return;
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
          createdAt: NOW,
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
    monthlyPlanning: {
      cashFlow: cashFlow as never,
      revenueGoals: {
        async findByTenantMonth() {
          return null;
        },
        async listByTenantMonths() {
          return [];
        },
      } as never,
      expenseCeilings: {
        async findByTenantMonth() {
          return null;
        },
      } as never,
    },
    dailyCashMovements: {
      details: {
        async getCashRealizedDayDetails() {
          throw new Error('não usado');
        },
      },
      costCenters: {
        async listByTenant(tenantId: string) {
          return tenantId === 'tenant-a' ? CATALOG : [];
        },
      },
    },
    analyticalTools: {
      tools: [],
      async execute() {
        throw new Error('tool não deveria ser chamada');
      },
    },
    analyticalResults: {
      async record() {
        return { id: 'trail-1' };
      },
    },
  });

  return { send, openai };
}
