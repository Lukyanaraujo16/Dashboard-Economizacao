/**
 * C.2.7 — Estabilização: F/G/D/H, persistência Last, precedência.
 */
import { describe, expect, it } from 'vitest';

import { applyAnalyticalDimensionPatch } from '../src/modules/advisor/domain/analytical-dimension-patch.js';
import { classifyAnalyticalContinuity } from '../src/modules/advisor/domain/classify-analytical-continuity.js';
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
  buildPendingAlternativesClarification,
  createPendingAnalyticalAction,
  isPendingAlternativesOffer,
  parseLastAnalyticalQuery,
} from '../src/modules/advisor/domain/index.js';
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
  { id: 'cc-amb-a', name: 'Unidade Centro', code: 'UC1', active: true },
  { id: 'cc-amb-b', name: 'Unidade Centro Norte', code: 'UC2', active: true },
];

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(input: {
  readonly monthKey: string;
  readonly inflows: string;
  readonly receivables?: string;
  readonly outflows?: string;
  readonly costCenterCashSplit?: boolean;
}): MonthlyCashFlow {
  const split = input.costCenterCashSplit ?? true;
  const receivables = input.receivables ?? '0';
  const outflows = input.outflows ?? '0';
  return {
    monthKey: input.monthKey,
    costCenterCashSplit: split,
    realized: {
      inflows: split ? money(input.inflows) : null,
      outflows: split ? money(outflows) : null,
      result: split ? money(input.inflows).minus(outflows) : null,
    },
    expected: {
      receivables: split ? money(receivables) : null,
      payables: split ? money('0') : null,
      result: split ? money(receivables) : null,
    },
    realizedByCategory: { inflows: null, outflows: null },
  } as MonthlyCashFlow;
}

describe('C.2.7 F — BILLING → REALIZED_CASH INFLOW', () => {
  it('classifica CONTINUE com métrica REALIZED_CASH + INFLOW', () => {
    const prior = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.cost_center.month',
      monthKey: '2026-09',
      costCenterQuery: 'Laranjeiras',
      structuredStatus: 'OK',
    })!;
    const classified = classifyAnalyticalContinuity({
      content: 'E quanto entrou no caixa?',
      period: { monthKey: '2026-09', source: 'CURRENT', comparison: false },
      prior,
    });
    expect(classified.decision).toBe('CONTINUE');
    if (classified.decision !== 'CONTINUE') return;
    expect(classified.patch.metric).toBe('REALIZED_CASH');
    expect(classified.patch.direction).toBe('INFLOW');
    const applied = applyAnalyticalDimensionPatch({ prior, patch: classified.patch });
    expect(applied.ok).toBe(true);
    if (!applied.ok) return;
    expect(applied.capabilityKey).toBe('realized_cash.cost_center.month.lookup');
    expect(applied.query.direction).toBe('INFLOW');
    expect(applied.query.operation).toBe('LOOKUP');
    expect(applied.query.metric).toBe('REALIZED_CASH');
    expect(applied.query.filters?.costCenterQuery).toMatch(/laranj/i);
  });

  it('MT entrypoint: faturamento CC → E quanto entrou no caixa? usa lookup INFLOW', async () => {
    const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const harness = createHarness({
      byKey: {
        '2026-09': flow({ monthKey: '2026-09', inflows: '5000', receivables: '0' }),
      },
      byCenter: {
        'cc-laranj': {
          '2026-09': flow({
            monthKey: '2026-09',
            inflows: '70',
            receivables: '30',
          }),
        },
      },
      executeTool: async ({ call }) => {
        toolCalls.push({ name: call.name, args: call.arguments as Record<string, unknown> });
        if (call.name === 'cash_cost_center_lookup') {
          return {
            id: call.id,
            name: call.name,
            ok: true,
            content: lookupPayload({
              name: 'Clínica Life Laranjeiras',
              amount: '55.00',
              direction: 'INFLOW',
              monthKey: String(call.arguments.monthKey ?? '2026-09'),
            }),
          };
        }
        throw new Error(`tool inesperado: ${call.name}`);
      },
    });

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Laranjeiras em setembro?',
      now: NOW,
    });
    expect(harness.savedContexts.at(-1)?.slots.lastAnalyticalQuery?.capabilityKey).toBe(
      'billing.cost_center.month',
    );

    const second = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E quanto entrou no caixa?',
      now: NOW,
    });
    expect(second.run).toBeNull();
    expect(toolCalls.some((row) => row.name === 'cash_cost_center_lookup')).toBe(true);
    const lookup = toolCalls.find((row) => row.name === 'cash_cost_center_lookup');
    expect(lookup?.args.direction).toBe('INFLOW');
    expect(second.consultantMessage.content).not.toMatch(/faturamento oficial/i);
    expect(second.consultantMessage.content).toMatch(/55|Laranjeiras|entrada/i);
    expect(harness.openai.generateCalls).toHaveLength(0);
    expect(harness.savedContexts.at(-1)?.slots.lastAnalyticalQuery?.capabilityKey).toBe(
      'realized_cash.cost_center.month.lookup',
    );
  });
});

