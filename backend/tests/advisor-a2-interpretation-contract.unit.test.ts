/**
 * Marco A2 — contrato de interpretação estruturada do Consultor.
 *
 * Usa o executor de tools REAL (bind de mês pelo backend, validação de argumentos,
 * scope guard), o resolvedor de catálogo REAL e o serializador REAL de lançamentos por
 * centro. Só a camada de dados do serviço de centro é fixture (por tenant e mês).
 */
import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { createAdvisorAnalyticalToolExecutor } from '../src/modules/advisor/domain/advisor-analytical-tools.js';
import {
  emptyAdvisorConversationBag,
  mergeAdvisorConversationBag,
  parseAdvisorConversationBag,
  serializeAdvisorConversationBag,
  type AdvisorConversationBag,
} from '../src/modules/advisor/domain/advisor-conversation-bag.js';
import type { AdvisorCostCenterDimensionService } from '../src/modules/advisor/domain/advisor-cost-center-tools.js';
import { resolveAdvisorCostCenterQuery } from '../src/modules/advisor/domain/advisor-cost-center-dimension.js';
import { serializeAdvisorCostCenterMovementLines } from '../src/modules/advisor/domain/advisor-cost-center-movement-lines.js';
import {
  interpretAdvisorQuestion,
  listAdvisorMonthWindowKeys,
  maskAdvisorTextSpans,
  foldAdvisorInterpretationText,
  parseAdvisorPeriodExpression,
  parseAdvisorRankingCardinality,
} from '../src/modules/advisor/domain/advisor-question-interpretation.js';
import {
  deriveQuestionAnalyticalDemand,
  detectExplicitCostCenterScope,
} from '../src/modules/advisor/domain/advisor-question-scope.js';
import { AI_PROVIDER_MODEL_CATALOG } from '../src/modules/advisor/domain/ai-provider-models.js';
import { applyAnalyticalDimensionPatch } from '../src/modules/advisor/domain/analytical-dimension-patch.js';
import { validateAnalyticalCapability } from '../src/modules/advisor/domain/analytical/validate-analytical-capability.js';
import { buildCostCenterMovementsWindowQuery } from '../src/modules/advisor/domain/analytical/build-analytical-query-from-tool.js';
import {
  lastAnalyticalQueryFromBilling,
  lastAnalyticalQueryFromCostCenterMovements,
} from '../src/modules/advisor/domain/build-last-analytical-query-from-answer.js';
import { listBillingSeriesMonthKeys } from '../src/modules/advisor/domain/billing-month-series.js';
import { mergeCostCenterMovementsWindow } from '../src/modules/advisor/domain/cost-center-movements-window.js';
import { createPendingAnalyticalAction } from '../src/modules/advisor/domain/index.js';
import { resolveAdvisorConversationalPeriod } from '../src/modules/advisor/domain/resolve-advisor-conversational-period.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
} from '../src/modules/advisor/domain/types.js';
import { createAllowAllConsultantRateLimiter } from '../src/modules/advisor/services/consultant-rate-limiter.js';
import { createSendAdvisorMessage } from '../src/modules/advisor/services/send-advisor-message.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';

const NOW = new Date('2026-10-16T15:00:00.000Z');
const MONTH = '2026-10';

type CatalogRow = { readonly id: string; readonly name: string; readonly code: string | null; readonly active: boolean };

const CATALOGS: Record<string, readonly CatalogRow[]> = {
  'tenant-a': [
    { id: 'cc-jac', name: 'Clínica Life Jacaraípe', code: null, active: true },
    { id: 'cc-lar', name: 'Clínica Life Laranjeiras', code: null, active: true },
    { id: 'cc-serra', name: 'Unidade Serra', code: 'US1', active: true },
    { id: 'cc-serra-sul', name: 'Unidade Serra Sul', code: 'US2', active: true },
    // Inativo: fora do catálogo de escopo (ativos), mas com histórico financeiro.
    { id: 'cc-antiga', name: 'Unidade Antiga Barra', code: null, active: false },
  ],
  // Outro tenant, outros nomes: prova que nada depende do cliente da homologação.
  'tenant-b': [{ id: 'cc-b-norte', name: 'Filial Norte', code: 'FN', active: true }],
};

type FixtureLine = {
  readonly tenantId: string;
  readonly costCenterId: string;
  readonly monthKey: string;
  readonly occurredOn: string;
  readonly attributed: string;
  readonly original?: string;
  readonly description: string;
  readonly party?: string;
};

const LINES: readonly FixtureLine[] = [
  // Jacaraípe — o maior individual da janela é setembro (rateado), o de outubro é Folha.
  { tenantId: 'tenant-a', costCenterId: 'cc-jac', monthKey: '2026-08', occurredOn: '05/08/2026', attributed: '900.00', description: 'Aluguel' },
  { tenantId: 'tenant-a', costCenterId: 'cc-jac', monthKey: '2026-08', occurredOn: '12/08/2026', attributed: '120.00', description: 'Material de consumo' },
  { tenantId: 'tenant-a', costCenterId: 'cc-jac', monthKey: '2026-09', occurredOn: '10/09/2026', attributed: '1200.00', original: '3000.00', description: 'Equipamento', party: 'Fornecedor Alfa' },
  { tenantId: 'tenant-a', costCenterId: 'cc-jac', monthKey: '2026-09', occurredOn: '15/09/2026', attributed: '80.00', description: 'Limpeza' },
  { tenantId: 'tenant-a', costCenterId: 'cc-jac', monthKey: '2026-10', occurredOn: '05/10/2026', attributed: '700.00', description: 'Folha' },
  // Baixa original grande, mas só 150 atribuídos ao centro: ranking usa o valor atribuído.
  { tenantId: 'tenant-a', costCenterId: 'cc-jac', monthKey: '2026-10', occurredOn: '06/10/2026', attributed: '150.00', original: '5000.00', description: 'Contrato compartilhado' },
  // Laranjeiras
  { tenantId: 'tenant-a', costCenterId: 'cc-lar', monthKey: '2026-08', occurredOn: '20/08/2026', attributed: '2500.00', description: 'Reforma' },
  { tenantId: 'tenant-a', costCenterId: 'cc-lar', monthKey: '2026-09', occurredOn: '02/09/2026', attributed: '1000.00', description: 'Aluguel' },
  { tenantId: 'tenant-a', costCenterId: 'cc-lar', monthKey: '2026-10', occurredOn: '03/10/2026', attributed: '400.00', description: 'Material' },
  { tenantId: 'tenant-a', costCenterId: 'cc-antiga', monthKey: '2026-08', occurredOn: '14/08/2026', attributed: '620.00', description: 'Desmobilização' },
  // Tenant B
  { tenantId: 'tenant-b', costCenterId: 'cc-b-norte', monthKey: '2026-09', occurredOn: '11/09/2026', attributed: '333.00', description: 'Frete' },
];

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(monthKey: string, inflows: string): MonthlyCashFlow {
  return {
    monthKey,
    costCenterCashSplit: true,
    realized: { inflows: money(inflows), outflows: money('0'), result: money(inflows) },
    expected: { receivables: money('0'), payables: money('0'), result: money('0') },
    realizedByCategory: { inflows: null, outflows: null },
  } as MonthlyCashFlow;
}

