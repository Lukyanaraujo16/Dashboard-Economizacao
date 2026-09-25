import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { CashSettlementSource } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import {
  ADVISOR_FACTUAL_COMPOSER_VERSION,
  AI_PROVIDER_MODEL_CATALOG,
  assertCashCostCenterLookupArgs,
  assertCashCostCenterRankingArgs,
  aggregateAdvisorCostCenterDimension,
  composeAdvisorFactualAnswer,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
  lookupAdvisorCostCenter,
  rankAdvisorCostCenterDimension,
  resolveAdvisorConversationalPeriod,
  resolveAdvisorCostCenterIntent,
  resolveAdvisorCurrentSnapshotIntent,
  resolveAdvisorDrilldownIntent,
  serializeAdvisorCostCenterLookup,
  serializeAdvisorCostCenterRanking,
  CASH_COST_CENTER_LOOKUP_TOOL_NAME,
  CASH_COST_CENTER_RANKING_TOOL_NAME,
  type BuildAdvisorContextInput,
} from '../src/modules/advisor/index.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
  UpdateAiRunInput,
} from '../src/modules/advisor/domain/types.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function installment(input: {
  readonly externalId: string;
  readonly total: string;
  readonly paid: string;
  readonly unpaid?: string;
  readonly dueDate?: Date;
  readonly competenceDate?: Date | null;
}): Pick<FinancialInstallmentReadRecord, 'externalId' | 'total' | 'paid' | 'unpaid' | 'dueDate'> {
  return {
    externalId: input.externalId,
    total: dec(input.total),
    paid: dec(input.paid),
    unpaid: dec(input.unpaid ?? '0'),
    dueDate: input.dueDate ?? new Date('2026-08-10T00:00:00.000Z'),
  };
}

function settlement(input: {
  readonly id: string;
  readonly installmentExternalId: string;
  readonly net: string;
  readonly occurredOn?: Date;
  readonly type?: CashSettlementSource['transactionType'];
  readonly kind?: CashSettlementSource['installmentKind'];
}): CashSettlementSource {
  return {
    settlementExternalId: input.id,
    installmentExternalId: input.installmentExternalId,
    installmentKind: input.kind ?? 'PAYABLE',
    transactionType: input.type ?? 'DISBURSEMENT',
    occurredOn: input.occurredOn ?? new Date('2026-08-15T00:00:00.000Z'),
    netAmount: dec(input.net),
  };
}

const catalog = [
  { id: 'cc-admin', name: 'Administrativo', code: 'ADM' },
  { id: 'cc-ops', name: 'Operações', code: 'OPS' },
  { id: 'cc-clinic', name: 'Clínica', code: 'CLI' },
];

function sixtyFortyAggregation(options?: {
  readonly net?: string;
  readonly unresolved?: boolean;
  readonly error?: boolean;
  readonly unavailable?: boolean;
  readonly withoutAllocation?: boolean;
  readonly extraSettlement?: CashSettlementSource;
}) {
  const net = options?.net ?? '10000';
  const title = installment({
    externalId: 'ap-1',
    total: '10000',
    paid: options?.unavailable ? '5000' : '10000',
    unpaid: options?.unavailable ? '5000' : '0',
  });
  const allocations = options?.withoutAllocation
    ? []
    : [
        {
          costCenterId: 'cc-admin',
          installmentKind: 'PAYABLE' as const,
          amount: dec('6000'),
          installment: title,
          confirmed: options?.unresolved || options?.error ? false : !options?.unavailable || true,
        },
        {
          costCenterId: 'cc-ops',
          installmentKind: 'PAYABLE' as const,
          amount: dec('4000'),
          installment: title,
          confirmed: options?.unresolved || options?.error ? false : true,
        },
      ];
  if (options?.unresolved || options?.error) {
    allocations.splice(0, allocations.length);
  }
  return aggregateAdvisorCostCenterDimension({
    monthKey: '2026-08',
    direction: 'OUTFLOW',
    today: new Date('2026-09-25T15:00:00.000Z'),
    populationAmount: dec(net).plus(options?.extraSettlement?.netAmount ?? 0),
    settlements: [
      settlement({ id: 's1', installmentExternalId: 'ap-1', net }),
      ...(options?.extraSettlement === undefined ? [] : [options.extraSettlement]),
    ],
    allocations,
    catalog,
  });
}