describe('C.2.7 G — pergunta composta', () => {
  it('G1 — faturamento → dez maiores gastos de outro centro = NEW_QUERY', () => {
    const prior = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.cost_center.month',
      monthKey: '2026-10',
      costCenterQuery: 'Laranjeiras',
      structuredStatus: 'OK',
    })!;
    const classified = classifyAnalyticalContinuity({
      content: 'E os dez maiores gastos de Jacaraípe em setembro?',
      period: { monthKey: '2026-09', source: 'EXPLICIT', comparison: false },
      prior,
    });
    expect(classified.decision).toBe('NEW_QUERY');
  });

  it('G1 MT — não reaproveita BILLING; planner C.1 atende', async () => {
    const toolCalls: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      byKey: {},
      byCenter: {
        'cc-laranj': {
          '2026-10': flow({ monthKey: '2026-10', inflows: '70', receivables: '30' }),
        },
      },
      executeTool: async ({ call }) => {
        toolCalls.push(call.arguments as Record<string, unknown>);
        const limit = Number(call.arguments.limit);
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Clínica Life Jacaraípe',
            limit,
            monthKey: String(call.arguments.monthKey ?? '2026-09'),
            lines: Array.from({ length: limit }, (_, i) => ({
              amount: String(1000 - i * 10),
              description: `Gasto ${i + 1}`,
            })),
          }),
        };
      },
    });

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Laranjeiras?',
      now: NOW,
    });

    const second = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E os dez maiores gastos de Jacaraípe em setembro?',
      now: NOW,
    });
    expect(second.run).toBeNull();
    expect(toolCalls.at(-1)).toMatchObject({
      monthKey: '2026-09',
      direction: 'OUTFLOW',
      limit: 10,
    });
    expect(String(toolCalls.at(-1)?.costCenterQuery).toLowerCase()).toContain('jacar');
    expect(second.consultantMessage.content).not.toMatch(/faturamento oficial/i);
  });

  it('G2 MT — top 5 Laranjeiras → E os dez maiores de Jacaraípe em setembro?', async () => {
    const toolCalls: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      byKey: {},
      executeTool: async ({ call }) => {
        toolCalls.push(call.arguments as Record<string, unknown>);
        const limit = Number(call.arguments.limit);
        const name = String(call.arguments.costCenterQuery).toLowerCase().includes('jacar')
          ? 'Clínica Life Jacaraípe'
          : 'Clínica Life Laranjeiras';
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name,
            limit,
            monthKey: String(call.arguments.monthKey ?? '2026-10'),
            lines: Array.from({ length: limit }, (_, i) => ({
              amount: String(5000 - i * 100),
              description: `Item ${i + 1}`,
            })),
          }),
        };
      },
    });

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Top 5 gastos de Laranjeiras em outubro',
      now: NOW,
    });
    expect(toolCalls[0]).toMatchObject({ limit: 5, monthKey: '2026-10' });

    const second = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E os dez maiores de Jacaraípe em setembro?',
      now: NOW,
    });
    expect(second.run).toBeNull();
    expect(toolCalls[1]).toMatchObject({
      limit: 10,
      monthKey: '2026-09',
      direction: 'OUTFLOW',
    });
    expect(String(toolCalls[1]?.costCenterQuery).toLowerCase()).toContain('jacar');
    expect(harness.openai.generateCalls).toHaveLength(0);
  });
});