type MovementCall = {
  readonly tenantId: string;
  readonly monthKey: string;
  readonly costCenterQuery: string;
  readonly limit: number | undefined;
};

function createFakeCostCenterService(options: {
  readonly calls: MovementCall[];
  readonly unavailable?: readonly string[];
  readonly lines?: readonly FixtureLine[];
}): AdvisorCostCenterDimensionService {
  const zero = money('0');
  const unsupported = async (): Promise<Record<string, unknown>> => {
    throw new Error('método não usado neste contrato');
  };
  return {
    rank: unsupported,
    lookup: unsupported,
    cashResult: unsupported,
    compare: unsupported,
    async movementLines(input) {
      options.calls.push({
        tenantId: input.tenantId,
        monthKey: input.monthKey,
        costCenterQuery: input.costCenterQuery,
        limit: input.limit,
      });
      if (options.unavailable?.includes(`${input.tenantId}:${input.monthKey}`)) {
        return { status: 'UNAVAILABLE', monthKey: input.monthKey, direction: input.direction };
      }
      const catalog = (CATALOGS[input.tenantId] ?? []).map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
      }));
      const empty = {
        monthKey: input.monthKey,
        direction: input.direction,
        costCenter: null,
        costCenterAmount: zero,
        populationAmount: zero,
        identifiedAmount: zero,
        unidentifiedAmount: zero,
        coveragePercentage: null,
        movementPopulationAmount: zero,
        requestedLimit: input.limit ?? 5,
        effectiveLimit: input.limit ?? 5,
        returnedCount: 0,
        hasMore: false,
        lines: [],
      };
      const resolved = resolveAdvisorCostCenterQuery(catalog, input.costCenterQuery);
      if (resolved.status === 'NOT_FOUND') {
        return serializeAdvisorCostCenterMovementLines({ ...empty, status: 'NOT_FOUND' });
      }
      if (resolved.status === 'AMBIGUOUS') {
        return serializeAdvisorCostCenterMovementLines({
          ...empty,
          status: 'AMBIGUOUS',
          candidates: resolved.candidates,
        });
      }
      const ofCenter = (options.lines ?? LINES)
        .filter(
          (line) =>
            line.tenantId === input.tenantId &&
            line.costCenterId === resolved.center.costCenterId &&
            line.monthKey === input.monthKey,
        )
        .sort((left, right) => money(right.attributed).comparedTo(money(left.attributed)));
      const limit = input.limit ?? 5;
      const window = ofCenter.slice(0, limit);
      const total = ofCenter.reduce((sum, line) => sum.plus(money(line.attributed)), zero);
      return serializeAdvisorCostCenterMovementLines({
        ...empty,
        status: window.length === 0 ? 'EMPTY_RESULT' : 'OK',
        costCenter: {
          costCenterId: resolved.center.costCenterId,
          name: resolved.center.name,
          code: resolved.center.code,
        },
        costCenterAmount: total,
        movementPopulationAmount: total,
        requestedLimit: limit,
        effectiveLimit: limit,
        returnedCount: window.length,
        hasMore: ofCenter.length > window.length,
        lines: window.map((line, index) => ({
          occurredOn: line.occurredOn,
          attributedAmount: money(line.attributed),
          originalSettlementAmount: money(line.original ?? line.attributed),
          description: line.description,
          partyName: line.party ?? null,
          categoryNames: [],
          settlementKey: `${line.monthKey}-${index}`,
        })),
      });
    },
  };
}

function createHarness(options: {
  readonly tenantId?: string;
  readonly unavailable?: readonly string[];
  readonly lines?: readonly FixtureLine[];
  readonly initialBag?: AdvisorConversationBag;
  readonly providerScript?: readonly { readonly text: string }[];
} = {}) {
  const tenantId = options.tenantId ?? 'tenant-a';
  const calls: MovementCall[] = [];
  const toolNames: string[] = [];
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  const trails: Array<{ outcome: string; answerSource: string; traces: readonly { toolName: string }[] }> = [];
  let seq = 0;
  const openai = createFakeIaProvider({
    id: 'OPENAI',
    ...(options.providerScript !== undefined
      ? { script: options.providerScript }
      : { text: 'prosa inventada pelo provider' }),
  });
  const conversationRow: AiConversationRecord = {
    id: 'conv-1',
    tenantId,
    userId: 'user-1',
    status: 'OPEN',
    title: 'conversa',
    analyticalContext:
      options.initialBag === undefined ? null : serializeAdvisorConversationBag(options.initialBag),
    startedAt: NOW,
    lastMessageAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
  const settings: AiTenantSettingsRecord = {
    id: `set-${tenantId}`,
    tenantId,
    provider: 'OPENAI',
    model: AI_PROVIDER_MODEL_CATALOG.OPENAI.defaultModel,
    businessSegment: 'Saúde',
    businessDescription: 'Empresa',
    consultantName: null,
    adminPrompt: null,
    tonePreset: 'PROFISSIONAL_OBJETIVO',
    tone: 'objetivo',
    emojiPreference: 'MODERATE',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
  };
  const realExecutor = createAdvisorAnalyticalToolExecutor({
    cashComparison: {
      async compare() {
        throw new Error('comparação não usada neste contrato');
      },
    },
    cashCostCenter: createFakeCostCenterService({
      calls,
      unavailable: options.unavailable,
      lines: options.lines,
    }),
  });
  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(id) {
        return id === tenantId ? settings : null;
      },
    },
    conversations: {
      async findConversation(id, userId, conversationId) {
        return id === tenantId && userId === 'user-1' && conversationId === 'conv-1'
          ? { ...conversationRow }
          : null;
      },
      async createMessage(id, conversationId, message) {
        const created: AiMessageRecord = {
          id: `msg-${++seq}`,
          conversationId,
          tenantId: id,
          senderType: message.senderType,
          content: message.content,
          messageType: 'TEXT',
          createdAt: NOW,
        };
        messages.push(created);
        return created;
      },
      async updateConversationTitle() {
        return conversationRow;
      },
      async listMessages(id, conversationId) {
        return messages.filter((row) => row.tenantId === id && row.conversationId === conversationId);
      },
      async saveAnalyticalContext(id, conversationId, context) {
        if (id !== tenantId || conversationId !== 'conv-1') {
          throw new Error('tenant/conversa divergente');
        }
        conversationRow.analyticalContext = context;
        return true;
      },
    },
    runs: {
      async createRun(id, run) {
        const created: AiRunRecord = {
          id: `run-${runs.length + 1}`,
          tenantId: id,
          userId: run.userId ?? null,
          conversationId: run.conversationId ?? null,
          messageId: run.messageId ?? null,
          runType: run.runType ?? 'QUESTION_REPLY',
          provider: run.provider,
          model: run.model,
          status: run.status,
          inputTokens: null,
          outputTokens: null,
          durationMs: null,
          errorCode: run.errorCode ?? null,
          createdAt: NOW,
          finishedAt: null,
        };
        runs.push(created);
        return created;
      },
      async updateRun(_id, runId, patch) {
        const current = runs.find((row) => row.id === runId)!;
        Object.assign(current, patch);
        return current;
      },
    },
    context: {
      async build() {
        return { tenantId, monthKey: MONTH, blocks: [] };
      },
    },
    providers: createIaProviderRegistry({
      openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    monthlyPlanning: {
      cashFlow: {
        async getMonthlyCashFlow(args: { tenantId: string; monthKey?: string; costCenterId?: string }) {
          const monthKey = args.monthKey ?? MONTH;
          if (args.tenantId !== tenantId) {
            throw new Error('fluxo de outro tenant');
          }
          const byCenter: Record<string, string> = { 'cc-jac': '300', 'cc-lar': '700' };
          return flow(monthKey, args.costCenterId === undefined ? '1000' : (byCenter[args.costCenterId] ?? '0'));
        },
      } as never,
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
        async listByTenant(id: string) {
          return id === tenantId ? [...(CATALOGS[id] ?? [])] : [];
        },
      } as never,
    },
    analyticalTools: {
      tools: realExecutor.tools,
      async execute(args) {
        toolNames.push(args.call.name);
        return realExecutor.execute(args);
      },
    },
    analyticalResults: {
      async record(_tenant, row) {
        trails.push({ outcome: row.outcome, answerSource: row.answerSource, traces: row.traces });
        return { id: `trail-${trails.length}` } as never;
      },
    },
  });

  return {
    calls,
    toolNames,
    trails,
    openai,
    bag: () => parseAdvisorConversationBag(conversationRow.analyticalContext),
    async ask(question: string) {
      return send.execute({
        tenantId,
        userId: 'user-1',
        conversationId: 'conv-1',
        question,
        monthKey: MONTH,
        now: NOW,
      });
    },
  };
}

