/**
 * C.2.3–C.2.6 — LastAnalyticalQuery, dimension patch, continuidade semântica.
 */
import { describe, expect, it } from 'vitest';

import {
  applyAnalyticalDimensionPatch,
  patchPeriodMonthKey,
} from '../src/modules/advisor/domain/analytical-dimension-patch.js';
import {
  classifyAnalyticalContinuity,
} from '../src/modules/advisor/domain/classify-analytical-continuity.js';
import {
  buildLastAnalyticalQuery,
  parseLastAnalyticalQuery,
  LAST_ANALYTICAL_QUERY_COVERED_KEYS,
} from '../src/modules/advisor/domain/last-analytical-query.js';
import {
  lastAnalyticalQueryFromBilling,
  lastAnalyticalQueryFromCostCenterMovements,
} from '../src/modules/advisor/domain/build-last-analytical-query-from-answer.js';
import {
  mergeAdvisorConversationBag,
  parseAdvisorConversationBag,
  serializeAdvisorConversationBag,
  emptyAdvisorConversationBag,
} from '../src/modules/advisor/domain/advisor-conversation-bag.js';
import {
  resolveSemanticAnalyticalContinuity,
  shouldAttemptSemanticContinuity,
} from '../src/modules/advisor/domain/resolve-semantic-analytical-continuity.js';
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

describe('C.2.3 LastAnalyticalQuery', () => {
  it('parser rejeita versão, IDs e capability fora da cobertura', () => {
    expect(parseLastAnalyticalQuery({ version: 99, kind: 'LAST_ANALYTICAL_QUERY' })).toBeNull();
    expect(
      parseLastAnalyticalQuery({
        version: 1,
        kind: 'LAST_ANALYTICAL_QUERY',
        tenantId: 't',
        capabilityKey: 'billing.value.month',
        executionStatus: 'OK',
        query: {
          semanticFamily: 'BILLING',
          metric: 'BILLING',
          period: { kind: 'MONTH', monthKey: '2026-10' },
          operation: 'VALUE',
        },
      }),
    ).toBeNull();
    expect(
      parseLastAnalyticalQuery({
        version: 1,
        kind: 'LAST_ANALYTICAL_QUERY',
        capabilityKey: 'not.a.capability',
        executionStatus: 'OK',
        query: {
          semanticFamily: 'BILLING',
          metric: 'BILLING',
          period: { kind: 'MONTH', monthKey: '2026-10' },
          operation: 'VALUE',
        },
      }),
    ).toBeNull();
  });

  it('persiste billing month/window e movements cobertos', () => {
    const month = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.value.month',
      monthKey: '2026-10',
      structuredStatus: 'OK',
    });
    expect(month?.capabilityKey).toBe('billing.value.month');
    expect(month?.query.period).toEqual({ kind: 'MONTH', monthKey: '2026-10' });

    const series = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.cost_center.series.months',
      monthKey: '2026-10',
      count: 3,
      costCenterQuery: 'Laranjeiras',
      structuredStatus: 'OK',
    });
    expect(series?.query.period).toEqual({
      kind: 'MONTH_WINDOW',
      endMonthKey: '2026-10',
      count: 3,
    });
    expect(series?.query.filters?.costCenterQuery).toBe('Laranjeiras');

    const movements = lastAnalyticalQueryFromCostCenterMovements({
      monthKey: '2026-10',
      costCenterQuery: 'Jacaraípe',
      limit: 5,
      structuredStatus: 'OK',
    });
    expect(movements?.capabilityKey).toBe('realized_cash.cost_center.month.movements');
    expect(LAST_ANALYTICAL_QUERY_COVERED_KEYS).toContain(movements!.capabilityKey);
  });

  it('bag preserva lastAnalyticalQuery sem destruir outros slots', () => {
    const last = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.value.month',
      monthKey: '2026-09',
      structuredStatus: 'OK',
    });
    const merged = mergeAdvisorConversationBag(emptyAdvisorConversationBag(), {
      lastAnalyticalQuery: last,
      userAssumptions: [],
    });
    const roundtrip = parseAdvisorConversationBag(serializeAdvisorConversationBag(merged));
    expect(roundtrip.slots.lastAnalyticalQuery?.capabilityKey).toBe('billing.value.month');
    expect(roundtrip.slots.pendingAnalyticalAction).toBeNull();
    expect(roundtrip.slots.costCenterOutflowMovements).toBeNull();
  });

  it('não persiste FAILED/DENIED', () => {
    expect(
      buildLastAnalyticalQuery({
        query: {
          semanticFamily: 'BILLING',
          metric: 'BILLING',
          period: { kind: 'MONTH', monthKey: '2026-10' },
          operation: 'VALUE',
        },
        capabilityKey: 'billing.value.month',
        executionStatus: 'FAILED',
      }),
    ).toBeNull();
  });
});