function inflowAggregation() {
  const title = installment({ externalId: 'ar-1', total: '2000', paid: '2000' });
  return aggregateAdvisorCostCenterDimension({
    monthKey: '2026-08',
    direction: 'INFLOW',
    today: new Date('2026-09-25T15:00:00.000Z'),
    populationAmount: dec('2000'),
    settlements: [
      settlement({
        id: 'r1',
        installmentExternalId: 'ar-1',
        net: '2000',
        type: 'RECEIPT',
        kind: 'RECEIVABLE',
      }),
    ],
    allocations: [
      {
        costCenterId: 'cc-clinic',
        installmentKind: 'RECEIVABLE',
        amount: dec('2000'),
        installment: title,
        confirmed: true,
      },
    ],
    catalog,
  });
}

function periodOf(content: string) {
  return resolveAdvisorConversationalPeriod({
    content,
    now: new Date('2026-09-25T18:00:00.000Z'),
  });
}

function settings(tenantId = 'tenant-a'): AiTenantSettingsRecord {
  const now = new Date('2026-09-25T12:00:00.000Z');
  return {
    id: `set-${tenantId}`,
    tenantId,
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

function conversation(tenantId = 'tenant-a', userId = 'user-a', id = 'conv-a'): AiConversationRecord {
  const now = new Date('2026-09-25T12:00:00.000Z');
  return {
    id,
    tenantId,
    userId,
    status: 'OPEN',
    title: 't',
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
    createdAt: new Date('2026-09-25T12:00:00.000Z'),
  };
}

function createHarness(options?: {
  readonly toolContent?: string;
  readonly toolName?: string;
}) {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'resposta do provider' });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let messageSeq = 0;
  let runSeq = 0;
  const aggregation = sixtyFortyAggregation();
  const rankingFacts = serializeAdvisorCostCenterRanking({
    status: 'OK',
    aggregation,
    ranking: rankAdvisorCostCenterDimension(aggregation, 5),
  });
  const lookedUp = lookupAdvisorCostCenter(aggregation, catalog, 'Administrativo');
  const lookupFacts = serializeAdvisorCostCenterLookup({
    status: 'OK',
    aggregation,
    costCenterQuery: 'Administrativo',
    match: lookedUp.status === 'FOUND' ? lookedUp.center : null,
  });
  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        return tenantId === 'tenant-a' ? settings() : tenantId === 'tenant-b' ? settings('tenant-b') : null;
      },
    },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        if (tenantId === 'tenant-b') {
          return conversation('tenant-b', 'user-b', 'conv-b');
        }
        return conversationId === 'conv-a' && tenantId === 'tenant-a' && userId === 'user-a'
          ? conversation()
          : null;
      },
      async createMessage(tenantId, conversationId, input) {
        const created = message(`msg-${++messageSeq}`, input.senderType, input.content, tenantId, conversationId);
        messages.push(created);
        return created;
      },
      async updateConversationTitle() {
        return conversation();
      },
      async listMessages() {
        return messages;
      },
    },
    runs: {
      async createRun(tenantId, input) {
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
          createdAt: new Date(),
          finishedAt: input.finishedAt ?? null,
        };
        runs.push(created);
        return created;
      },
      async updateRun(tenantId, runId, input: UpdateAiRunInput) {
        const index = runs.findIndex((row) => row.id === runId && row.tenantId === tenantId);
        const current = runs[index]!;
        runs[index] = { ...current, status: input.status };
        return runs[index]!;
      },
    },
    context: {
      build: vi.fn(async (input: BuildAdvisorContextInput): Promise<AdvisorBuiltContext> => ({
        tenantId: input.tenantId,
        monthKey: input.monthKey,
        blocks: [
          { type: 'PLATFORM_INSTRUCTIONS', content: 'plataforma', trustLevel: 'PLATFORM' },
          { type: 'USER_QUESTION', content: input.question, trustLevel: 'UNTRUSTED' },
        ],
      })),
    },
    providers: createIaProviderRegistry({
      openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    analyticalTools: {
      tools: [],
      async execute({ tenantId, call }) {
        if (tenantId !== 'tenant-a') {
          return {
            id: call.id,
            name: call.name,
            ok: false,
            content: JSON.stringify({ status: 'UNAVAILABLE' }),
          };
        }
        const name = options?.toolName ?? call.name;
        const content =
          options?.toolContent ??
          JSON.stringify(name === CASH_COST_CENTER_LOOKUP_TOOL_NAME ? lookupFacts : rankingFacts);
        return { id: call.id, name, ok: true, content, monthKey: '2026-08' };
      },
    },
  });
  return { send, messages, openai, runs };
}

