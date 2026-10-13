import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { AI_PROVIDER_MODEL_CATALOG } from '../src/modules/advisor/domain/ai-provider-models.js';
import {
  assembleCostCenterOutflowMovementsPlan,
  extractCostCenterEntityFollowUp,
  extractOutflowMovementsCostCenterMention,
  isCostCenterOutflowMovementsPeriodFollowUp,
} from '../src/modules/advisor/domain/assemble-cost-center-outflow-movements-plan.js';
import {
  CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
  CASH_RESULT_COST_CENTER_LOOKUP_TOOL_NAME,
} from '../src/modules/advisor/domain/advisor-cost-center-dimension.js';
import {
  mergeAdvisorConversationBag,
  parseAdvisorConversationBag,
  serializeAdvisorConversationBag,
} from '../src/modules/advisor/domain/advisor-conversation-bag.js';
import { composeAdvisorFactualAnswer } from '../src/modules/advisor/domain/compose-advisor-factual-answer.js';
import {
  costCenterOutflowMovementsState,
  parseCostCenterOutflowMovementsConversationState,
} from '../src/modules/advisor/domain/cost-center-outflow-movements-conversation-state.js';
import { createPendingAnalyticalAction } from '../src/modules/advisor/domain/pending-analytical-action.js';
import { resolveAdvisorConversationalPeriod } from '../src/modules/advisor/domain/resolve-advisor-conversational-period.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
} from '../src/modules/advisor/domain/types.js';
import { createAllowAllConsultantRateLimiter } from '../src/modules/advisor/services/consultant-rate-limiter.js';
import { createSendAdvisorMessage } from '../src/modules/advisor/services/send-advisor-message.js';

const NOW = new Date('2026-10-06T15:00:00.000Z');

function periodFor(content: string, referenceMonthKey?: string) {
  return resolveAdvisorConversationalPeriod({
    content,
    referenceMonthKey,
    now: NOW,
    priorUserContents: [],
  });
}

function movementPayload(input: {
  readonly name: string;
  readonly id?: string;
  readonly status?: 'OK' | 'EMPTY_RESULT' | 'NOT_FOUND' | 'AMBIGUOUS' | 'UNAVAILABLE';
  readonly limit?: number;
  readonly lines?: ReadonlyArray<{
    readonly amount: string;
    readonly description?: string | null;
    readonly partyName?: string | null;
    readonly occurredOn?: string;
  }>;
  readonly candidates?: ReadonlyArray<{ id: string; name: string; code: string | null }>;
}): string {
  const status = input.status ?? 'OK';
  const lines = (input.lines ?? []).map((line) => ({
    occurredOn: line.occurredOn ?? '15/08/2026',
    attributedAmount: line.amount,
    originalSettlementAmount: line.amount,
    description: line.description ?? null,
    partyName: line.partyName ?? null,
    categoryNames: [] as string[],
    settlementKey: `set-${line.amount}`,
  }));
  return JSON.stringify({
    status,
    monthKey: '2026-08',
    scope: 'PERIOD',
    direction: 'OUTFLOW',
    factKind: 'REALIZED_CASH_COST_CENTER_MOVEMENT_LINES',
    costCenter:
      status === 'NOT_FOUND' || status === 'AMBIGUOUS' || status === 'UNAVAILABLE'
        ? null
        : {
            costCenterId: input.id ?? 'cc-1',
            name: input.name,
            code: null,
          },
    costCenterAmount: '25000.00',
    populationAmount: '100000.00',
    identifiedAmount: '90000.00',
    unidentifiedAmount: '10000.00',
    coveragePercentage: '90',
    movementPopulationAmount: '25000.00',
    requestedLimit: input.limit ?? (lines.length > 0 ? lines.length : 1),
    effectiveLimit: input.limit ?? (lines.length > 0 ? lines.length : 1),
    returnedCount: lines.length,
    hasMore: false,
    maxLimit: 20,
    lines,
    candidates: input.candidates ?? [],
  });
}