function monthsOf(calls: readonly MovementCall[]): string[] {
  return calls.map((call) => call.monthKey);
}

// ---------------------------------------------------------------------------
// Reprodução obrigatória
// ---------------------------------------------------------------------------

describe('A2 — reprodução do incidente (3 turnos do consultor financeiro)', () => {
  it('faturamento Laranjeiras → E de Jacaraípe? → maior gasto de Jacaraípe nos últimos três meses', async () => {
    const harness = createHarness();
    const first = await harness.ask('Como está o faturamento de Laranjeiras?');
    expect(first.consultantMessage.content).toContain('Faturamento oficial de Clínica Life Laranjeiras');
    expect(first.factualAnswer?.providerCalled).toBe(false);

    const second = await harness.ask('E de Jacaraípe?');
    expect(second.consultantMessage.content).toContain('Faturamento oficial de Clínica Life Jacaraípe');

    const third = await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    expect(third.consultantMessage.content).not.toMatch(/não encontrei/i);
    expect(third.consultantMessage.content).toBe(
      'O maior gasto individual (saída realizada de caixa) de Clínica Life Jacaraípe entre agosto de 2026 e outubro de 2026 (3 meses) foi R$ 1.200,00, referente a Equipamento — Fornecedor Alfa, em 10/09/2026. Esse é o valor atribuído ao centro pelo rateio oficial; a baixa total foi R$ 3.000,00.',
    );
    expect(third.factualAnswer?.providerCalled).toBe(false);
    // TOP_1 (não limit=3), janela de 3 meses (não MONTH 2026-10), centro oficial do catálogo.
    expect(harness.calls).toEqual([
      { tenantId: 'tenant-a', monthKey: '2026-08', costCenterQuery: 'Clínica Life Jacaraípe', limit: 1 },
      { tenantId: 'tenant-a', monthKey: '2026-09', costCenterQuery: 'Clínica Life Jacaraípe', limit: 1 },
      { tenantId: 'tenant-a', monthKey: '2026-10', costCenterQuery: 'Clínica Life Jacaraípe', limit: 1 },
    ]);
    // NEW_QUERY: métrica nova, last de BILLING não sobrevive.
    const last = harness.bag().slots.lastAnalyticalQuery;
    expect(last?.capabilityKey).toBe('realized_cash.cost_center.window.movements');
    expect(last?.query.metric).toBe('REALIZED_CASH');
    expect(last?.query.period).toEqual({ kind: 'MONTH_WINDOW', endMonthKey: '2026-10', count: 3 });
  });

  it('frases obrigatórias na mesma conversa respeitam período, entidade e herança', async () => {
    const harness = createHarness();
    const a = await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    const b = await harness.ask('Nos últimos três meses, qual foi o maior gasto de Jacaraípe?');
    expect(b.consultantMessage.content).toBe(a.consultantMessage.content);

    const c = await harness.ask('Qual foi a maior despesa de Jacaraípe nesse período?');
    // "nesse período" herda a janela; "despesa" ganha a métrica explícita (A2.1).
    expect(c.consultantMessage.content).toBe(
      `${a.consultantMessage.content} Considerei saídas realizadas de caixa atribuídas ao centro (lançamentos pagos), não a despesa oficial por competência.`,
    );

    const e = await harness.ask('E qual foi o maior gasto de Laranjeiras?');
    // "E ..." sem período, mesma família: herda a janela.
    expect(e.consultantMessage.content).toContain(
      'O maior gasto individual (saída realizada de caixa) de Clínica Life Laranjeiras entre agosto de 2026 e outubro de 2026 (3 meses) foi R$ 2.500,00, referente a Reforma',
    );

    const d = await harness.ask('Me mostra o gasto mais alto de Jacaraípe.');
    // Pergunta nova sem período: regra oficial (mês de referência), dita explicitamente.
    expect(d.consultantMessage.content).toBe(
      'O maior gasto de Clínica Life Jacaraípe em outubro de 2026 foi R$ 700,00, referente a Folha, em 05/10/2026.',
    );
    expect(harness.calls.at(-1)).toEqual({
      tenantId: 'tenant-a',
      monthKey: '2026-10',
      costCenterQuery: 'Clínica Life Jacaraípe',
      limit: 1,
    });
    expect(harness.openai.generateCalls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Contrato de interpretação (unidade)
// ---------------------------------------------------------------------------

function interpret(content: string, inheritedPeriod: Parameters<typeof interpretAdvisorQuestion>[0]['inheritedPeriod'] = null) {
  const period = resolveAdvisorConversationalPeriod({ content, referenceMonthKey: MONTH, now: NOW, priorUserContents: [] });
  const demand = deriveQuestionAnalyticalDemand({
    content,
    comparison: period.comparison,
    catalog: CATALOGS['tenant-a']!.map((row) => ({ id: row.id, name: row.name, code: row.code })),
  });
  return interpretAdvisorQuestion({
    content,
    conversationalPeriod: period,
    demand,
    inheritedPeriod,
    referenceMonthKey: MONTH,
    now: NOW,
  });
}

describe('A2 — contrato de interpretação', () => {
  it('A — ordens diferentes produzem a mesma interpretação estruturada', () => {
    const variants = [
      'Qual o maior gasto de Jacaraípe nos últimos três meses?',
      'Nos últimos três meses, qual foi o maior gasto de Jacaraípe?',
      'Qual foi, nos últimos 3 meses, o maior gasto de Jacaraípe?',
      'Maior gasto de Jacaraípe dos últimos três meses',
    ];
    for (const content of variants) {
      const result = interpret(content);
      expect(result.cardinality).toEqual({ kind: 'TOP_1', limit: 1, source: 'SINGULAR' });
      expect(result.period).toEqual({ kind: 'MONTH_WINDOW', endMonthKey: '2026-10', count: 3, origin: 'QUESTION' });
      expect(result.entity).toMatchObject({ status: 'RESOLVED', officialName: 'Clínica Life Jacaraípe' });
      expect(result.metric).toBe('REALIZED_CASH');
      expect(result.direction).toBe('OUTFLOW');
      expect(result.status).toBe('COMPLETE');
    }
  });

  it('B/C — nome curto, nome oficial e preposições de/da/do/em resolvem o mesmo centro', () => {
    for (const content of [
      'Qual o maior gasto de Jacaraípe em setembro?',
      'Qual o maior gasto da Clínica Life Jacaraípe em setembro?',
      'Qual o maior gasto do centro de custo Jacaraípe em setembro?',
      'Qual o maior gasto em Jacaraípe em setembro?',
      'Qual o maior gasto de Jacaraipe em setembro?',
    ]) {
      const result = interpret(content);
      expect(result.entity).toMatchObject({ status: 'RESOLVED', officialName: 'Clínica Life Jacaraípe' });
      expect(result.period).toEqual({ kind: 'MONTH', monthKey: '2026-09', origin: 'QUESTION' });
    }
  });

  it('D — centro ambíguo no catálogo fica AMBIGUOUS com candidatos', () => {
    const result = interpret('Qual o maior gasto da Serra nos últimos três meses?');
    expect(result.entity.status).toBe('AMBIGUOUS');
    expect(result.status).toBe('NEEDS_CLARIFICATION');
  });

  it('E — períodos explícitos e relativos são estruturados e não contaminam a entidade', () => {
    const cases: Array<[string, unknown]> = [
      ['Qual o maior gasto de Jacaraípe em setembro?', { kind: 'MONTH' }],
      ['Qual o maior gasto de Jacaraípe no mês passado?', { kind: 'MONTH' }],
      ['Qual o maior gasto de Jacaraípe este mês?', { kind: 'MONTH' }],
      ['Qual o maior gasto de Jacaraípe de agosto a outubro?', { kind: 'MONTH_WINDOW', endMonthKey: '2026-10', count: 3, form: 'EXPLICIT_RANGE' }],
      ['Qual o maior gasto de Jacaraípe entre julho e setembro de 2026?', { kind: 'MONTH_WINDOW', endMonthKey: '2026-09', count: 3, form: 'EXPLICIT_RANGE' }],
      ['Qual o maior gasto de Jacaraípe nos últimos dois meses?', { kind: 'MONTH_WINDOW', endMonthKey: '2026-10', count: 2, form: 'LAST_N_MONTHS' }],
      ['Qual o maior gasto de Jacaraípe nos 6 últimos meses?', { kind: 'MONTH_WINDOW', endMonthKey: '2026-10', count: 6, form: 'LAST_N_MONTHS' }],
      ['Qual o maior gasto de Jacaraípe nesse período?', { kind: 'ANAPHORA' }],
      ['Qual o maior gasto de Jacaraípe no último trimestre?', { kind: 'UNSUPPORTED', reason: 'QUARTER' }],
      ['Qual o maior gasto de Jacaraípe no último mês?', { kind: 'UNSUPPORTED', reason: 'AMBIGUOUS_LAST_MONTH' }],
      ['Qual o maior gasto de Jacaraípe nos últimos 30 meses?', { kind: 'UNSUPPORTED', reason: 'WINDOW_TOO_LARGE' }],
    ];
    for (const [content, expected] of cases) {
      const parsed = parseAdvisorPeriodExpression({ content, anchorMonthKey: MONTH, referenceMonthKey: MONTH, now: NOW });
      expect(parsed.expression, content).toEqual(expected);
      const masked = maskAdvisorTextSpans(foldAdvisorInterpretationText(content), parsed.spans)
        .replace(/\s+/g, ' ')
        .trim();
      expect(masked, content).toMatch(/^qual o maior gasto de jacaraipe ?\??$/);
    }
    expect(interpret('Qual o maior gasto de Jacaraípe no mês passado?').period).toEqual({
      kind: 'MONTH',
      monthKey: '2026-09',
      origin: 'QUESTION',
    });
  });

  it('E — "últimos N meses" tem uma semântica só (igual à série de faturamento)', () => {
    expect(listAdvisorMonthWindowKeys('2026-10', 3)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(listBillingSeriesMonthKeys('2026-10', 3)).toEqual(listAdvisorMonthWindowKeys('2026-10', 3));
    expect(listAdvisorMonthWindowKeys('2026-01', 2)).toEqual(['2025-12', '2026-01']);
  });

  it('F — TOP_1, TOP_N e números de período nunca viram cardinalidade', () => {
    const card = (content: string) => {
      const parsed = parseAdvisorPeriodExpression({ content, anchorMonthKey: MONTH });
      return parseAdvisorRankingCardinality(
        maskAdvisorTextSpans(foldAdvisorInterpretationText(content), parsed.spans),
      );
    };
    expect(card('maior gasto nos últimos três meses')).toEqual({ kind: 'TOP_1', limit: 1, source: 'SINGULAR' });
    expect(card('gasto mais alto de X')).toEqual({ kind: 'TOP_1', limit: 1, source: 'SINGULAR' });
    expect(card('os 3 maiores gastos nos últimos seis meses')).toEqual({ kind: 'TOP_N', limit: 3, source: 'EXPLICIT_NUMBER' });
    expect(card('os dez maiores gastos nos últimos três meses')).toEqual({ kind: 'TOP_N', limit: 10, source: 'WRITTEN_NUMBER' });
    expect(card('maiores gastos nos últimos dois meses')).toEqual({ kind: 'TOP_N', limit: 5, source: 'DEFAULT_PLURAL' });
    expect(card('top 7 despesas de agosto a outubro')).toEqual({ kind: 'TOP_N', limit: 7, source: 'EXPLICIT_NUMBER' });
  });

  it('nenhuma regra depende do cliente: outro catálogo, mesma interpretação', () => {
    const content = 'Nos últimos três meses, qual foi o maior gasto da Filial Norte?';
    const period = resolveAdvisorConversationalPeriod({ content, referenceMonthKey: MONTH, now: NOW });
    const demand = deriveQuestionAnalyticalDemand({
      content,
      comparison: false,
      catalog: CATALOGS['tenant-b']!.map((row) => ({ id: row.id, name: row.name, code: row.code })),
    });
    const result = interpretAdvisorQuestion({ content, conversationalPeriod: period, demand, now: NOW });
    expect(result.entity).toMatchObject({ status: 'RESOLVED', officialName: 'Filial Norte' });
    expect(result.period).toMatchObject({ kind: 'MONTH_WINDOW', count: 3 });
    expect(result.cardinality.kind).toBe('TOP_1');
  });
});

// ---------------------------------------------------------------------------
// Entrypoint: entidades, períodos, cardinalidade
// ---------------------------------------------------------------------------

describe('A2 — entrypoint: entidades', () => {
  it('D — centro inexistente: "não encontrei" só quando o catálogo não reconhece', async () => {
    const harness = createHarness();
    const result = await harness.ask('Qual o maior gasto de Centro Fantasma nos últimos três meses?');
    expect(result.consultantMessage.content).toBe(
      'Não encontrei o centro de custo "centro fantasma" no cadastro desta empresa.',
    );
    expect(result.analyticalOutcome).toBe('NO_DATA');
    // Entidade inexistente não depende do mês: uma consulta basta.
    expect(harness.calls).toHaveLength(1);
    expect(harness.bag().slots.lastAnalyticalQuery).toBeNull();
  });

  it('D — centro ambíguo no catálogo pede esclarecimento sem consultar valores', async () => {
    const harness = createHarness();
    const result = await harness.ask('Qual o maior gasto da Serra nos últimos três meses?');
    expect(result.consultantMessage.content).toBe(
      'Há mais de um centro de custo correspondente (Unidade Serra, Unidade Serra Sul). Especifique qual deles.',
    );
    expect(result.analyticalOutcome).toBe('CLARIFICATION_REQUIRED');
    expect(harness.calls).toHaveLength(0);
  });

  it('D — nome exato de um candidato desfaz ambiguidade de token', async () => {
    const harness = createHarness({
      lines: [
        { tenantId: 'tenant-a', costCenterId: 'cc-serra', monthKey: '2026-09', occurredOn: '09/09/2026', attributed: '410.00', description: 'Manutenção' },
      ],
    });
    const result = await harness.ask('Qual o maior gasto de Unidade Serra nos últimos três meses?');
    expect(result.consultantMessage.content).toContain('de Unidade Serra entre agosto de 2026');
    expect(result.consultantMessage.content).toContain('R$ 410,00');
    expect(harness.calls.every((call) => call.costCenterQuery === 'Unidade Serra')).toBe(true);
  });

  it('D — termo comum a parte dos centros clarifica listando os candidatos', async () => {
    const harness = createHarness();
    const result = await harness.ask('Qual o maior gasto de Clínica Life?');
    // "clinica life" está em 2 dos 4 centros do tenant: ambíguo pelo catálogo, sem consulta.
    expect(result.consultantMessage.content).toBe(
      'Há mais de um centro de custo correspondente (Clínica Life Jacaraípe, Clínica Life Laranjeiras). Especifique qual deles.',
    );
    expect(harness.calls).toHaveLength(0);
    expect(result.analyticalOutcome).toBe('CLARIFICATION_REQUIRED');
  });

  it('B/C — nome oficial e preposições chegam à tool como nome oficial do catálogo', async () => {
    for (const question of [
      'Qual o maior gasto da Clínica Life Jacaraípe em setembro?',
      'Qual o maior gasto do centro de custo Jacaraípe em setembro?',
      'Qual o maior gasto em Jacaraípe em setembro?',
    ]) {
      const harness = createHarness();
      const result = await harness.ask(question);
      expect(result.consultantMessage.content, question).toContain('R$ 1.200,00');
      expect(harness.calls, question).toEqual([
        { tenantId: 'tenant-a', monthKey: '2026-09', costCenterQuery: 'Clínica Life Jacaraípe', limit: 1 },
      ]);
    }
  });
});

describe('A2 — entrypoint: períodos e cardinalidade', () => {
  it('E — intervalo explícito vira janela; mês passado vira mês único', async () => {
    const range = createHarness();
    await range.ask('Qual o maior gasto de Laranjeiras de agosto a outubro?');
    expect(monthsOf(range.calls)).toEqual(['2026-08', '2026-09', '2026-10']);

    const relative = createHarness();
    const result = await relative.ask('Qual o maior gasto de Laranjeiras no mês passado?');
    expect(monthsOf(relative.calls)).toEqual(['2026-09']);
    expect(result.consultantMessage.content).toContain('setembro de 2026');
  });

  it('F — "os 3 maiores gastos nos últimos seis meses": TOP_N=3 e janela de 6', async () => {
    const harness = createHarness();
    const result = await harness.ask('Quais os 3 maiores gastos de Jacaraípe nos últimos seis meses?');
    expect(monthsOf(harness.calls)).toEqual([
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
      '2026-09',
      '2026-10',
    ]);
    expect(harness.calls.every((call) => call.limit === 3)).toBe(true);
    expect(result.consultantMessage.content).toBe(
      [
        'Os 3 maiores gastos individuais (saídas realizadas de caixa) de Clínica Life Jacaraípe entre maio de 2026 e outubro de 2026 (6 meses) foram:',
        '1. Equipamento — Fornecedor Alfa (10/09/2026): R$ 1.200,00*',
        '2. Aluguel (05/08/2026): R$ 900,00',
        '3. Folha (05/10/2026): R$ 700,00.',
        '* Valor atribuído ao centro pelo rateio oficial; a baixa total foi maior.',
      ].join('\n'),
    );
  });

  it('F — ranking entre centros não vira lookup com menção-lixo', async () => {
    const harness = createHarness();
    await harness.ask('Qual centro de custo teve o maior gasto?');
    expect(harness.toolNames).not.toContain('cash_cost_center_lookup');
    expect(harness.calls).toHaveLength(0);
  });

  it('R — granularidade sem regra oficial vira limitação explícita, sem consulta', async () => {
    const harness = createHarness();
    const result = await harness.ask('Qual foi a maior despesa de Jacaraípe no último trimestre?');
    expect(result.consultantMessage.content).toBe(
      'Ainda não tenho regra oficial para trimestre nesta consulta. Informe os meses (por exemplo, "nos últimos 3 meses" ou "de julho a setembro").',
    );
    expect(result.analyticalOutcome).toBe('UNSUPPORTED');
    expect(harness.calls).toHaveLength(0);
  });

  it('R — soma de saídas por centro em janela não existe: limitação, nunca mês silencioso', async () => {
    const harness = createHarness();
    const result = await harness.ask('Quanto Jacaraípe gastou nos últimos três meses?');
    expect(result.consultantMessage.content).toContain(
      'Ainda não consigo consultar saídas de caixa de uma janela de 3 meses de uma vez nesta pergunta.',
    );
    expect(result.factualAnswer?.providerCalled).toBe(false);
    expect(result.analyticalOutcome).toBe('UNSUPPORTED');
    expect(harness.toolNames).toHaveLength(0);
    expect(harness.openai.generateCalls).toHaveLength(0);
  });

  it('R — entradas de caixa em janela também não são convertidas em mês', async () => {
    const harness = createHarness();
    const result = await harness.ask('Quanto entrou no caixa de Jacaraípe nos últimos três meses?');
    expect(result.consultantMessage.content).toContain('entradas de caixa de uma janela de 3 meses');
    expect(harness.toolNames).toHaveLength(0);
  });

  it('PERIOD ANAPHORA sem contexto pede o período', async () => {
    const harness = createHarness();
    const result = await harness.ask('Qual foi a maior despesa de Jacaraípe nesse período?');
    expect(result.consultantMessage.content).toContain('Não há um período anterior nesta conversa');
    expect(harness.calls).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Continuidade e precedência
// ---------------------------------------------------------------------------

describe('A2 — continuidade', () => {
  it('H — troca de centro após janela preserva janela e TOP_1', async () => {
    const harness = createHarness();
    await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    harness.calls.length = 0;
    const result = await harness.ask('E de Laranjeiras?');
    expect(result.consultantMessage.content).toContain('Clínica Life Laranjeiras entre agosto de 2026 e outubro de 2026');
    expect(result.consultantMessage.content).toContain('R$ 2.500,00');
    expect(monthsOf(harness.calls)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(harness.calls.every((call) => call.limit === 1)).toBe(true);
  });

  it('I — troca de período: janela → outra janela → mês', async () => {
    const harness = createHarness();
    await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    harness.calls.length = 0;
    const two = await harness.ask('E nos últimos dois meses?');
    expect(monthsOf(harness.calls)).toEqual(['2026-09', '2026-10']);
    expect(two.consultantMessage.content).toContain('entre setembro de 2026 e outubro de 2026 (2 meses)');
    harness.calls.length = 0;
    const september = await harness.ask('E em setembro?');
    expect(monthsOf(harness.calls)).toEqual(['2026-09']);
    expect(september.consultantMessage.content).toContain('setembro de 2026');
  });

  it('I — "E de X nos últimos três meses?" após faturamento: entidade limpa + janela', async () => {
    const harness = createHarness();
    await harness.ask('Faturamento de Laranjeiras nos últimos três meses');
    const result = await harness.ask('E de Jacaraípe nos últimos três meses?');
    expect(result.consultantMessage.content).toContain('Clínica Life Jacaraípe');
    expect(result.consultantMessage.content).not.toMatch(/não encontrei/i);
    const last = harness.bag().slots.lastAnalyticalQuery;
    expect(last?.capabilityKey).toBe('billing.cost_center.series.months');
    expect(last?.query.filters?.costCenterQuery).toMatch(/jacara/i);
    expect(last?.query.filters?.costCenterQuery).not.toMatch(/ultimos|meses/i);
  });

  it('J — continuidade legítima de faturamento continua igual', async () => {
    const harness = createHarness();
    await harness.ask('Como está o faturamento de Laranjeiras?');
    const result = await harness.ask('E de Jacaraípe?');
    expect(result.consultantMessage.content).toBe(
      'Faturamento oficial de Clínica Life Jacaraípe em outubro de 2026: R$ 300,00.',
    );
    expect(harness.calls).toHaveLength(0);
  });

  it('G — troca de métrica com janela não vira mês silencioso', () => {
    const prior = lastAnalyticalQueryFromBilling({
      capabilityKey: 'billing.cost_center.series.months',
      monthKey: '2026-10',
      count: 3,
      costCenterQuery: 'Jacaraípe',
      structuredStatus: 'OK',
    })!;
    const applied = applyAnalyticalDimensionPatch({
      prior,
      patch: { metric: 'REALIZED_CASH', direction: 'INFLOW' },
    });
    expect(applied.ok).toBe(false);
    if (applied.ok) return;
    expect(applied.reason).toBe('WINDOW_NOT_SUPPORTED_FOR_METRIC');
  });

  it('K — NEW_QUERY depois de BILLING não herda a métrica', async () => {
    const harness = createHarness();
    await harness.ask('Como está o faturamento de Jacaraípe?');
    const result = await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    expect(result.consultantMessage.content).not.toMatch(/faturamento/i);
    expect(harness.bag().slots.lastAnalyticalQuery?.query.metric).toBe('REALIZED_CASH');
  });

  it('L — NEW_QUERY depois de REALIZED_CASH volta para BILLING sem tools de movimento', async () => {
    const harness = createHarness();
    await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    harness.calls.length = 0;
    const result = await harness.ask('Como está o faturamento de Laranjeiras?');
    expect(result.consultantMessage.content).toBe(
      'Faturamento oficial de Clínica Life Laranjeiras em outubro de 2026: R$ 700,00.',
    );
    expect(harness.calls).toHaveLength(0);
    expect(harness.bag().slots.lastAnalyticalQuery?.query.metric).toBe('BILLING');
  });

  it('N — falha anterior não deixa contexto antigo para o próximo "E de X?"', async () => {
    const harness = createHarness();
    await harness.ask('Como está o faturamento de Laranjeiras?');
    const failed = await harness.ask('Qual o maior gasto de Centro Fantasma nos últimos três meses?');
    expect(failed.consultantMessage.content).toContain('Não encontrei');
    // last de BILLING foi invalidado pela NEW_QUERY explícita (política C.2.7, central).
    expect(harness.bag().slots.lastAnalyticalQuery).toBeNull();
    const next = await harness.ask('E de Jacaraípe?');
    expect(next.consultantMessage.content).not.toMatch(/faturamento/i);
  });

  it('M — Pending ALTERNATIVES não relacionado não bloqueia a consulta de janela', async () => {
    const pending = createPendingAnalyticalAction({
      id: 'pend-alt-a2',
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
    })!;
    const harness = createHarness({
      initialBag: mergeAdvisorConversationBag(emptyAdvisorConversationBag(), {
        pendingAnalyticalAction: pending,
      }),
      providerScript: [{ text: JSON.stringify({ decision: 'UNRELATED' }) }],
    });
    const result = await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    expect(result.consultantMessage.content).toContain('R$ 1.200,00');
    expect(harness.bag().slots.pendingAnalyticalAction).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Tenant, provenance, dados, rateio, semântica
// ---------------------------------------------------------------------------

describe('A2 — tenant, provenance e semântica financeira', () => {
  it('O — tenant B não enxerga centros nem lançamentos do tenant A', async () => {
    const b = createHarness({ tenantId: 'tenant-b' });
    const foreign = await b.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    expect(foreign.consultantMessage.content).toBe(
      'Não encontrei o centro de custo "jacaraipe" no cadastro desta empresa.',
    );
    expect(b.calls.every((call) => call.tenantId === 'tenant-b')).toBe(true);

    const own = await b.ask('Qual o maior gasto da Filial Norte nos últimos três meses?');
    expect(own.consultantMessage.content).toContain('R$ 333,00');
    expect(own.consultantMessage.content).not.toMatch(/1\.200|Jacara|Laranj/);
    expect(b.calls.every((call) => call.tenantId === 'tenant-b')).toBe(true);
  });

  it('P — provenance: tool oficial mensal por mês, trilha COST_CENTER e capability publicada', async () => {
    const harness = createHarness();
    const result = await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    expect(harness.toolNames).toEqual([
      'cash_cost_center_movement_lines',
      'cash_cost_center_movement_lines',
      'cash_cost_center_movement_lines',
    ]);
    expect(result.factualAnswer?.factKind).toBe('REALIZED_CASH_COST_CENTER_MOVEMENT_LINES_WINDOW');
    expect(result.analyticalOutcome).toBe('ANSWERED');
    const trail = harness.trails.at(-1)!;
    expect(trail.answerSource).toBe('COST_CENTER');
    expect(trail.traces.map((trace) => trace.toolName)).toEqual([
      'cash_cost_center_movement_lines',
      'cash_cost_center_movement_lines',
      'cash_cost_center_movement_lines',
    ]);
    const validation = validateAnalyticalCapability(
      buildCostCenterMovementsWindowQuery({ endMonthKey: '2026-10', count: 3, costCenterQuery: 'X', limit: 1 }),
    );
    expect(validation.ok && validation.capability.key).toBe('realized_cash.cost_center.window.movements');
  });

  it('Q — ausência de movimentações na janela é dita como tal', async () => {
    const harness = createHarness({ lines: [] });
    const result = await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    expect(result.consultantMessage.content).toBe(
      'Não há saídas realizadas atribuídas a Clínica Life Jacaraípe entre agosto de 2026 e outubro de 2026 (3 meses).',
    );
    expect(result.analyticalOutcome).toBe('NO_DATA');
  });

  it('Q — mês sem atribuição oficial fica fora com aviso (PARTIAL), sem somar em silêncio', async () => {
    const harness = createHarness({ unavailable: ['tenant-a:2026-09'] });
    const result = await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    expect(result.consultantMessage.content).toBe(
      'O maior gasto individual (saída realizada de caixa) de Clínica Life Jacaraípe entre agosto de 2026 e outubro de 2026 (3 meses) foi R$ 900,00, referente a Aluguel, em 05/08/2026. Atenção: setembro de 2026 não tem atribuição oficial de saídas por centro disponível e ficou fora da busca; o resultado considera só os demais meses.',
    );
    expect(result.analyticalOutcome).toBe('PARTIAL');
    // PARTIAL não promove last (doc 21: só OK/EMPTY).
    expect(harness.bag().slots.lastAnalyticalQuery).toBeNull();
  });

  it('Q — janela inteira sem atribuição oficial: limitação, nenhum valor', async () => {
    const harness = createHarness({
      unavailable: ['tenant-a:2026-08', 'tenant-a:2026-09', 'tenant-a:2026-10'],
    });
    const result = await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    expect(result.consultantMessage.content).not.toMatch(/R\$/);
    expect(result.consultantMessage.content).toContain('Não há atribuição oficial de saídas por centro');
  });

  it('S — rateio: ranking pelo valor atribuído ao centro, nunca pela baixa total', () => {
    const fact = mergeCostCenterMovementsWindow({
      endMonthKey: '2026-10',
      count: 1,
      direction: 'OUTFLOW',
      limit: 2,
      months: [
        {
          monthKey: '2026-10',
          fact: {
            status: 'OK',
            costCenter: { costCenterId: 'c', name: 'Centro', code: null },
            costCenterAmount: '850',
            lines: [
              { occurredOn: '06/10/2026', attributedAmount: '150', originalSettlementAmount: '5000', description: 'Compartilhado' },
              { occurredOn: '05/10/2026', attributedAmount: '700', originalSettlementAmount: '700', description: 'Folha' },
            ],
          },
        },
      ],
    });
    const lines = fact.lines as Array<Record<string, unknown>>;
    expect(lines.map((line) => line.description)).toEqual(['Folha', 'Compartilhado']);
  });

  it('T — gasto individual ≠ despesa agregada por categoria', async () => {
    const harness = createHarness();
    const individual = await harness.ask('Qual o maior gasto de Jacaraípe nos últimos três meses?');
    expect(individual.consultantMessage.content).toContain('maior gasto individual');
    expect(individual.consultantMessage.content).not.toMatch(/categoria/i);

    const aggregate = createHarness();
    const category = await aggregate.ask(
      'Qual a categoria com maior despesa de Jacaraípe nos últimos três meses?',
    );
    expect(aggregate.calls).toHaveLength(0);
    expect(category.consultantMessage.content).not.toContain('gasto individual');
  });

  it('LastAnalyticalQuery de janela é persistível e revalidado pelo parser', () => {
    const last = lastAnalyticalQueryFromCostCenterMovements({
      monthKey: '2026-10',
      costCenterQuery: 'Centro',
      limit: 1,
      windowMonths: 3,
    });
    expect(last?.capabilityKey).toBe('realized_cash.cost_center.window.movements');
    const roundTrip = parseAdvisorConversationBag(
      serializeAdvisorConversationBag(
        mergeAdvisorConversationBag(emptyAdvisorConversationBag(), { lastAnalyticalQuery: last }),
      ),
    );
    expect(roundTrip.slots.lastAnalyticalQuery?.query.period).toEqual({
      kind: 'MONTH_WINDOW',
      endMonthKey: '2026-10',
      count: 3,
    });
  });
});

// ---------------------------------------------------------------------------
// A2.1 — escopo de centro: regra universal (sem marca/cliente) e robustez
// ---------------------------------------------------------------------------

describe('A2.1 — detectExplicitCostCenterScope universal', () => {
  const catalog = (names: readonly string[]) =>
    names.map((name, index) => ({ id: `c${index}`, name, code: null }));
  const scope = (question: string, names: readonly string[]) =>
    detectExplicitCostCenterScope(question, catalog(names));

  it('token exclusivo do centro no catálogo do tenant identifica o centro (qualquer marca)', () => {
    for (const [names, question, expected] of [
      [['Clínica Sorriso Centro', 'Clínica Sorriso Praia'], 'Qual o maior gasto de Praia?', 'Clínica Sorriso Praia'],
      [['Padaria Pão Quente', 'Padaria Life Style'], 'Gastos da Life Style em setembro', 'Padaria Life Style'],
      [['Clínica Life Jacaraípe', 'Clínica Life Laranjeiras'], 'Maior gasto de Jacaraípe', 'Clínica Life Jacaraípe'],
    ] as const) {
      expect(scope(question, names), question).toMatchObject({ status: 'FOUND', resolvedName: expected });
    }
  });

  it('prefixo comum a todos os centros (marca) não escolhe centro algum', () => {
    expect(scope('Qual o maior gasto da Clínica Life?', ['Clínica Life Jacaraípe', 'Clínica Life Laranjeiras']).status).toBe('ABSENT');
    expect(scope('Quanto gastou a clínica Sorriso?', ['Clínica Sorriso Centro', 'Clínica Sorriso Praia']).status).toBe('ABSENT');
    expect(scope('Maior gasto de Life Fitness', ['Life Fitness Norte', 'Life Fitness Sul']).status).toBe('ABSENT');
  });

  it('"clinica" e "life" não são palavras especiais: valem pelo catálogo do tenant', () => {
    expect(scope('Maior gasto da clínica', ['Hospital Clínica', 'Administrativo'])).toMatchObject({
      status: 'FOUND',
      resolvedName: 'Hospital Clínica',
    });
    expect(scope('Gastos da Life em setembro', ['Life Spa', 'Recepção Geral'])).toMatchObject({
      status: 'FOUND',
      resolvedName: 'Life Spa',
    });
  });

  it('nome completo mais longo vence nome contido nele', () => {
    expect(scope('Maior gasto da Unidade Serra Sul', ['Unidade Serra', 'Unidade Serra Sul'])).toMatchObject({
      status: 'FOUND',
      resolvedName: 'Unidade Serra Sul',
    });
    expect(scope('Maior gasto da Unidade Serra', ['Unidade Serra', 'Unidade Serra Sul'])).toMatchObject({
      status: 'FOUND',
      resolvedName: 'Unidade Serra',
    });
  });

  it('palavra estrutural genérica não identifica centro', () => {
    expect(scope('Qual unidade gastou mais?', ['Unidade Norte', 'Unidade Sul Litoral']).status).toBe('ABSENT');
  });

  it('não entra em loop com perguntas sem centro ("Quanto gastou…", "Gastos de … em …")', () => {
    const started = Date.now();
    for (const question of [
      'Quanto gastou a empresa em setembro?',
      'Gastos de pessoal em setembro',
      'Recepção teve quanto de saída?',
    ]) {
      expect(scope(question, ['Matriz Administrativa', 'Loja Centro']).status).not.toBe('FOUND');
    }
    expect(Date.now() - started).toBeLessThan(2_000);
  });
});


describe('A2.1 — semântica de gasto/despesa e centros inativos', () => {
  it('"maior despesa" num mês diz a métrica (saída realizada), sem fingir despesa oficial', async () => {
    const harness = createHarness();
    const result = await harness.ask('Qual foi a maior despesa de Jacaraípe em setembro?');
    expect(result.consultantMessage.content).toBe(
      'O maior gasto de Clínica Life Jacaraípe em setembro de 2026 foi R$ 1.200,00, referente a Equipamento — Fornecedor Alfa, em 10/09/2026. Considerei saídas realizadas de caixa atribuídas ao centro (lançamentos pagos), não a despesa oficial por competência.',
    );
  });

  it('"maior gasto" e "maior saída" seguem idênticos ao fluxo homologado (sem nota)', async () => {
    const gasto = await createHarness().ask('Qual foi o maior gasto de Jacaraípe em setembro?');
    const saida = await createHarness().ask('Qual foi a maior saída de Jacaraípe em setembro?');
    expect(gasto.consultantMessage.content).not.toContain('despesa oficial');
    expect(saida.consultantMessage.content).toBe(gasto.consultantMessage.content);
  });

  it('"maior movimentação" sem direção pede esclarecimento, sem consultar valores', async () => {
    for (const question of [
      'Qual a maior movimentação de Jacaraípe em setembro?',
      'Qual a maior movimentação de Jacaraípe nos últimos três meses?',
      'Qual o lançamento mais alto de Jacaraípe?',
    ]) {
      const harness = createHarness();
      const result = await harness.ask(question);
      expect(result.consultantMessage.content, question).toBe(
        'Você quer o maior lançamento de saída (gasto pago) ou de entrada (recebimento)? Informe a direção para eu consultar o valor oficial.',
      );
      expect(result.analyticalOutcome).toBe('CLARIFICATION_REQUIRED');
      expect(harness.toolNames).toHaveLength(0);
      expect(harness.openai.generateCalls).toHaveLength(0);
    }
  });

  it('"despesa oficial" por centro não recebe valor sem evidência', async () => {
    const harness = createHarness();
    const result = await harness.ask('Qual a despesa oficial de Jacaraípe em setembro?');
    expect(result.consultantMessage.content).not.toMatch(/R\$/);
    expect(harness.calls).toHaveLength(0);
  });

  it('centro inativo continua consultável no histórico pela menção (tool resolve todos os centros)', async () => {
    const harness = createHarness();
    const result = await harness.ask('Qual o maior gasto da Unidade Antiga Barra em agosto?');
    expect(result.consultantMessage.content).toContain('R$ 620,00');
    expect(harness.calls).toEqual([
      { tenantId: 'tenant-a', monthKey: '2026-08', costCenterQuery: 'unidade antiga barra', limit: 1 },
    ]);
  });
});

describe('A2.1 — compatibilidade de contexto persistido', () => {
  it('bag anterior ao A2 (estado C.1 sem windowMonths, last mensal) continua válido e utilizável', async () => {
    const legacy = {
      version: 1,
      kind: 'ADVISOR_CONVERSATION_BAG',
      slots: {
        costCenterOutflowMovements: {
          version: 1,
          kind: 'COST_CENTER_OUTFLOW_MOVEMENTS',
          semanticFamily: 'FLOW',
          metric: 'REALIZED_CASH',
          direction: 'OUTFLOW',
          regime: 'REALIZED',
          operation: 'MOVEMENTS',
          dimension: 'COST_CENTER',
          monthKey: '2026-09',
          periodSource: 'EXPLICIT',
          limit: 1,
          costCenterQuery: 'Clínica Life Jacaraípe',
        },
      },
    };
    const parsedLegacy = parseAdvisorConversationBag(
      serializeAdvisorConversationBag(
        mergeAdvisorConversationBag(emptyAdvisorConversationBag(), {
          costCenterOutflowMovements: legacy.slots.costCenterOutflowMovements as never,
        }),
      ),
    );
    expect(parsedLegacy.slots.costCenterOutflowMovements?.windowMonths).toBeUndefined();
    const harness = createHarness({ initialBag: parsedLegacy });
    const result = await harness.ask('E em Laranjeiras?');
    // Herda o mês do estado antigo (setembro), sem janela inventada.
    expect(harness.calls).toEqual([
      { tenantId: 'tenant-a', monthKey: '2026-09', costCenterQuery: 'Clínica Life Laranjeiras', limit: 1 },
    ]);
    expect(result.consultantMessage.content).toContain('setembro de 2026');
  });
});