describe('C.2.7 D — patch de quantidade no entrypoint', () => {
  it('Top 5 Jacaraípe → E os dez maiores?', async () => {
    const toolCalls: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      byKey: {},
      executeTool: async ({ call }) => {
        toolCalls.push(call.arguments as Record<string, unknown>);
        const limit = Number(call.arguments.limit);
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Clínica Life Jacaraípe',
            limit,
            monthKey: String(call.arguments.monthKey ?? '2026-10'),
            lines: Array.from({ length: limit }, (_, i) => ({
              amount: String(9000 - i * 100),
              description: `Gasto ${i + 1}`,
            })),
          }),
        };
      },
    });

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Top 5 gastos de Jacaraípe',
      now: NOW,
    });
    expect(toolCalls[0]).toMatchObject({ limit: 5, direction: 'OUTFLOW' });

    const second = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E os dez maiores?',
      now: NOW,
    });
    expect(second.run).toBeNull();
    expect(toolCalls[1]).toMatchObject({
      limit: 10,
      direction: 'OUTFLOW',
      monthKey: toolCalls[0]?.monthKey,
    });
    expect(String(toolCalls[1]?.costCenterQuery).toLowerCase()).toContain('jacar');
    expect(harness.openai.generateCalls).toHaveLength(0);
  });
});