describe('C.2.4 Dimension patch + classificação', () => {
  const priorBillingSeries = lastAnalyticalQueryFromBilling({
    capabilityKey: 'billing.cost_center.series.months',
    monthKey: '2026-10',
    count: 3,
    costCenterQuery: 'Laranjeiras',
    structuredStatus: 'OK',
  })!;

  it('CASO B — E de Jacaraípe preserva MONTH_WINDOW e BILLING', () => {
    const classified = classifyAnalyticalContinuity({
      content: 'E de Jacaraípe?',
      period: {
        monthKey: '2026-10',
        source: 'CURRENT',
        comparison: false,
        comparisonMonthKey: null,
      },
      prior: priorBillingSeries,
    });
    expect(classified.decision).toBe('CONTINUE');
    if (classified.decision !== 'CONTINUE') {
      return;
    }
    const applied = applyAnalyticalDimensionPatch({
      prior: priorBillingSeries,
      patch: classified.patch,
    });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.query.metric).toBe('BILLING');
    expect(applied.query.period).toEqual({
      kind: 'MONTH_WINDOW',
      endMonthKey: '2026-10',
      count: 3,
    });
    expect(applied.query.filters?.costCenterQuery).toMatch(/jacara/i);
    expect(applied.capabilityKey).toBe('billing.cost_center.series.months');
  });

  it('CASO C — E em agosto troca só o mês', () => {
    const prior = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.cost_center.month',
      monthKey: '2026-09',
      costCenterQuery: 'Jacaraípe',
      structuredStatus: 'OK',
    })!;
    const classified = classifyAnalyticalContinuity({
      content: 'E em agosto?',
      period: {
        monthKey: '2026-08',
        source: 'EXPLICIT',
        comparison: false,
        comparisonMonthKey: null,
      },
      prior,
    });
    expect(classified.decision).toBe('CONTINUE');
    if (classified.decision !== 'CONTINUE') {
      return;
    }
    const applied = applyAnalyticalDimensionPatch({ prior, patch: classified.patch });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.query.period).toEqual({ kind: 'MONTH', monthKey: '2026-08' });
    expect(applied.query.filters?.costCenterQuery).toMatch(/jacara/i);
  });

  it('CASO D — E os dez maiores altera limit', () => {
    const prior = lastAnalyticalQueryFromCostCenterMovements({
      monthKey: '2026-10',
      costCenterQuery: 'Jacaraípe',
      limit: 5,
      structuredStatus: 'OK',
    })!;
    const classified = classifyAnalyticalContinuity({
      content: 'E os dez maiores?',
      period: {
        monthKey: '2026-10',
        source: 'CURRENT',
        comparison: false,
        comparisonMonthKey: null,
      },
      prior,
    });
    expect(classified.decision).toBe('CONTINUE');
    if (classified.decision !== 'CONTINUE') {
      return;
    }
    expect(classified.patch.limit).toBe(10);
    const applied = applyAnalyticalDimensionPatch({ prior, patch: classified.patch });
    expect(applied.ok).toBe(true);
    if (!applied.ok) {
      return;
    }
    expect(applied.query.limit).toBe(10);
    expect(applied.query.filters?.costCenterQuery).toMatch(/jacara/i);
  });

  it('CASO E — resultado de caixa é NEW_QUERY', () => {
    const classified = classifyAnalyticalContinuity({
      content: 'Qual foi o resultado de caixa?',
      period: {
        monthKey: '2026-10',
        source: 'CURRENT',
        comparison: false,
        comparisonMonthKey: null,
      },
      prior: priorBillingSeries,
    });
    expect(classified.decision).toBe('NEW_QUERY');
  });

  it('T6 — sem contexto → CLARIFY', () => {
    const classified = classifyAnalyticalContinuity({
      content: 'E de Jacaraípe?',
      period: {
        monthKey: '2026-10',
        source: 'CURRENT',
        comparison: false,
        comparisonMonthKey: null,
      },
      prior: null,
    });
    expect(classified.decision).toBe('CLARIFY');
  });

  it('patchPeriodMonthKey preserva count da janela', () => {
    expect(
      patchPeriodMonthKey(
        { kind: 'MONTH_WINDOW', endMonthKey: '2026-10', count: 3 },
        '2026-09',
      ),
    ).toEqual({ kind: 'MONTH_WINDOW', endMonthKey: '2026-09', count: 3 });
  });
});