describe('assembler de maiores gastos por centro (Fase 1)', () => {
  it('monta plano para maior gasto/despesa/saída com limit=1', () => {
    for (const content of [
      'Qual foi meu maior gasto em Laranjeiras em agosto de 2026?',
      'Qual foi minha maior despesa em Laranjeiras em agosto de 2026?',
      'Qual foi minha maior saída em Laranjeiras em agosto de 2026?',
    ]) {
      const assembled = assembleCostCenterOutflowMovementsPlan({
        content,
        period: periodFor(content),
        priorState: null,
      });
      expect(assembled.kind, content).toBe('ASSEMBLED');
      if (assembled.kind !== 'ASSEMBLED') {
        continue;
      }
      expect(assembled.slots).toMatchObject({
        direction: 'OUTFLOW',
        operation: 'MOVEMENTS',
        metric: 'REALIZED_CASH',
        monthKey: '2026-08',
        limit: 1,
        costCenterMention: 'laranjeiras',
        inherited: false,
      });
      expect(assembled.query).toMatchObject({
        metric: 'REALIZED_CASH',
        direction: 'OUTFLOW',
        operation: 'MOVEMENTS',
        dimension: 'COST_CENTER',
        filters: { costCenterQuery: 'laranjeiras' },
        limit: 1,
      });
    }
  });

  it('monta plano para top N / 5 maiores gastos sem capability artesanal', () => {
    for (const content of [
      'Quais foram meus 5 maiores gastos em Laranjeiras em agosto de 2026?',
      'Quais foram as top 5 despesas em Laranjeiras em agosto de 2026?',
      'Quais foram as 5 maiores saídas em Laranjeiras em agosto de 2026?',
    ]) {
      const assembled = assembleCostCenterOutflowMovementsPlan({
        content,
        period: periodFor(content),
        priorState: null,
      });
      expect(assembled.kind, content).toBe('ASSEMBLED');
      if (assembled.kind !== 'ASSEMBLED') {
        continue;
      }
      expect(assembled.slots.limit).toBe(5);
      expect(assembled.query.limit).toBe(5);
      expect(assembled.slots.costCenterMention).toBe('laranjeiras');
    }
  });

  it('extrai menção textual e follow-up de entidade', () => {
    expect(
      extractOutflowMovementsCostCenterMention(
        'Qual foi meu maior gasto em Unidade Norte em agosto de 2026?',
      ),
    ).toBe('unidade norte');
    expect(extractCostCenterEntityFollowUp(foldPt('E em Jacaraípe?'))).toBe('jacaraipe');
    expect(extractCostCenterEntityFollowUp(foldPt('e em agosto?'))).toBeNull();
  });

  it('não hardcoda entidades/tenants no assembler', () => {
    const source = [
      new URL('../src/modules/advisor/domain/assemble-cost-center-outflow-movements-plan.ts', import.meta.url),
      new URL(
        '../src/modules/advisor/domain/cost-center-outflow-movements-conversation-state.ts',
        import.meta.url,
      ),
    ]
      .map((url) => readUtf8(url))
      .join('\n')
      .toLowerCase();
    expect(source).not.toContain('laranjeiras');
    expect(source).not.toContain('jacaraipe');
    expect(source).not.toContain('clínica life');
    expect(source).not.toContain('clinica life');
    expect(source).not.toContain('tenant-a');
    expect(source).not.toContain('tenant-b');
  });

  it('follow-up herda slots do estado factual e troca só o centro', () => {
    const prior = costCenterOutflowMovementsState({
      monthKey: '2026-08',
      periodSource: 'EXPLICIT',
      limit: 5,
      costCenterQuery: 'Clínica Life Laranjeiras',
    });
    const assembled = assembleCostCenterOutflowMovementsPlan({
      content: 'E em Jacaraípe?',
      period: periodFor('E em Jacaraípe?'),
      priorState: prior,
    });
    expect(assembled.kind).toBe('ASSEMBLED');
    if (assembled.kind !== 'ASSEMBLED') {
      return;
    }
    expect(assembled.slots).toMatchObject({
      monthKey: '2026-08',
      limit: 5,
      costCenterMention: 'jacaraipe',
      inherited: true,
      direction: 'OUTFLOW',
      operation: 'MOVEMENTS',
    });
  });

  it('follow-up sem estado factual não inventa contexto', () => {
    expect(
      assembleCostCenterOutflowMovementsPlan({
        content: 'E em Jacaraípe?',
        period: periodFor('E em Jacaraípe?'),
        priorState: null,
      }).kind,
    ).toBe('FOLLOW_UP_WITHOUT_CONTEXT');
  });

  it('C.1 T1/T2 — follow-up de período herda operação/CC/limit e troca só o mês', () => {
    const prior = costCenterOutflowMovementsState({
      monthKey: '2026-10',
      periodSource: 'CURRENT',
      limit: 1,
      costCenterQuery: 'Clínica Life Jacaraípe',
    });
    const september = assembleCostCenterOutflowMovementsPlan({
      content: 'E em setembro?',
      period: periodFor('E em setembro?'),
      priorState: prior,
    });
    expect(september.kind).toBe('ASSEMBLED');
    if (september.kind === 'ASSEMBLED') {
      expect(september.slots).toMatchObject({
        monthKey: '2026-09',
        limit: 1,
        costCenterMention: 'Clínica Life Jacaraípe',
        direction: 'OUTFLOW',
        operation: 'MOVEMENTS',
        inherited: true,
      });
    }

    const top5Prior = costCenterOutflowMovementsState({
      monthKey: '2026-10',
      periodSource: 'CURRENT',
      limit: 5,
      costCenterQuery: 'Clínica Life Jacaraípe',
    });
    const august = assembleCostCenterOutflowMovementsPlan({
      content: 'E em agosto?',
      period: periodFor('E em agosto?'),
      priorState: top5Prior,
    });
    expect(august.kind).toBe('ASSEMBLED');
    if (august.kind === 'ASSEMBLED') {
      expect(august.slots).toMatchObject({
        monthKey: '2026-08',
        limit: 5,
        costCenterMention: 'Clínica Life Jacaraípe',
        direction: 'OUTFLOW',
        operation: 'MOVEMENTS',
        inherited: true,
      });
    }
  });

  it('C.1 T3/T10 — entidade continua com precedência sobre período', () => {
    const prior = costCenterOutflowMovementsState({
      monthKey: '2026-10',
      periodSource: 'CURRENT',
      limit: 1,
      costCenterQuery: 'Clínica Life Jacaraípe',
    });
    const entity = assembleCostCenterOutflowMovementsPlan({
      content: 'E em Laranjeiras?',
      period: periodFor('E em Laranjeiras?'),
      priorState: prior,
    });
    expect(entity.kind).toBe('ASSEMBLED');
    if (entity.kind === 'ASSEMBLED') {
      expect(entity.slots).toMatchObject({
        monthKey: '2026-10',
        limit: 1,
        costCenterMention: 'laranjeiras',
        inherited: true,
      });
    }
    expect(isCostCenterOutflowMovementsPeriodFollowUp('E em Laranjeiras?')).toBe(false);
    expect(isCostCenterOutflowMovementsPeriodFollowUp('E em Jacaraípe?')).toBe(false);
    expect(isCostCenterOutflowMovementsPeriodFollowUp('E em setembro?')).toBe(true);
  });

  it('C.1 T4 — período sem priorState não inventa operação/centro', () => {
    expect(
      assembleCostCenterOutflowMovementsPlan({
        content: 'E em setembro?',
        period: periodFor('E em setembro?'),
        priorState: null,
      }).kind,
    ).toBe('UNMATCHED');
  });

  it('C.1 T5/T6 — pergunta nova de mês/faturamento não herda ranking OUTFLOW', () => {
    const prior = costCenterOutflowMovementsState({
      monthKey: '2026-10',
      periodSource: 'CURRENT',
      limit: 1,
      costCenterQuery: 'Clínica Life Jacaraípe',
    });
    expect(
      assembleCostCenterOutflowMovementsPlan({
        content: 'Como foi o mês de setembro?',
        period: periodFor('Como foi o mês de setembro?'),
        priorState: prior,
      }).kind,
    ).toBe('UNMATCHED');
    expect(
      assembleCostCenterOutflowMovementsPlan({
        content: 'Qual foi o faturamento de setembro?',
        period: periodFor('Qual foi o faturamento de setembro?'),
        priorState: prior,
      }).kind,
    ).toBe('UNMATCHED');
    expect(isCostCenterOutflowMovementsPeriodFollowUp('Como foi o mês de setembro?')).toBe(false);
    expect(isCostCenterOutflowMovementsPeriodFollowUp('Qual foi o faturamento de setembro?')).toBe(
      false,
    );
    expect(
      isCostCenterOutflowMovementsPeriodFollowUp('E em setembro o faturamento?'),
    ).toBe(false);
  });

  it('C.1 T11/T12 — ACCEPT e premissa não são period follow-up', () => {
    const prior = costCenterOutflowMovementsState({
      monthKey: '2026-10',
      periodSource: 'CURRENT',
      limit: 1,
      costCenterQuery: 'Clínica Life Jacaraípe',
    });
    for (const content of [
      'quero sim',
      'pode seguir',
      'considera R$ 7 mil de aluguel',
      'assumindo que o aluguel é 7000',
    ]) {
      expect(isCostCenterOutflowMovementsPeriodFollowUp(content)).toBe(false);
      expect(
        assembleCostCenterOutflowMovementsPlan({
          content,
          period: periodFor(content),
          priorState: prior,
        }).kind,
      ).toBe('UNMATCHED');
    }
  });

  it('estado rejeita tenant/id interno e tentativas inválidas', () => {
    expect(
      parseCostCenterOutflowMovementsConversationState({
        version: 1,
        kind: 'COST_CENTER_OUTFLOW_MOVEMENTS',
        tenantId: 'tenant-x',
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'OUTFLOW',
        regime: 'REALIZED',
        operation: 'MOVEMENTS',
        dimension: 'COST_CENTER',
        monthKey: '2026-08',
        periodSource: 'EXPLICIT',
        limit: 1,
        costCenterQuery: 'Unidade',
      }),
    ).toBeNull();
    expect(
      parseCostCenterOutflowMovementsConversationState({
        version: 1,
        kind: 'COST_CENTER_OUTFLOW_MOVEMENTS',
        costCenterId: 'cc-1',
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'OUTFLOW',
        regime: 'REALIZED',
        operation: 'MOVEMENTS',
        dimension: 'COST_CENTER',
        monthKey: '2026-08',
        periodSource: 'EXPLICIT',
        limit: 1,
        costCenterQuery: 'Unidade',
      }),
    ).toBeNull();
  });
});