describe('F13.8.1D4.2 ranking e rateio', () => {
  it('winner OUTFLOW 60/40 e conserva identifiedAmount', () => {
    const aggregation = sixtyFortyAggregation();
    expect(aggregation.centers[0]?.name).toBe('Administrativo');
    expect(aggregation.centers[0]?.amount.toString()).toBe('6000');
    expect(aggregation.centers[1]?.amount.toString()).toBe('4000');
    expect(aggregation.identifiedAmount.toString()).toBe('10000');
    expect(
      aggregation.centers.reduce((sum, row) => sum.plus(row.amount), dec('0')).equals(aggregation.identifiedAmount),
    ).toBe(true);
    expect(aggregation.centers[0]?.shareOfPopulation?.toString()).toBe('60');
    expect(aggregation.centers[0]?.shareOfIdentified?.toString()).toBe('60');
  });

  it('top5 pede 5 e só há 2 identificados', () => {
    const ranking = rankAdvisorCostCenterDimension(sixtyFortyAggregation(), 5);
    expect(ranking.ranking).toHaveLength(2);
    expect(ranking.hasMore).toBe(false);
  });

  it('winner INFLOW', () => {
    const aggregation = inflowAggregation();
    expect(aggregation.centers[0]?.name).toBe('Clínica');
    expect(aggregation.centers[0]?.amount.toString()).toBe('2000');
  });

  it('empate é determinístico por nome', () => {
    const titleA = installment({ externalId: 'ap-a', total: '100', paid: '100' });
    const titleB = installment({ externalId: 'ap-b', total: '100', paid: '100' });
    const aggregation = aggregateAdvisorCostCenterDimension({
      monthKey: '2026-08',
      direction: 'OUTFLOW',
      today: new Date('2026-09-25T15:00:00.000Z'),
      populationAmount: dec('200'),
      settlements: [
        settlement({ id: 's-a', installmentExternalId: 'ap-a', net: '100' }),
        settlement({ id: 's-b', installmentExternalId: 'ap-b', net: '100' }),
      ],
      allocations: [
        {
          costCenterId: 'cc-ops',
          installmentKind: 'PAYABLE',
          amount: dec('100'),
          installment: titleA,
          confirmed: true,
        },
        {
          costCenterId: 'cc-clinic',
          installmentKind: 'PAYABLE',
          amount: dec('100'),
          installment: titleB,
          confirmed: true,
        },
      ],
      catalog,
    });
    expect(aggregation.centers.map((row) => row.name)).toEqual(['Clínica', 'Operações']);
  });

  it('net diferente do total rateia 60/40', () => {
    const aggregation = sixtyFortyAggregation({ net: '9000' });
    expect(aggregation.centers[0]?.amount.toString()).toBe('5400');
    expect(aggregation.centers[1]?.amount.toString()).toBe('3600');
    expect(aggregation.identifiedAmount.toString()).toBe('9000');
  });

  it('parcial UNAVAILABLE não identifica centro', () => {
    const aggregation = sixtyFortyAggregation({ unavailable: true });
    expect(aggregation.identifiedAmount.toString()).toBe('0');
    expect(aggregation.unidentifiedAmount.toString()).toBe('10000');
    expect(aggregation.centers).toHaveLength(0);
  });

  it('sem allocation, UNRESOLVED e ERROR ficam unidentified', () => {
    expect(sixtyFortyAggregation({ withoutAllocation: true }).identifiedAmount.toString()).toBe('0');
    expect(sixtyFortyAggregation({ unresolved: true }).identifiedAmount.toString()).toBe('0');
    expect(sixtyFortyAggregation({ error: true }).identifiedAmount.toString()).toBe('0');
  });

  it('coverage 100% e <100% com unidentified preservado', () => {
    const full = sixtyFortyAggregation();
    expect(full.coveragePercentage?.toString()).toBe('100');
    const partial = sixtyFortyAggregation({
      extraSettlement: settlement({ id: 's2', installmentExternalId: 'ap-orphan', net: '2000' }),
    });
    expect(partial.identifiedAmount.toString()).toBe('10000');
    expect(partial.unidentifiedAmount.toString()).toBe('2000');
    expect(partial.coveragePercentage?.toString()).toBe('83.333333333333333333');
  });

  it('denominador zero não vira Infinity', () => {
    const aggregation = aggregateAdvisorCostCenterDimension({
      monthKey: '2026-08',
      direction: 'OUTFLOW',
      today: new Date('2026-09-25T15:00:00.000Z'),
      populationAmount: dec('0'),
      settlements: [],
      allocations: [],
      catalog,
    });
    expect(aggregation.coveragePercentage).toBeNull();
    expect(aggregation.centers).toEqual([]);
  });
});