describe('C.2.5 Semântica', () => {
  it('provider patch inválido → CLARIFY', async () => {
    const prior = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.value.month',
      monthKey: '2026-10',
      structuredStatus: 'OK',
    })!;
    const provider = createFakeIaProvider({
      text: JSON.stringify({
        decision: 'CONTINUE',
        patch: { tenantId: 'evil', costCenterId: 'cc-1' },
      }),
    });
    const result = await resolveSemanticAnalyticalContinuity({
      provider,
      providerId: 'OPENAI',
      model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
      tenantId: 'tenant-a',
      userMessage: 'E aquilo?',
      prior,
    });
    expect(result.decision).toBe('CLARIFY');
    expect(result.extraProviderCalls).toBe(1);
  });

  it('shouldAttemptSemanticContinuity só em CLARIFY com prior', () => {
    const prior = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.value.month',
      monthKey: '2026-10',
      structuredStatus: 'OK',
    })!;
    expect(
      shouldAttemptSemanticContinuity({
        content: 'E aquilo do outro?',
        deterministicDecision: 'CLARIFY',
        prior,
      }),
    ).toBe(true);
    expect(
      shouldAttemptSemanticContinuity({
        content: 'E de Jacaraípe?',
        deterministicDecision: 'CONTINUE',
        prior,
      }),
    ).toBe(false);
  });
});

describe('C.2.6 multi-turno (send)', () => {
  it('T2/T10/T11/T30 — série Laranjeiras → E de Jacaraípe (0 provider extra)', async () => {
    const harness = createHarness({
      byKey: {},
      byCenter: {
        'cc-laranj': {
          '2026-08': flow({ monthKey: '2026-08', inflows: '10', receivables: '0' }),
          '2026-09': flow({ monthKey: '2026-09', inflows: '20', receivables: '0' }),
          '2026-10': flow({ monthKey: '2026-10', inflows: '30', receivables: '0' }),
        },
        'cc-jac': {
          '2026-08': flow({ monthKey: '2026-08', inflows: '40', receivables: '0' }),
          '2026-09': flow({ monthKey: '2026-09', inflows: '50', receivables: '0' }),
          '2026-10': flow({ monthKey: '2026-10', inflows: '60', receivables: '0' }),
        },
      },
    });
    const first = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Faturamento de Laranjeiras nos últimos 3 meses',
      now: NOW,
    });
    expect(first.run).toBeNull();
    expect(first.consultantMessage.content).toContain('10,00');
    expect(harness.openai.generateCalls).toHaveLength(0);
    expect(harness.savedContexts.at(-1)?.slots.lastAnalyticalQuery?.query.period).toEqual({
      kind: 'MONTH_WINDOW',
      endMonthKey: '2026-10',
      count: 3,
    });

    const second = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E de Jacaraípe?',
      now: NOW,
    });
    expect(second.run).toBeNull();
    expect(second.consultantMessage.content).toContain('40,00');
    expect(second.consultantMessage.content).toContain('60,00');
    expect(second.consultantMessage.content).not.toMatch(/entradas realizadas/i);
    expect(harness.openai.generateCalls).toHaveLength(0);
    expect(harness.savedContexts.at(-1)?.slots.lastAnalyticalQuery?.query.filters?.costCenterQuery).toMatch(
      /jacara/i,
    );
    expect(harness.savedContexts.at(-1)?.slots.lastAnalyticalQuery?.query.period).toEqual({
      kind: 'MONTH_WINDOW',
      endMonthKey: '2026-10',
      count: 3,
    });
  });

  it('T3 — faturamento CC mês → E em agosto', async () => {
    const harness = createHarness({
      byKey: {},
      byCenter: {
        'cc-jac': {
          '2026-09': flow({ monthKey: '2026-09', inflows: '80', receivables: '20' }),
          '2026-08': flow({ monthKey: '2026-08', inflows: '40', receivables: '10' }),
        },
      },
    });
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Jacaraípe em setembro?',
      now: NOW,
    });
    const second = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em agosto?',
      now: NOW,
    });
    expect(second.consultantMessage.content).toContain('50,00');
    expect(second.consultantMessage.content).not.toContain('100,00');
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('T5 — NEW_QUERY limpa last (não herda BILLING)', async () => {
    const harness = createHarness({
      byKey: {
        '2026-10': flow({ monthKey: '2026-10', inflows: '100', receivables: '0' }),
      },
      byCenter: {
        'cc-laranj': {
          '2026-10': flow({ monthKey: '2026-10', inflows: '70', receivables: '30' }),
        },
      },
    });
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Faturamento de Laranjeiras',
      now: NOW,
    });
    expect(harness.savedContexts.at(-1)?.slots.lastAnalyticalQuery).not.toBeNull();
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o resultado de caixa?',
      now: NOW,
    });
    expect(harness.savedContexts.at(-1)?.slots.lastAnalyticalQuery).toBeNull();
  });

  it('T6 — sem contexto', async () => {
    const harness = createHarness({ byKey: {} });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E de Jacaraípe?',
      now: NOW,
    });
    expect(result.consultantMessage.content).toMatch(/consulta analítica anterior|reformule/i);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('T9 — tenant diferente não lê bag de outro tenant', async () => {
    const harness = createHarness({
      byKey: {},
      byCenter: {
        'cc-jac': {
          '2026-10': flow({ monthKey: '2026-10', inflows: '99', receivables: '1' }),
        },
      },
    });
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Faturamento de Jacaraípe em outubro',
      now: NOW,
    });
    await expect(
      harness.send.execute({
        tenantId: 'tenant-b',
        userId: 'user-a',
        conversationId: 'conv-a',
        question: 'E em setembro?',
        now: NOW,
      }),
    ).rejects.toThrow();
  });

  it('T27 — split indisponível não vira INFLOW na continuidade', async () => {
    const harness = createHarness({
      byKey: {},
      byCenter: {
        'cc-jac': {
          '2026-10': flow({
            monthKey: '2026-10',
            inflows: '999',
            receivables: '0',
            costCenterCashSplit: false,
          }),
          '2026-09': flow({
            monthKey: '2026-09',
            inflows: '888',
            receivables: '0',
            costCenterCashSplit: false,
          }),
        },
      },
    });
    // Primeiro turno com split OK para criar last, depois patch para mês sem split.
    harness.setCenterFlow('cc-jac', '2026-10', flow({
      monthKey: '2026-10',
      inflows: '70',
      receivables: '30',
    }));
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Faturamento de Jacaraípe em outubro',
      now: NOW,
    });
    harness.setCenterFlow(
      'cc-jac',
      '2026-09',
      flow({
        monthKey: '2026-09',
        inflows: '888',
        receivables: '0',
        costCenterCashSplit: false,
      }),
    );
    const second = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em setembro?',
      now: NOW,
    });
    expect(second.consultantMessage.content).toMatch(/indisponível|rateio/i);
    expect(second.consultantMessage.content).not.toContain('888');
  });
});