describe('envio — maiores gastos por centro (Fase 1)', () => {
  it('responde maior gasto com fato canônico e sem provider', async () => {
    const harness = createHarness({
      async execute({ tenantId, call }) {
        expect(tenantId).toBe('tenant-a');
        expect(call.name).toBe(CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME);
        expect(call.arguments).toMatchObject({
          direction: 'OUTFLOW',
          monthKey: '2026-08',
          limit: 1,
        });
        expect(String(call.arguments.costCenterQuery).toLowerCase()).toContain('laranjeiras');
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Clínica Life Laranjeiras',
            limit: 1,
            lines: [
              {
                amount: '18000.00',
                description: 'Aluguel',
                partyName: 'Imobiliária X',
                occurredOn: '10/08/2026',
              },
            ],
          }),
        };
      },
    });

    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu maior gasto em Laranjeiras em agosto de 2026?',
      now: NOW,
    });

    expect(result.run).toBeNull();
    expect(result.analyticalOutcome).toBe('ANSWERED');
    expect(result.factualAnswer?.providerCalled).toBe(false);
    expect(result.consultantMessage.content).toContain('18.000,00');
    expect(result.consultantMessage.content).toContain('Clínica Life Laranjeiras');
    expect(result.consultantMessage.content).toContain('Aluguel');
    // Template COST_CENTER outflow: sem extract (zero overhead — oferta livre só em free-form)
    expect(harness.openai.generateCalls).toHaveLength(0);
    expect(harness.savedContexts).toHaveLength(1);
    expect(harness.savedContexts[0]).toMatchObject({
      kind: 'ADVISOR_CONVERSATION_BAG',
      version: 1,
      slots: {
        costCenterOutflowMovements: {
          kind: 'COST_CENTER_OUTFLOW_MOVEMENTS',
          limit: 1,
          monthKey: '2026-08',
          costCenterQuery: 'Clínica Life Laranjeiras',
        },
      },
    });
  });

  it('top 5 e follow-up preservam limit e trocam centro', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      async execute({ tenantId, call }) {
        expect(tenantId).toBe('tenant-a');
        calls.push(call.arguments);
        const query = String(call.arguments.costCenterQuery).toLowerCase();
        const name = query.includes('jacar')
          ? 'Clínica Life Jacaraípe'
          : 'Clínica Life Laranjeiras';
        const limit = Number(call.arguments.limit);
        const lines =
          limit === 1
            ? [{ amount: '9000.00', description: 'Serviço' }]
            : [
                { amount: '18000.00', description: 'A' },
                { amount: '7000.00', description: 'B' },
                { amount: '5000.00', description: 'C' },
                { amount: '3000.00', description: 'D' },
                { amount: '1000.00', description: 'E' },
              ];
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({ name, limit, lines }),
        };
      },
    });

    const top5 = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quais foram meus 5 maiores gastos em Laranjeiras em agosto de 2026?',
      now: NOW,
    });
    expect(top5.run).toBeNull();
    expect(top5.consultantMessage.content).toContain('18.000,00');
    expect(top5.consultantMessage.content).toContain('1.000,00');
    expect(calls[0]?.limit).toBe(5);

    const followUp = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em Jacaraípe?',
      now: NOW,
    });
    expect(followUp.run).toBeNull();
    expect(followUp.analyticalOutcome).toBe('ANSWERED');
    expect(calls[1]?.limit).toBe(5);
    expect(String(calls[1]?.costCenterQuery).toLowerCase()).toContain('jacar');
    expect(followUp.consultantMessage.content).toContain('Clínica Life Jacaraípe');
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('follow-up após limit=1 preserva limit=1', async () => {
    const limits: number[] = [];
    const harness = createHarness({
      async execute({ call }) {
        limits.push(Number(call.arguments.limit));
        const query = String(call.arguments.costCenterQuery).toLowerCase();
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: query.includes('jacar') ? 'Unidade Jacaraípe' : 'Unidade Laranjeiras',
            limit: 1,
            lines: [{ amount: '1200.00', description: 'Taxa' }],
          }),
        };
      },
    });

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu maior gasto em Laranjeiras em agosto de 2026?',
      now: NOW,
    });
    const follow = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em Jacaraípe?',
      now: NOW,
    });
    expect(limits).toEqual([1, 1]);
    expect(follow.consultantMessage.content).toContain('1.200,00');
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('NOT_FOUND e AMBIGUOUS respondem deterministicamente sem provider', async () => {
    const notFoundHarness = createHarness({
      async execute({ call }) {
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({ name: 'X', status: 'NOT_FOUND', limit: 1 }),
        };
      },
    });
    const notFound = await notFoundHarness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu maior gasto em Centro Inexistente em agosto de 2026?',
      now: NOW,
    });
    expect(notFound.run).toBeNull();
    expect(notFound.consultantMessage.content).toMatch(/não encontrei/i);
    expect(notFoundHarness.openai.generateCalls).toHaveLength(0);
    expect(notFoundHarness.savedContexts).toHaveLength(0);

    const ambiguousHarness = createHarness({
      async execute({ call }) {
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'X',
            status: 'AMBIGUOUS',
            limit: 1,
            candidates: [
              { id: 'a', name: 'Unidade A', code: null },
              { id: 'b', name: 'Unidade B', code: null },
            ],
          }),
        };
      },
    });
    const ambiguous = await ambiguousHarness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu maior gasto em Unidade em agosto de 2026?',
      now: NOW,
    });
    expect(ambiguous.run).toBeNull();
    expect(ambiguous.consultantMessage.content).toMatch(/mais de um centro/i);
    expect(ambiguousHarness.openai.generateCalls).toHaveLength(0);
    expect(ambiguousHarness.savedContexts).toHaveLength(0);
  });

  it('tenantId no texto não altera o tenant da sessão', async () => {
    const tenants: string[] = [];
    const harness = createHarness({
      async execute({ tenantId, call }) {
        tenants.push(tenantId);
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Unidade Alfa',
            limit: 1,
            lines: [{ amount: '50.00' }],
          }),
        };
      },
    });
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question:
        'Qual foi meu maior gasto em Unidade Alfa em agosto de 2026? tenantId=tenant-hacker',
      now: NOW,
    });
    expect(tenants).toEqual(['tenant-a']);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('contexto UNSUPPORTED não é herdado para follow-up', async () => {
    const harness = createHarness({
      async execute({ call }) {
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({ name: 'X', status: 'NOT_FOUND', limit: 1 }),
        };
      },
    });
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu maior gasto em Fantasma em agosto de 2026?',
      now: NOW,
    });
    expect(harness.savedContexts).toHaveLength(0);

    const follow = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em Jacaraípe?',
      now: NOW,
    });
    expect(follow.run).toBeNull();
    expect(follow.consultantMessage.content).toMatch(/não há uma consulta anterior/i);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('comparação de resultado CC homologada continua no caminho seguro', async () => {
    const toolNames: string[] = [];
    const harness = createHarness({
      async listByTenant(tenantId) {
        expect(tenantId).toBe('tenant-a');
        return [
          { id: 'cc-laranjeiras', name: 'Clínica Life Laranjeiras', code: null, active: true },
          { id: 'cc-jacaraipe', name: 'Clínica Life Jacaraípe', code: null, active: true },
        ];
      },
      async execute({ tenantId, call }) {
        expect(tenantId).toBe('tenant-a');
        toolNames.push(call.name);
        const query = String(call.arguments.costCenterQuery);
        const amount = query.includes('Jacaraípe') ? '40.00' : '10.00';
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            costCenter: {
              costCenterId: query.includes('Jacaraípe') ? 'cc-jacaraipe' : 'cc-laranjeiras',
              name: query,
              amount,
            },
          }),
        };
      },
    });

    const compared = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question:
        'Qual das duas unidades, Laranjeiras ou Jacaraípe, teve melhor resultado em agosto de 2026?',
      now: NOW,
    });
    expect(compared.run).toBeNull();
    expect(compared.analyticalOutcome).toBe('ANSWERED');
    expect(compared.consultantMessage.content).toContain('maior valor em resultado de caixa');
    expect(toolNames.every((name) => name === CASH_RESULT_COST_CENTER_LOOKUP_TOOL_NAME || name.includes('cash_result'))).toBe(
      true,
    );
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('pergunta fora da primitive segue comportamento anterior (provider)', async () => {
    const harness = createHarness({
      async execute() {
        throw new Error('tool não deveria ser chamada');
      },
    });
    const result = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'O que você acha da minha estratégia de marketing?',
      now: NOW,
    });
    expect(result.run).not.toBeNull();
    expect(harness.openai.generateCalls.length).toBeGreaterThan(0);
  });

  it('números da resposta pertencem ao fato e composer fecha limit=1', () => {
    const facts = JSON.parse(
      movementPayload({
        name: 'Unidade Beta',
        limit: 1,
        lines: [
          {
            amount: '3210.50',
            description: 'Energia',
            partyName: 'Cia Luz',
            occurredOn: '12/08/2026',
          },
        ],
      }),
    ) as Record<string, unknown>;
    const composed = composeAdvisorFactualAnswer({
      content: 'Qual foi meu maior gasto em Beta em agosto?',
      anaphora: 'NONE',
      toolName: CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(composed.answer).toContain('3.210,50');
    expect(composed.answer).toContain('Unidade Beta');
    expect(composed.answer).toContain('Energia');
    expect(composed.answer).not.toContain('999.99');
  });

  it('consulta cross-tenant não usa catálogo/tool de outro tenant', async () => {
    const listed: string[] = [];
    const executed: string[] = [];
    const harness = createHarness({
      async listByTenant(tenantId) {
        listed.push(tenantId);
        return tenantId === 'tenant-a'
          ? [{ id: 'cc-a', name: 'Unidade Alfa', code: null, active: true }]
          : [];
      },
      async execute({ tenantId, call }) {
        executed.push(tenantId);
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Unidade Alfa',
            limit: 1,
            lines: [{ amount: '10.00' }],
          }),
        };
      },
    });
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu maior gasto em Unidade Alfa em agosto de 2026?',
      now: NOW,
    });
    expect(executed).toEqual(['tenant-a']);
    expect(listed.every((tenantId) => tenantId === 'tenant-a')).toBe(true);
  });

  it('C.1 T1/T8 — maior gasto → E em setembro? preserva ranking e atualiza slot', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      async execute({ tenantId, call }) {
        expect(tenantId).toBe('tenant-a');
        calls.push(call.arguments);
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Clínica Life Jacaraípe',
            limit: 1,
            lines: [
              {
                amount: call.arguments.monthKey === '2026-09' ? '9500.00' : '12000.00',
                description: 'Aluguel',
                partyName: 'Imobiliária',
              },
            ],
          }),
        };
      },
    });

    const first = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu maior gasto em Jacaraípe em outubro de 2026?',
      now: NOW,
    });
    expect(first.run).toBeNull();
    expect(calls[0]).toMatchObject({
      monthKey: '2026-10',
      direction: 'OUTFLOW',
      limit: 1,
    });
    expect(String(calls[0]?.costCenterQuery).toLowerCase()).toContain('jacar');

    const follow = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em setembro?',
      now: NOW,
    });
    expect(follow.run).toBeNull();
    expect(follow.analyticalOutcome).toBe('ANSWERED');
    expect(calls[1]).toMatchObject({
      monthKey: '2026-09',
      direction: 'OUTFLOW',
      limit: 1,
    });
    expect(String(calls[1]?.costCenterQuery).toLowerCase()).toContain('jacar');
    expect(follow.consultantMessage.content).toContain('9.500,00');
    expect(follow.consultantMessage.content).not.toMatch(/resumo financeiro|faturamento/i);
    expect(harness.openai.generateCalls).toHaveLength(0);
    expect(harness.savedContexts.at(-1)).toMatchObject({
      kind: 'ADVISOR_CONVERSATION_BAG',
      slots: {
        costCenterOutflowMovements: {
          monthKey: '2026-09',
          limit: 1,
          costCenterQuery: 'Clínica Life Jacaraípe',
        },
      },
    });
  });

  it('C.1 T2 — top 5 → E em agosto? preserva CC/limit', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      async execute({ call }) {
        calls.push(call.arguments);
        const limit = Number(call.arguments.limit);
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Clínica Life Jacaraípe',
            limit,
            lines: Array.from({ length: limit }, (_, index) => ({
              amount: String(10000 - index * 1000) + '.00',
              description: `Item ${index + 1}`,
            })),
          }),
        };
      },
    });

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quais foram meus 5 maiores gastos em Jacaraípe em outubro de 2026?',
      now: NOW,
    });
    const follow = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em agosto?',
      now: NOW,
    });
    expect(follow.run).toBeNull();
    expect(calls[1]).toMatchObject({
      monthKey: '2026-08',
      limit: 5,
      direction: 'OUTFLOW',
    });
    expect(String(calls[1]?.costCenterQuery).toLowerCase()).toContain('jacar');
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('C.1 T3/T10 — E em Laranjeiras? / E em Jacaraípe? entidade intacta', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      async execute({ call }) {
        calls.push(call.arguments);
        const query = String(call.arguments.costCenterQuery).toLowerCase();
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: query.includes('laranj')
              ? 'Clínica Life Laranjeiras'
              : 'Clínica Life Jacaraípe',
            limit: 1,
            lines: [{ amount: '8000.00', description: 'Serviço' }],
          }),
        };
      },
    });

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu maior gasto em Jacaraípe em outubro de 2026?',
      now: NOW,
    });
    const toLaranjeiras = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em Laranjeiras?',
      now: NOW,
    });
    expect(toLaranjeiras.run).toBeNull();
    expect(calls[1]).toMatchObject({ monthKey: '2026-10', limit: 1 });
    expect(String(calls[1]?.costCenterQuery).toLowerCase()).toContain('laranj');

    const backToJac = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em Jacaraípe?',
      now: NOW,
    });
    expect(backToJac.run).toBeNull();
    expect(calls[2]).toMatchObject({ monthKey: '2026-10', limit: 1 });
    expect(String(calls[2]?.costCenterQuery).toLowerCase()).toContain('jacar');
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('C.1 T4 — E em setembro? sem prior não inventa consulta de ranking', async () => {
    const movementCalls: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      async execute({ call }) {
        if (call.name === CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME) {
          movementCalls.push(call.arguments);
        }
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Inventado',
            limit: 1,
            lines: [{ amount: '999.00', description: 'Não deveria' }],
          }),
        };
      },
    });
    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em setembro?',
      now: NOW,
    });
    expect(movementCalls).toHaveLength(0);
  });

  it('C.1 T5/T6 — mês genérico / faturamento não forçam ranking anterior', async () => {
    const movementCalls: Array<Record<string, unknown>> = [];
    const harness = createHarness({
      async execute({ call }) {
        if (call.name === CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME) {
          movementCalls.push(call.arguments);
        }
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Clínica Life Jacaraípe',
            limit: 1,
            lines: [{ amount: '12000.00', description: 'Aluguel' }],
          }),
        };
      },
    });

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu maior gasto em Jacaraípe em outubro de 2026?',
      now: NOW,
    });
    expect(movementCalls).toHaveLength(1);

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Como foi o mês de setembro?',
      now: NOW,
    });
    expect(movementCalls).toHaveLength(1);

    await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi o faturamento de setembro?',
      now: NOW,
    });
    expect(movementCalls).toHaveLength(1);
  });

  it('C.1 T7 — centro não encontrado no tenant não inventa fato', async () => {
    const initialBag = mergeAdvisorConversationBag(parseAdvisorConversationBag(null), {
      costCenterOutflowMovements: costCenterOutflowMovementsState({
        monthKey: '2026-10',
        periodSource: 'CURRENT',
        limit: 1,
        costCenterQuery: 'Centro Fantasma',
      }),
    });
    const seeded = createHarness({
      initialAnalyticalContext: serializeAdvisorConversationBag(initialBag),
      async execute({ tenantId, call }) {
        expect(tenantId).toBe('tenant-a');
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({ name: 'X', status: 'NOT_FOUND', limit: 1 }),
        };
      },
    });
    const follow = await seeded.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em setembro?',
      now: NOW,
    });
    expect(follow.run).toBeNull();
    expect(follow.consultantMessage.content).toMatch(/não encontrei/i);
    expect(seeded.openai.generateCalls).toHaveLength(0);
    expect(seeded.savedContexts).toHaveLength(0);
  });

  it('C.1 T9 — EMPTY_RESULT respeita semântica sem inventar valor', async () => {
    const initialBag = mergeAdvisorConversationBag(parseAdvisorConversationBag(null), {
      costCenterOutflowMovements: costCenterOutflowMovementsState({
        monthKey: '2026-10',
        periodSource: 'CURRENT',
        limit: 1,
        costCenterQuery: 'Clínica Life Jacaraípe',
      }),
    });
    const harness = createHarness({
      initialAnalyticalContext: serializeAdvisorConversationBag(initialBag),
      async execute({ call }) {
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: movementPayload({
            name: 'Clínica Life Jacaraípe',
            status: 'EMPTY_RESULT',
            limit: 1,
            lines: [],
          }),
        };
      },
    });
    const follow = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em setembro?',
      now: NOW,
    });
    expect(follow.run).toBeNull();
    expect(follow.consultantMessage.content).toMatch(/não há lançamentos|sem lançamentos|nenhum lançamento/i);
    expect(follow.consultantMessage.content).not.toMatch(/Aluguel|Imobiliária/);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('C.1 T11 — Pending ACCEPT não é tratado como period follow-up', async () => {
    const pending = createPendingAnalyticalAction({
      id: 'pending-c1-t11',
      createdFromMessageId: 'msg-offer',
      domain: 'PAYABLE',
      operation: 'RANKING_TOPN',
      steps: [
        {
          toolName: 'payable_titles',
          filters: {
            monthKey: '2026-10',
            status: 'OPEN',
            ordering: 'VALUE_DESC',
            limit: 5,
          },
        },
      ],
      objective: 'Listar próximos maiores compromissos abertos do mês',
      offerSnippet: 'Posso listar os próximos maiores compromissos deste mês.',
      now: NOW,
    });
    expect(pending).not.toBeNull();
    const initialBag = mergeAdvisorConversationBag(parseAdvisorConversationBag(null), {
      costCenterOutflowMovements: costCenterOutflowMovementsState({
        monthKey: '2026-10',
        periodSource: 'CURRENT',
        limit: 1,
        costCenterQuery: 'Clínica Life Jacaraípe',
      }),
      pendingAnalyticalAction: pending!,
    });
    const toolNames: string[] = [];
    const harness = createHarness({
      initialAnalyticalContext: serializeAdvisorConversationBag(initialBag),
      providerText: JSON.stringify({ decision: 'ACCEPT' }),
      async execute({ call }) {
        toolNames.push(call.name);
        return {
          id: call.id,
          name: call.name,
          ok: true,
          content: JSON.stringify({
            status: 'OK',
            titles: [{ partyName: 'Fornecedor', amount: '100.00' }],
          }),
        };
      },
    });
    const accept = await harness.send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'quero sim',
      now: NOW,
    });
    expect(toolNames).not.toContain(CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME);
    expect(accept.consultantMessage.content).not.toMatch(/maior gasto|Jacaraípe/i);
  });
});