describe('C.2.7 H — Pending ALTERNATIVES', () => {
  function alternativesPending() {
    return createPendingAnalyticalAction({
      id: 'pend-alt-1',
      createdFromMessageId: 'msg-offer',
      domain: 'REALIZED_CASH',
      operation: 'MOVEMENTS',
      objective: 'Oferecer caminhos',
      offerSnippet: 'Posso detalhar saídas ou contas a pagar.',
      offerKind: 'ALTERNATIVES',
      steps: [
        {
          toolName: 'cash_cost_center_movement_lines',
          filters: { monthKey: '2026-10', direction: 'OUTFLOW', limit: 5 },
        },
      ],
      alternatives: [
        {
          id: 'A',
          label: 'Detalhar saídas realizadas',
          domain: 'REALIZED_CASH',
          operation: 'MOVEMENTS',
          objective: 'Maiores saídas',
          steps: [
            {
              toolName: 'cash_cost_center_movement_lines',
              filters: { monthKey: '2026-10', direction: 'OUTFLOW', limit: 5 },
            },
          ],
        },
        {
          id: 'B',
          label: 'Aprofundar contas a pagar',
          domain: 'PAYABLE',
          operation: 'RANKING_TOPN',
          objective: 'Títulos a pagar',
          steps: [
            {
              toolName: 'payable_titles',
              filters: { monthKey: '2026-10', ordering: 'VALUE_DESC', limit: 5 },
            },
          ],
        },
      ],
      now: NOW,
    });
  }

  it('ACCEPT genérico pede esclarecimento e preserva pending', async () => {
    const pending = alternativesPending();
    expect(pending).not.toBeNull();
    expect(isPendingAlternativesOffer(pending!)).toBe(true);
    const clarification = buildPendingAlternativesClarification(pending!);
    expect(clarification).toMatch(/Detalhar saídas|contas a pagar/i);

    const harness = createHarness({
      byKey: {},
      initialBag: mergeAdvisorConversationBag(emptyAdvisorConversationBag(), {
        pendingAnalyticalAction: pending,
      }),
      resolvePendingText: JSON.stringify({ decision: 'ACCEPT' }),
    });

    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quero, pode seguir.',
      now: NOW,
    });
    expect(result.consultantMessage.content).toMatch(/prefere|caminho|1\.|2\./i);
    expect(result.consultantMessage.content).not.toMatch(/^Pode seguir/i);
    // Clarification não consome: bag inicial permanece PENDING (pode não re-persistir).
    const bag =
      harness.savedContexts.at(-1) ??
      parseAdvisorConversationBag(harness.getAnalyticalContext());
    expect(bag.slots.pendingAnalyticalAction?.status).toBe('PENDING');
    expect(bag.slots.pendingAnalyticalAction?.offerKind).toBe('ALTERNATIVES');
  });

  it('SELECT A / B materializa; A+B ambíguo clarifica', async () => {
    const pending = alternativesPending()!;
    const harnessA = createHarness({
      byKey: {},
      initialBag: mergeAdvisorConversationBag(emptyAdvisorConversationBag(), {
        pendingAnalyticalAction: pending,
      }),
      resolvePendingText: JSON.stringify({
        decision: 'SELECT_ALTERNATIVE',
        alternativeId: 'A',
      }),
      executeTool: async ({ call }) => ({
        id: call.id,
        name: call.name,
        ok: true,
        content: movementPayload({
          name: 'Clínica Life Jacaraípe',
          limit: 5,
          lines: [{ amount: '100', description: 'Aluguel' }],
        }),
      }),
    });
    const a = await harnessA.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quero a opção A',
      now: NOW,
    });
    expect(a.consultantMessage.content.length).toBeGreaterThan(10);
    const pendingAfter = harnessA.savedContexts.at(-1)?.slots.pendingAnalyticalAction;
    expect(pendingAfter === null || pendingAfter?.status === 'CONSUMED').toBe(true);

    const harnessB = createHarness({
      byKey: {},
      initialBag: mergeAdvisorConversationBag(emptyAdvisorConversationBag(), {
        pendingAnalyticalAction: pending,
      }),
      resolvePendingText: JSON.stringify({
        decision: 'SELECT_ALTERNATIVE',
        alternativeId: 'B',
      }),
      executeTool: async ({ call }) => ({
        id: call.id,
        name: call.name,
        ok: true,
        content: JSON.stringify({
          status: 'OK',
          monthKey: '2026-10',
          factKind: 'PAYABLE_TITLES',
          ranking: [{ partyName: 'Fornecedor', amount: '50.00' }],
        }),
      }),
    });
    const b = await harnessB.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quero a opção B',
      now: NOW,
    });
    expect(b.consultantMessage.content.length).toBeGreaterThan(5);
    const pendingAfterB = harnessB.savedContexts.at(-1)?.slots.pendingAnalyticalAction;
    expect(pendingAfterB === null || pendingAfterB?.status === 'CONSUMED').toBe(true);

    const harnessBoth = createHarness({
      byKey: {},
      initialBag: mergeAdvisorConversationBag(emptyAdvisorConversationBag(), {
        pendingAnalyticalAction: pending,
      }),
      resolvePendingText: JSON.stringify({ decision: 'AMBIGUOUS_ACCEPT' }),
    });
    const both = await harnessBoth.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quero A e B',
      now: NOW,
    });
    expect(both.consultantMessage.content).toMatch(/prefere|1\.|2\./i);
    // Clarification não consome nem re-persiste: bag inicial permanece PENDING.
    const bagBoth =
      harnessBoth.savedContexts.at(-1) ??
      parseAdvisorConversationBag(harnessBoth.getAnalyticalContext());
    expect(bagBoth.slots.pendingAnalyticalAction?.status).toBe('PENDING');
  });

  it('UNRELATED limpa pending e permite continuidade last', async () => {
    const pending = alternativesPending()!;
    const last = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.cost_center.series.months',
      monthKey: '2026-10',
      count: 3,
      costCenterQuery: 'Laranjeiras',
      structuredStatus: 'OK',
    });
    const harness = createHarness({
      byKey: {},
      byCenter: {
        'cc-jac': {
          '2026-08': flow({ monthKey: '2026-08', inflows: '10', receivables: '0' }),
          '2026-09': flow({ monthKey: '2026-09', inflows: '20', receivables: '0' }),
          '2026-10': flow({ monthKey: '2026-10', inflows: '30', receivables: '0' }),
        },
      },
      initialBag: mergeAdvisorConversationBag(emptyAdvisorConversationBag(), {
        pendingAnalyticalAction: pending,
        lastAnalyticalQuery: last,
      }),
      resolvePendingText: JSON.stringify({ decision: 'UNRELATED' }),
    });

    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E de Jacaraípe?',
      now: NOW,
    });
    expect(result.consultantMessage.content).toContain('10,00');
    expect(harness.savedContexts.some((bag) => bag.slots.pendingAnalyticalAction === null)).toBe(
      true,
    );
    expect(harness.savedContexts.at(-1)?.slots.lastAnalyticalQuery?.query.filters?.costCenterQuery).toMatch(
      /jacara/i,
    );
  });
});

