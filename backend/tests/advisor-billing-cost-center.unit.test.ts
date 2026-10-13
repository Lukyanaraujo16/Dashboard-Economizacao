/**
 * C.2.1 — BILLING × COST_CENTER (mês e série).
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { monthlyBilling } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import {
  buildBillingCostCenterMonthQuery,
  buildBillingCostCenterSeriesQuery,
} from '../src/modules/advisor/domain/analytical/build-analytical-query-from-tool.js';
import { executeAnalyticalQuery } from '../src/modules/advisor/domain/analytical/execute-analytical-query.js';
import { validateAnalyticalCapability } from '../src/modules/advisor/domain/analytical/validate-analytical-capability.js';
import { listBillingSeriesMonthKeys } from '../src/modules/advisor/domain/billing-month-series.js';
import {
  composeAdvisorBillingCostCenterMonthAnswer,
  composeAdvisorBillingCostCenterSeriesAnswer,
} from '../src/modules/advisor/domain/compose-advisor-billing-answer.js';
import {
  resolveAdvisorBillingIntent,
  resolveAdvisorBillingIntentForCostCenter,
} from '../src/modules/advisor/domain/resolve-advisor-billing-intent.js';
import { runAdvisorBillingAnswer } from '../src/modules/advisor/domain/run-advisor-billing-answer.js';
import { runAdvisorBillingCostCenterAnswer } from '../src/modules/advisor/domain/run-advisor-billing-cost-center-answer.js';
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

const NOW = new Date('2026-10-06T15:00:00.000Z');

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(input: {
  readonly monthKey: string;
  readonly inflows: string | null;
  readonly receivables: string | null;
  readonly costCenterCashSplit?: boolean;
}): MonthlyCashFlow {
  const split = input.costCenterCashSplit ?? true;
  const inflows = !split || input.inflows === null ? null : money(input.inflows);
  const receivables = !split || input.receivables === null ? null : money(input.receivables);
  return {
    monthKey: input.monthKey,
    costCenterCashSplit: split,
    realized: {
      inflows,
      outflows: split ? money('0') : null,
      result: inflows,
    },
    expected: {
      receivables,
      payables: split ? money('0') : null,
      result: receivables,
    },
    realizedByCategory: { inflows: null, outflows: null },
  } as MonthlyCashFlow;
}

function cashFlowService(input: {
  readonly byKey: Record<string, MonthlyCashFlow>;
  readonly byCenter?: Record<string, Record<string, MonthlyCashFlow>>;
  readonly tenantId?: string;
}) {
  const tenantId = input.tenantId ?? 'tenant-a';
  const calls: Array<{ tenantId: string; monthKey?: string; costCenterId?: string }> = [];
  return {
    calls,
    service: {
      async getMonthlyCashFlow(args: {
        tenantId: string;
        monthKey?: string;
        costCenterId?: string;
      }) {
        calls.push({
          tenantId: args.tenantId,
          monthKey: args.monthKey,
          costCenterId: args.costCenterId,
        });
        if (args.tenantId !== tenantId) {
          return flow({
            monthKey: args.monthKey ?? '2026-10',
            inflows: null,
            receivables: null,
          });
        }
        const monthKey = args.monthKey ?? '2026-10';
        if (args.costCenterId !== undefined) {
          const centerRows = input.byCenter?.[args.costCenterId];
          return (
            centerRows?.[monthKey] ??
            flow({ monthKey, inflows: null, receivables: null, costCenterCashSplit: false })
          );
        }
        return (
          input.byKey[monthKey] ??
          flow({ monthKey, inflows: null, receivables: null })
        );
      },
    },
  };
}

function costCentersRepo(
  centers: Array<{ id: string; name: string; active?: boolean }>,
  tenantId = 'tenant-a',
) {
  return {
    async listByTenant(requested: string) {
      if (requested !== tenantId) {
        return [];
      }
      return centers.map((center) => ({
        id: center.id,
        name: center.name,
        code: null,
        active: center.active ?? true,
      }));
    },
  };
}

describe('C.2.1 capabilities BILLING × COST_CENTER', () => {
  it('T1 — publica e valida billing.cost_center.month', () => {
    const query = buildBillingCostCenterMonthQuery({
      monthKey: '2026-09',
      costCenterQuery: 'Jacaraípe',
    });
    const validation = validateAnalyticalCapability(query);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.capability.key).toBe('billing.cost_center.month');
      expect(validation.capability.metric).toBe('BILLING');
      expect(validation.capability.dimensions).toContain('COST_CENTER');
    }
  });

  it('T2/T11/T12 — série de três meses ordenada e no limite', async () => {
    const keys = listBillingSeriesMonthKeys('2026-10', 3);
    expect(keys).toEqual(['2026-08', '2026-09', '2026-10']);
    const query = buildBillingCostCenterSeriesQuery({
      endMonthKey: '2026-10',
      count: 3,
      costCenterQuery: 'Laranjeiras',
    });
    const validation = validateAnalyticalCapability(query);
    expect(validation.ok).toBe(true);
    if (validation.ok) {
      expect(validation.capability.key).toBe('billing.cost_center.series.months');
    }

    const loaded = cashFlowService({
      byKey: {},
      byCenter: {
        'cc-laranj': {
          '2026-08': flow({ monthKey: '2026-08', inflows: '100', receivables: '10' }),
          '2026-09': flow({ monthKey: '2026-09', inflows: '200', receivables: '20' }),
          '2026-10': flow({ monthKey: '2026-10', inflows: '300', receivables: '30' }),
        },
      },
    });
    const outcome = await executeAnalyticalQuery({
      runtime: {
        tenantId: 'tenant-a',
        now: NOW,
        planningCashFlow: loaded.service,
        costCenters: costCentersRepo([{ id: 'cc-laranj', name: 'Clínica Life Laranjeiras' }]),
      },
      query,
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.legacyFact.costCenterName).toBe('Clínica Life Laranjeiras');
    expect(outcome.legacyFact.months).toEqual([
      { monthKey: '2026-08', billing: '110', available: true, costCenterCashSplit: true },
      { monthKey: '2026-09', billing: '220', available: true, costCenterCashSplit: true },
      { monthKey: '2026-10', billing: '330', available: true, costCenterCashSplit: true },
    ]);
    expect(loaded.calls.map((call) => call.monthKey)).toEqual(keys);
    expect(loaded.calls.every((call) => call.costCenterId === 'cc-laranj')).toBe(true);

    const limited = await runAdvisorBillingCostCenterAnswer({
      content: 'média de faturamento de Laranjeiras nos últimos 99 meses',
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      costCenterQuery: 'Laranjeiras',
      now: NOW,
      cashFlow: loaded.service,
      costCenters: costCentersRepo([{ id: 'cc-laranj', name: 'Clínica Life Laranjeiras' }]),
    });
    expect(limited?.answer).toMatch(/vai até/i);
    expect(limited?.capabilityKey).toBe('billing.cost_center.series.months');
  });

  it('T3/T4/T5 — paridade monthlyBilling e não devolve tenant-wide', async () => {
    const centerFlow = flow({ monthKey: '2026-09', inflows: '80', receivables: '20' });
    const companyFlow = flow({ monthKey: '2026-09', inflows: '5000', receivables: '1000' });
    expect(monthlyBilling(centerFlow)?.toString()).toBe('100');
    const loaded = cashFlowService({
      byKey: { '2026-09': companyFlow },
      byCenter: { 'cc-jac': { '2026-09': centerFlow } },
    });
    const outcome = await executeAnalyticalQuery({
      runtime: {
        tenantId: 'tenant-a',
        now: NOW,
        planningCashFlow: loaded.service,
        costCenters: costCentersRepo([{ id: 'cc-jac', name: 'Clínica Life Jacaraípe' }]),
      },
      query: buildBillingCostCenterMonthQuery({
        monthKey: '2026-09',
        costCenterQuery: 'Jacaraípe',
      }),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.legacyFact.billing).toBe('100');
    expect(outcome.legacyFact.billing).not.toBe('6000');
    expect(loaded.calls).toEqual([
      { tenantId: 'tenant-a', monthKey: '2026-09', costCenterId: 'cc-jac' },
    ]);
  });

  it('T6/T7 — centro inexistente e ambíguo', async () => {
    const loaded = cashFlowService({ byKey: {} });
    const notFound = await executeAnalyticalQuery({
      runtime: {
        tenantId: 'tenant-a',
        planningCashFlow: loaded.service,
        costCenters: costCentersRepo([{ id: 'cc-a', name: 'Unidade Alfa' }]),
      },
      query: buildBillingCostCenterMonthQuery({
        monthKey: '2026-09',
        costCenterQuery: 'Fantasma',
      }),
    });
    expect(notFound.ok).toBe(true);
    if (notFound.ok) {
      expect(notFound.legacyFact.status).toBe('NOT_FOUND');
      expect(composeAdvisorBillingCostCenterMonthAnswer(notFound.legacyFact)).toMatch(
        /não encontrei/i,
      );
    }
    expect(loaded.calls).toHaveLength(0);

    const ambiguous = await executeAnalyticalQuery({
      runtime: {
        tenantId: 'tenant-a',
        planningCashFlow: loaded.service,
        costCenters: costCentersRepo([
          { id: 'cc-1', name: 'Unidade Norte' },
          { id: 'cc-2', name: 'Unidade Sul' },
        ]),
      },
      query: buildBillingCostCenterMonthQuery({
        monthKey: '2026-09',
        costCenterQuery: 'Unidade',
      }),
    });
    expect(ambiguous.ok).toBe(true);
    if (ambiguous.ok) {
      expect(ambiguous.legacyFact.status).toBe('AMBIGUOUS');
    }
  });

  it('T8 — isolamento entre tenants', async () => {
    const loaded = cashFlowService({
      byKey: {},
      byCenter: {
        'cc-a': { '2026-09': flow({ monthKey: '2026-09', inflows: '10', receivables: '0' }) },
      },
      tenantId: 'tenant-a',
    });
    const outcome = await executeAnalyticalQuery({
      runtime: {
        tenantId: 'tenant-b',
        planningCashFlow: loaded.service,
        costCenters: costCentersRepo([{ id: 'cc-a', name: 'Jacaraípe' }], 'tenant-a'),
      },
      query: buildBillingCostCenterMonthQuery({
        monthKey: '2026-09',
        costCenterQuery: 'Jacaraípe',
      }),
    });
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.legacyFact.status).toBe('NOT_FOUND');
    }
  });

  it('T9/T10 — rateio indisponível / multi parcial → UNAVAILABLE sem aproximação', async () => {
    const loaded = cashFlowService({
      byKey: {},
      byCenter: {
        'cc-a': {
          '2026-09': flow({
            monthKey: '2026-09',
            inflows: '999',
            receivables: '999',
            costCenterCashSplit: false,
          }),
        },
      },
    });
    const outcome = await executeAnalyticalQuery({
      runtime: {
        tenantId: 'tenant-a',
        planningCashFlow: loaded.service,
        costCenters: costCentersRepo([{ id: 'cc-a', name: 'Centro A' }]),
      },
      query: buildBillingCostCenterMonthQuery({
        monthKey: '2026-09',
        costCenterQuery: 'Centro A',
      }),
    });
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) {
      return;
    }
    expect(outcome.legacyFact.status).toBe('UNAVAILABLE');
    expect(outcome.legacyFact.billing).toBeNull();
    const answer = composeAdvisorBillingCostCenterMonthAnswer(outcome.legacyFact);
    expect(answer).toMatch(/indisponível|rateio/i);
    expect(answer).not.toContain('999');
  });

  it('T13 — faturamento não é composto como INFLOW', () => {
    const answer = composeAdvisorBillingCostCenterMonthAnswer({
      factKind: 'BILLING_COST_CENTER_MONTH',
      status: 'OK',
      monthKey: '2026-09',
      costCenterName: 'Jacaraípe',
      billing: '150.00',
    });
    expect(answer).toContain('Faturamento oficial');
    expect(answer).not.toMatch(/entradas realizadas|INFLOW|recebimentos realizados/i);
  });

  it('T14/T15 — intent consolidado vs centro', () => {
    expect(resolveAdvisorBillingIntent('Qual foi o faturamento em setembro?')).toEqual({
      kind: 'MONTH_VALUE',
    });
    expect(
      resolveAdvisorBillingIntent('Quero o faturamento de Laranjeiras nos últimos três meses.'),
    ).toEqual({ kind: 'MONTH_SERIES', count: 3, wantsAverage: false });
    expect(
      resolveAdvisorBillingIntent('Qual foi o faturamento do centro Jacaraípe em setembro?'),
    ).toBeNull();
    expect(
      resolveAdvisorBillingIntentForCostCenter(
        'Qual foi o faturamento do centro Jacaraípe em setembro?',
      ),
    ).toEqual({ kind: 'MONTH_VALUE' });
  });

  it('T16 — monthlyBilling permanece a fórmula homologada', () => {
    const source = readFileSync(
      new URL('../src/modules/analytics/domain/monthly-cash-flow.ts', import.meta.url),
      'utf8',
    );
    expect(source).toMatch(
      /return input\.inflows\.plus\(input\.expectedReceivables\)|return flow\.realized\.inflows\.plus\(flow\.expected\.receivables\)/,
    );
    const sample = flow({ monthKey: '2026-01', inflows: '10', receivables: '5' });
    expect(monthlyBilling(sample)?.toString()).toBe('15');
  });
});

describe('C.2.1 envio — proteção tenant-wide e INFLOW', () => {
  it('T1/T15 — faturamento mensal por centro usa capability CC', async () => {
    const loaded = cashFlowService({
      byKey: {
        '2026-09': flow({ monthKey: '2026-09', inflows: '9000', receivables: '1000' }),
      },
      byCenter: {
        'cc-jac': {
          '2026-09': flow({ monthKey: '2026-09', inflows: '80', receivables: '20' }),
        },
      },
    });
    const harness = createHarness({
      cashFlow: loaded.service,
      centers: [{ id: 'cc-jac', name: 'Clínica Life Jacaraípe' }],
    });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Jacaraípe em setembro?',
      now: NOW,
    });
    expect(result.run).toBeNull();
    expect(result.factualAnswer?.providerCalled).toBe(false);
    expect(result.consultantMessage.content).toContain('100,00');
    expect(result.consultantMessage.content).toMatch(/faturamento oficial/i);
    expect(result.consultantMessage.content).not.toContain('10.000,00');
    expect(result.consultantMessage.content).not.toMatch(/entradas realizadas de caixa/i);
    expect(loaded.calls.some((call) => call.costCenterId === 'cc-jac')).toBe(true);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('T2 — série de três meses por centro', async () => {
    const loaded = cashFlowService({
      byKey: {},
      byCenter: {
        'cc-laranj': {
          '2026-08': flow({ monthKey: '2026-08', inflows: '100', receivables: '0' }),
          '2026-09': flow({ monthKey: '2026-09', inflows: '200', receivables: '0' }),
          '2026-10': flow({ monthKey: '2026-10', inflows: '300', receivables: '0' }),
        },
      },
    });
    const harness = createHarness({
      cashFlow: loaded.service,
      centers: [{ id: 'cc-laranj', name: 'Clínica Life Laranjeiras' }],
    });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quero o faturamento de Laranjeiras nos últimos três meses.',
      now: NOW,
    });
    expect(result.run).toBeNull();
    expect(result.consultantMessage.content).toContain('100,00');
    expect(result.consultantMessage.content).toContain('200,00');
    expect(result.consultantMessage.content).toContain('300,00');
    expect(result.factualAnswer?.factKind).toMatch(/BILLING_COST_CENTER/);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('T14 — sem centro continua billing consolidado', async () => {
    const loaded = cashFlowService({
      byKey: {
        '2026-10': flow({ monthKey: '2026-10', inflows: '50', receivables: '50' }),
      },
    });
    const company = await runAdvisorBillingAnswer({
      content: 'Como está meu faturamento este mês?',
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      now: NOW,
      cashFlow: loaded.service,
    });
    expect(company?.capabilityKey).toBe('billing.value.month');
    expect(company?.answer).toContain('100,00');
    expect(loaded.calls[0]?.costCenterId).toBeUndefined();
  });

  it('T6 — centro inexistente não cai no consolidado', async () => {
    const loaded = cashFlowService({
      byKey: {
        '2026-09': flow({ monthKey: '2026-09', inflows: '5000', receivables: '0' }),
      },
    });
    const harness = createHarness({
      cashFlow: loaded.service,
      centers: [{ id: 'cc-a', name: 'Unidade Alfa' }],
    });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Unidade Inexistente em setembro?',
      now: NOW,
    });
    expect(result.consultantMessage.content).toMatch(/não encontrei/i);
    expect(result.consultantMessage.content).not.toContain('5.000,00');
    expect(loaded.calls).toHaveLength(0);
  });

  it('T13 — run CC não usa INFLOW lookup', async () => {
    const loaded = cashFlowService({
      byKey: {},
      byCenter: {
        'cc-jac': {
          '2026-09': flow({ monthKey: '2026-09', inflows: '40', receivables: '10' }),
        },
      },
    });
    const result = await runAdvisorBillingCostCenterAnswer({
      content: 'Qual foi o faturamento de Jacaraípe em setembro?',
      tenantId: 'tenant-a',
      monthKey: '2026-09',
      costCenterQuery: 'Jacaraípe',
      now: NOW,
      cashFlow: loaded.service,
      costCenters: costCentersRepo([{ id: 'cc-jac', name: 'Clínica Life Jacaraípe' }]),
    });
    expect(result?.capabilityKey).toBe('billing.cost_center.month');
    expect(result?.answer).toContain('Faturamento oficial');
    expect(result?.answer).not.toMatch(/entradas realizadas/i);
  });

  it('série composer mantém ordem e média só se completa', () => {
    const answer = composeAdvisorBillingCostCenterSeriesAnswer({
      wantsAverage: true,
      fact: {
        factKind: 'BILLING_COST_CENTER_MONTH_SERIES',
        status: 'OK',
        costCenterName: 'Laranjeiras',
        requestedCount: 2,
        validCount: 2,
        complete: true,
        average: '150.00',
        months: [
          { monthKey: '2026-09', billing: '100.00', available: true },
          { monthKey: '2026-10', billing: '200.00', available: true },
        ],
      },
    });
    expect(answer).toContain('setembro');
    expect(answer).toContain('outubro');
    expect(answer).toContain('Média dos 2 meses');
  });
});

function createHarness(input: {
  readonly cashFlow: Pick<
    { getMonthlyCashFlow: (args: Record<string, unknown>) => Promise<MonthlyCashFlow> },
    'getMonthlyCashFlow'
  >;
  readonly centers: Array<{ id: string; name: string }>;
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
      cashFlow: input.cashFlow as never,
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
      costCenters: costCentersRepo(input.centers),
    },
    analyticalTools: {
      tools: [],
      async execute() {
        throw new Error('tool analítica não deveria ser chamada neste caminho');
      },
    },
    analyticalResults: {
      async record() {
        return { id: 'trail-1' };
      },
    },
  });

  return { send, openai, messages, runs };
}