function createHarness(input: {
  readonly listByTenant?: (tenantId: string) => Promise<
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
  readonly initialAnalyticalContext?: unknown;
  readonly providerText?: string;
}) {
  const openai = createFakeIaProvider({
    id: 'OPENAI',
    text: input.providerText ?? 'prosa inventada do provider',
  });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  const savedContexts: unknown[] = [];
  let messageSeq = 0;
  let runSeq = 0;
  const conversationRow: AiConversationRecord = {
    id: 'conv-a',
    tenantId: 'tenant-a',
    userId: 'user-a',
    status: 'OPEN',
    title: 'titulo',
    analyticalContext: (input.initialAnalyticalContext as AiConversationRecord['analyticalContext']) ?? null,
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
      async saveAnalyticalContext(tenantId, conversationId, context) {
        if (tenantId !== conversationRow.tenantId || conversationId !== conversationRow.id) {
          throw new Error('cross-tenant context save');
        }
        conversationRow.analyticalContext = context;
        savedContexts.push(context);
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
        return { tenantId: 'tenant-a', monthKey: '2026-08', blocks: [] };
      },
    },
    providers: createIaProviderRegistry({
      openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    dailyCashMovements: {
      details: {
        async getCashRealizedDayDetails() {
          throw new Error('não usado');
        },
      },
      costCenters: {
        listByTenant:
          input.listByTenant ??
          (async (tenantId: string) => {
            if (tenantId !== 'tenant-a') {
              return [];
            }
            return [
              {
                id: 'cc-laranjeiras',
                name: 'Clínica Life Laranjeiras',
                code: null,
                active: true,
              },
              {
                id: 'cc-jacaraipe',
                name: 'Clínica Life Jacaraípe',
                code: null,
                active: true,
              },
            ];
          }),
      },
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

  return { send, openai, messages, runs, savedContexts };
}

function foldPt(value: string): string {
  return value
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase();
}

function readUtf8(url: URL): string {
  return readFileSync(url, 'utf8');
}