describe('F13.8.1D4.2 lookup', () => {
  it('nome exato, código, NOT_FOUND, AMBIGUOUS e zero real', () => {
    const aggregation = sixtyFortyAggregation();
    expect(lookupAdvisorCostCenter(aggregation, catalog, 'Administrativo').status).toBe('FOUND');
    expect(lookupAdvisorCostCenter(aggregation, catalog, 'ADM').status).toBe('FOUND');
    expect(lookupAdvisorCostCenter(aggregation, catalog, 'Inexistente').status).toBe('NOT_FOUND');
    const ambiguousCatalog = [
      ...catalog,
      { id: 'cc-admin-2', name: 'Administrativo Norte', code: 'ADMN' },
    ];
    expect(lookupAdvisorCostCenter(aggregation, ambiguousCatalog, 'Admin').status).toBe('AMBIGUOUS');
    const zero = lookupAdvisorCostCenter(aggregation, catalog, 'Clínica');
    expect(zero.status).toBe('FOUND');
    if (zero.status === 'FOUND') {
      expect(zero.center.amount.toString()).toBe('0');
    }
  });
});

describe('F13.8.1D4.2 temporal', () => {
  it('usa occurredOn e ignora competenceDate/dueDate diferentes', () => {
    const august = settlement({
      id: 's-aug',
      installmentExternalId: 'ap-aug',
      net: '300',
      occurredOn: new Date('2026-08-20T00:00:00.000Z'),
    });
    const title = installment({
      externalId: 'ap-aug',
      total: '300',
      paid: '300',
      dueDate: new Date('2026-07-01T00:00:00.000Z'),
      competenceDate: new Date('2026-07-01T00:00:00.000Z'),
    });
    const aggregation = aggregateAdvisorCostCenterDimension({
      monthKey: '2026-08',
      direction: 'OUTFLOW',
      today: new Date('2026-09-25T15:00:00.000Z'),
      populationAmount: dec('300'),
      settlements: [august],
      allocations: [
        {
          costCenterId: 'cc-admin',
          installmentKind: 'PAYABLE',
          amount: dec('300'),
          installment: title,
          confirmed: true,
        },
        {
          costCenterId: 'cc-ops',
          installmentKind: 'PAYABLE',
          amount: dec('9000'),
          installment: installment({ externalId: 'ap-jul', total: '9000', paid: '9000' }),
          confirmed: true,
        },
      ],
      catalog,
    });
    expect(aggregation.centers).toHaveLength(1);
    expect(aggregation.centers[0]?.name).toBe('Administrativo');
    expect(aggregation.identifiedAmount.toString()).toBe('300');
  });
});