describe('C.2.7 persistência Last no entrypoint', () => {
  it('A — BILLING EMPTY válido pode construir last; B — FAILED/DENIED não', () => {
    const emptyBilling = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.cost_center.month',
      monthKey: '2026-10',
      costCenterQuery: 'Laranjeiras',
      structuredStatus: 'EMPTY_RESULT',
    });
    expect(emptyBilling?.executionStatus).toBe('EMPTY');
    expect(emptyBilling?.capabilityKey).toBe('billing.cost_center.month');

    expect(
      lastAnalyticalQueryFromBilling({
        capabilityKey: 'billing.value.month',
        monthKey: '2026-10',
        structuredStatus: 'FAILED',
      }),
    ).toBeNull();
    expect(
      lastAnalyticalQueryFromBilling({
        capabilityKey: 'billing.value.month',
        monthKey: '2026-10',
        structuredStatus: 'DENIED',
      }),
    ).toBeNull();
  });

  it('C/D — AMBIGUOUS / NOT_FOUND / UNAVAILABLE não promovem last no entrypoint', async () => {
    const harnessAmb = createHarness({
      byKey: {},
      catalog: [
        { id: 'cc-amb-a', name: 'Unidade Centro', code: null, active: true },
        { id: 'cc-amb-b', name: 'Unidade Centro Norte', code: null, active: true },
      ],
    });
    await harnessAmb.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Unidade Centro em outubro?',
      now: NOW,
    });
    expect(harnessAmb.savedContexts.at(-1)?.slots.lastAnalyticalQuery ?? null).toBeNull();

    const harnessNf = createHarness({ byKey: {}, byCenter: {} });
    await harnessNf.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de XYZInexistente em outubro?',
      now: NOW,
    });
    expect(harnessNf.savedContexts.at(-1)?.slots.lastAnalyticalQuery ?? null).toBeNull();

    const harnessUnavail = createHarness({
      byKey: {},
      byCenter: {
        'cc-jac': {
          '2026-10': flow({
            monthKey: '2026-10',
            inflows: '999',
            receivables: '0',
            costCenterCashSplit: false,
          }),
        },
      },
    });
    await harnessUnavail.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de Jacaraípe em outubro?',
      now: NOW,
    });
    expect(harnessUnavail.savedContexts.at(-1)?.slots.lastAnalyticalQuery ?? null).toBeNull();
  });

  it('E — resposta provider-only não cria last', async () => {
    const harness = createHarness({
      byKey: {
        '2026-10': flow({ monthKey: '2026-10', inflows: '100', receivables: '0' }),
      },
      forceProviderPath: true,
    });
    const before = harness.savedContexts.length;
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Me explique o cenário financeiro de forma interpretativa, por favor',
      now: NOW,
    });
    const afterBags = harness.savedContexts.slice(before);
    for (const bag of afterBags) {
      expect(bag.slots.lastAnalyticalQuery).toBeNull();
    }
  });

  it('F — ferramenta intermediária / capability não coberta não vira last', () => {
    expect(
      lastAnalyticalQueryFromBilling({
        capabilityKey: 'payable.titles.month',
        monthKey: '2026-10',
        structuredStatus: 'OK',
      }),
    ).toBeNull();
    // Múltiplas tools: só a investigação factual coberta final pode persistir;
    // builders intermediários fora da allowlist retornam null por contrato.
  });

  it('G — NEW_QUERY limpa last; falha posterior não restaura contexto antigo', async () => {
    // Política explícita: ao classificar NEW_QUERY, last é invalidado imediatamente.
    // Se a nova investigação falhar ou não fechar factual, o last antigo NÃO volta.
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

    const orphan = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E de Jacaraípe?',
      now: NOW,
    });
    expect(orphan.consultantMessage.content).toMatch(/consulta analítica anterior|reformule/i);
  });

  it('H — contexto versionado inválido é rejeitado pelo parser', () => {
    expect(
      parseLastAnalyticalQuery({
        version: 99,
        kind: 'LAST_ANALYTICAL_QUERY',
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
  });

  it('EMPTY movements pode persistir no builder', () => {
    const empty = lastAnalyticalQueryFromCostCenterMovements({
      monthKey: '2026-10',
      costCenterQuery: 'Jacaraípe',
      limit: 5,
      structuredStatus: 'EMPTY_RESULT',
    });
    expect(empty?.executionStatus).toBe('EMPTY');
  });
});

function createHarness(input: {
  readonly byKey: Record<string, MonthlyCashFlow>;
  readonly byCenter?: Record<string, Record<string, MonthlyCashFlow>>;
  readonly catalog?: typeof CATALOG;
  readonly executeTool?: (args: {
    readonly tenantId: string;
    readonly call: { readonly id: string; readonly name: string; readonly arguments: Record<string, unknown> };
  }) => Promise<{
    readonly id: string;
    readonly name: string;
    readonly ok: boolean;
    readonly content: string;
  }>;
  readonly initialBag?: ReturnType<typeof emptyAdvisorConversationBag>;
  readonly resolvePendingText?: string;
  readonly forceProviderPath?: boolean;
}) {
  const openai = createFakeIaProvider({
    id: 'OPENAI',
    script: input.resolvePendingText
      ? [
          { text: input.resolvePendingText },
          { text: 'resposta pending' },
          { text: 'prosa' },
        ]
      : [{ text: 'prosa inventada' }],
  });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  const savedContexts: Array<ReturnType<typeof parseAdvisorConversationBag>> = [];
  let messageSeq = 0;
  let runSeq = 0;
  const catalog = input.catalog ?? CATALOG;
  const conversationRow: AiConversationRecord = {
    id: 'conv-a',
    tenantId: 'tenant-a',
    userId: 'user-a',
    status: 'OPEN',
    title: 'titulo',
    analyticalContext: input.initialBag
      ? serializeAdvisorConversationBag(input.initialBag)
      : null,
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
        return flow({ monthKey, inflows: '0', costCenterCashSplit: false });
      }
      if (args.costCenterId !== undefined) {
        return (
          input.byCenter?.[args.costCenterId]?.[monthKey] ??
          flow({ monthKey, inflows: '0', costCenterCashSplit: false })
        );
      }
      return input.byKey[monthKey] ?? flow({ monthKey, inflows: '0' });
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
        if (current === undefined) throw new Error('run ausente');
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
              content:
                'cash.realized.inflows: 100\ncash.realized.inflowsBrl: R$ 100,00\ncash.realized.result: 100\ncash.realized.resultBrl: R$ 100,00',
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
    monthlyPlanning: input.forceProviderPath
      ? undefined
      : {
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
          return tenantId === 'tenant-a' ? catalog : [];
        },
      },
    },
    analyticalTools: {
      tools: [],
      async execute(args) {
        if (input.executeTool) {
          return input.executeTool(args);
        }
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
    getAnalyticalContext: () => conversationRow.analyticalContext,
  };
}