function createHarness(input: {
  readonly byKey: Record<string, MonthlyCashFlow>;
  readonly byCenter?: Record<string, Record<string, MonthlyCashFlow>>;
}) {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'prosa inventada' });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  const savedContexts: Array<ReturnType<typeof parseAdvisorConversationBag>> = [];
  let messageSeq = 0;
  let runSeq = 0;
  const byCenter: Record<string, Record<string, MonthlyCashFlow>> = {
    ...(input.byCenter ?? {}),
  };
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
          byCenter[args.costCenterId]?.[monthKey] ??
          flow({ monthKey, inflows: '0', receivables: '0', costCenterCashSplit: false })
        );
      }
      return input.byKey[monthKey] ?? flow({ monthKey, inflows: '0', receivables: '0' });
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
      async saveAnalyticalContext(tenantId, conversationId, context) {
        if (tenantId !== 'tenant-a' || conversationId !== 'conv-a') {
          throw new Error('tenant/conversation mismatch');
        }
        const parsed = parseAdvisorConversationBag(context);
        savedContexts.push(parsed);
        conversationRow.analyticalContext = context;
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
        return {
          tenantId: 'tenant-a',
          monthKey: '2026-10',
          blocks: [
            {
              type: 'FINANCIAL_FACTS',
              content: 'cash.realized.result: 100\ncash.realized.resultBrl: R$ 100,00',
              trustLevel: 'PLATFORM',
            },
          ],
        };
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

  return {
    send,
    openai,
    savedContexts,
    setCenterFlow(centerId: string, monthKey: string, value: MonthlyCashFlow) {
      byCenter[centerId] = { ...(byCenter[centerId] ?? {}), [monthKey]: value };
    },
  };
}