describe('F13.8.1D4.2 intent e precedência', () => {
  it('distingue D4.2, D2, D4.1, comparação e anáfora', () => {
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'Qual centro de custo teve maior saída em agosto de 2026?',
        period: periodOf('Qual centro de custo teve maior saída em agosto de 2026?'),
      })?.kind,
    ).toBe('COST_CENTER_RANKING_WINNER');
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'Quais foram os 5 centros de custo com maior saída em agosto de 2026?',
        period: periodOf('Quais foram os 5 centros de custo com maior saída em agosto de 2026?'),
      })?.kind,
    ).toBe('COST_CENTER_RANKING_TOPN');
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'Quanto gastei no centro Administrativo em agosto de 2026?',
        period: periodOf('Quanto gastei no centro Administrativo em agosto de 2026?'),
      }),
    ).toMatchObject({ kind: 'COST_CENTER_LOOKUP', costCenterQuery: 'Administrativo' });
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'Quanto o centro Administrativo representou das saídas de agosto de 2026?',
        period: periodOf('Quanto o centro Administrativo representou das saídas de agosto de 2026?'),
      })?.kind,
    ).toBe('COST_CENTER_SHARE');
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'Qual centro de custo teve maior entrada em agosto?',
        period: periodOf('Qual centro de custo teve maior entrada em agosto?'),
      }),
    ).toMatchObject({ kind: 'COST_CENTER_RANKING_WINNER', direction: 'INFLOW' });

    expect(resolveAdvisorDrilldownIntent('Quais foram as 5 maiores saídas de agosto de 2026?')?.toolName).toBe(
      'cash_movement_lines',
    );
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'Quais foram as 5 maiores saídas de agosto de 2026?',
        period: periodOf('Quais foram as 5 maiores saídas de agosto de 2026?'),
      }),
    ).toBeNull();
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'Quanto tenho a pagar hoje?',
        period: periodOf('Quanto tenho a pagar hoje?'),
      }),
    ).toBeNull();
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Quanto tenho a pagar hoje?',
        period: periodOf('Quanto tenho a pagar hoje?'),
      }),
    ).toBe('SNAPSHOT_OPEN_PAYABLES');
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Quanto tenho a pagar no centro Administrativo hoje?',
        period: periodOf('Quanto tenho a pagar no centro Administrativo hoje?'),
      }),
    ).toBeNull();
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'Compare Administrativo entre julho e agosto',
        period: periodOf('Compare Administrativo entre julho e agosto'),
      }),
    ).toBeNull();
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'E quanto gastei nesse centro em julho?',
        period: periodOf('E quanto gastei nesse centro em julho?'),
      }),
    ).toBeNull();
  });
});