function movementPayload(input: {
  readonly name: string;
  readonly limit?: number;
  readonly monthKey?: string;
  readonly lines?: ReadonlyArray<{
    readonly amount: string;
    readonly description?: string;
  }>;
}): string {
  const lines = (input.lines ?? []).map((line, index) => ({
    occurredOn: '15/09/2026',
    attributedAmount: line.amount,
    originalSettlementAmount: line.amount,
    description: line.description ?? `Item ${index + 1}`,
    partyName: null,
    categoryNames: [] as string[],
    settlementKey: `set-${line.amount}-${index}`,
  }));
  const limit = input.limit ?? (lines.length > 0 ? lines.length : 1);
  return JSON.stringify({
    status: 'OK',
    monthKey: input.monthKey ?? '2026-10',
    scope: 'PERIOD',
    direction: 'OUTFLOW',
    factKind: 'REALIZED_CASH_COST_CENTER_MOVEMENT_LINES',
    costCenter: {
      costCenterId: 'cc-1',
      name: input.name,
      code: null,
    },
    resolvedCostCenter: input.name,
    costCenterAmount: '25000.00',
    populationAmount: '100000.00',
    identifiedAmount: '90000.00',
    unidentifiedAmount: '10000.00',
    coveragePercentage: '90',
    movementPopulationAmount: '25000.00',
    requestedLimit: limit,
    effectiveLimit: limit,
    returnedCount: lines.length,
    hasMore: false,
    lines,
  });
}

function lookupPayload(input: {
  readonly name: string;
  readonly amount: string;
  readonly direction: 'INFLOW' | 'OUTFLOW';
  readonly monthKey: string;
}): string {
  return JSON.stringify({
    status: 'OK',
    monthKey: input.monthKey,
    scope: 'PERIOD',
    entityScope: 'COST_CENTER',
    direction: input.direction,
    factKind: 'REALIZED_CASH_COST_CENTER_LOOKUP',
    costCenter: {
      costCenterId: 'cc-1',
      name: input.name,
      code: null,
      amount: input.amount,
    },
    populationAmount: '1000.00',
    identifiedAmount: '900.00',
    unidentifiedAmount: '100.00',
    coveragePercentage: '90',
  });
}