describe('F13.8.1D4.2 compositor e provider', () => {
  it('winner, topN, lookup e share fecham sem provider', () => {
    const aggregation = sixtyFortyAggregation();
    const rankingContent = JSON.stringify(
      serializeAdvisorCostCenterRanking({
        status: 'OK',
        aggregation,
        ranking: rankAdvisorCostCenterDimension(aggregation, 5),
      }),
    );
    const winner = composeAdvisorFactualAnswer({
      content: 'Qual centro de custo teve maior saída em agosto de 2026?',
      anaphora: 'NONE',
      toolName: CASH_COST_CENTER_RANKING_TOOL_NAME,
      toolOk: true,
      toolContent: rankingContent,
    });
    expect(winner.classification.kind).toBe('FACTUAL_CLOSED');
    expect(winner.answer).toContain('Administrativo');
    expect(winner.answer).toContain('R$ 6.000,00');
    expect(winner.answer).toContain('saída realizada');
    expect(winner.meta?.providerCalled).toBe(false);
    expect(winner.meta?.composerVersion).toBe(ADVISOR_FACTUAL_COMPOSER_VERSION);

    const topN = composeAdvisorFactualAnswer({
      content: 'Quais foram os 5 centros de custo com maior saída em agosto de 2026?',
      anaphora: 'NONE',
      toolName: CASH_COST_CENTER_RANKING_TOOL_NAME,
      toolOk: true,
      toolContent: rankingContent,
    });
    expect(topN.answer).toContain('Foram identificados 2 centros');
    expect(topN.answer).not.toContain('5 centros de custo com');

    const lookupContent = JSON.stringify(
      serializeAdvisorCostCenterLookup({
        status: 'OK',
        aggregation,
        costCenterQuery: 'Administrativo',
        match: lookupAdvisorCostCenter(aggregation, catalog, 'Administrativo').status === 'FOUND'
          ? (lookupAdvisorCostCenter(aggregation, catalog, 'Administrativo') as Extract<
              ReturnType<typeof lookupAdvisorCostCenter>,
              { status: 'FOUND' }
            >).center
          : null,
      }),
    );
    const lookup = composeAdvisorFactualAnswer({
      content: 'Quanto gastei no centro Administrativo em agosto de 2026?',
      anaphora: 'NONE',
      toolName: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
      toolOk: true,
      toolContent: lookupContent,
    });
    expect(lookup.answer).toContain('R$ 6.000,00');
    const share = composeAdvisorFactualAnswer({
      content: 'Quanto o centro Administrativo representou das saídas de agosto de 2026?',
      anaphora: 'NONE',
      toolName: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
      toolOk: true,
      toolContent: lookupContent,
    });
    expect(share.classification.intentKind).toBe('COST_CENTER_SHARE');
    expect(share.answer).toContain('do total de saídas realizadas');
  });

  it('send fecha winner/topN/lookup/share sem ai_run', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const questions = [
      'Qual centro de custo teve maior saída em agosto de 2026?',
      'Quais foram os 5 centros de custo com maior saída em agosto de 2026?',
      'Quanto gastei no centro Administrativo em agosto de 2026?',
      'Quanto o centro Administrativo representou das saídas de agosto de 2026?',
    ];
    for (const question of questions) {
      const { send, openai, runs } = createHarness({
        toolName: question.includes('gastei') || question.includes('representou')
          ? CASH_COST_CENTER_LOOKUP_TOOL_NAME
          : CASH_COST_CENTER_RANKING_TOOL_NAME,
      });
      const result = await send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question,
        now: new Date('2026-09-25T18:00:00.000Z'),
      });
      expect(result.run).toBeNull();
      expect(result.factualAnswer?.providerCalled).toBe(false);
      expect(openai.generateCalls).toHaveLength(0);
      expect(runs).toHaveLength(0);
      expect(result.consultantMessage.senderType).toBe('CONSULTANT');
    }
    info.mockRestore();
  });

  it('isola tenant e rejeita args perigosos', async () => {
    const { send, openai } = createHarness();
    const isolated = await send.execute({
      tenantId: 'tenant-b',
      userId: 'user-b',
      conversationId: 'conv-b',
      question: 'Qual centro de custo teve maior saída em agosto de 2026?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(isolated.factualAnswer).toBeNull();
    expect(openai.generateCalls.length).toBeGreaterThan(0);
    expect(isolated.consultantMessage.content).not.toContain('Administrativo');

    expect(() =>
      assertCashCostCenterRankingArgs({
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        tenantId: 't-other',
      }),
    ).toThrow(/tenantId/);
    expect(() =>
      assertCashCostCenterLookupArgs({
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        costCenterQuery: 'Administrativo',
        where: '1=1',
      }),
    ).toThrow(/proibido|extras/);
    expect(() =>
      assertCashCostCenterRankingArgs({
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        companyId: 'x',
      }),
    ).toThrow();
  });
});
