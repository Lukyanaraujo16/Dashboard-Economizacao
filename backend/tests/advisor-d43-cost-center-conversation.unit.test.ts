import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { CashSettlementSource } from '../src/modules/analytics/domain/monthly-cash-flow.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import {
  ADVISOR_FACTUAL_COMPOSER_VERSION,
  AI_PROVIDER_MODEL_CATALOG,
  assertCashCostCenterMovementLinesArgs,
  assertCompareCashCostCenterArgs,
  collectAdvisorCostCenterAttributedShares,
  compareAdvisorCostCenterDimension,
  composeAdvisorFactualAnswer,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
  CASH_COST_CENTER_LOOKUP_TOOL_NAME,
  extractAdvisorCostCenterMention,
  isAdvisorInterpretiveQuestion,
  isCostCenterOrdinalQuestion,
  listAdvisorCostCenterMovementLines,
  lookupAdvisorCostCenter,
  rankAdvisorCostCenterDimension,
  resolveAdvisorConversationalCostCenter,
  resolveAdvisorConversationalPeriod,
  resolveAdvisorCostCenterIntent,
  resolveAdvisorCurrentSnapshotIntent,
  resolveAdvisorDrilldownIntent,
  serializeAdvisorCostCenterComparison,
  serializeAdvisorCostCenterLookup,
  serializeAdvisorCostCenterMovementLines,
  serializeAdvisorCostCenterRanking,
  aggregateAdvisorCostCenterDimension,
  CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME,
  CASH_COST_CENTER_RANKING_TOOL_NAME,
  COMPARE_CASH_COST_CENTER_TOOL_NAME,
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

function sixtyFortyInput(monthKey: string, occurredOn: Date, net = '10000') {
  const title = installment({ externalId: `ap-${monthKey}`, total: '10000', paid: '10000' });
  return {
    monthKey,
    direction: 'OUTFLOW' as const,
    today: new Date('2026-09-25T15:00:00.000Z'),
    populationAmount: dec(net),
    settlements: [
      settlement({
        id: `s-${monthKey}`,
        installmentExternalId: `ap-${monthKey}`,
        net,
        occurredOn,
      }),
    ],
    allocations: [
      {
        costCenterId: 'cc-admin',
        installmentKind: 'PAYABLE' as const,
        amount: dec('6000'),
        installment: title,
        confirmed: true,
      },
      {
        costCenterId: 'cc-ops',
        installmentKind: 'PAYABLE' as const,
        amount: dec('4000'),
        installment: title,
        confirmed: true,
      },
    ],
    catalog,
  };
}

function periodOf(content: string, priors: readonly string[] = []) {
  return resolveAdvisorConversationalPeriod({
    content,
    priorUserContents: priors,
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

function createHarness() {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'resposta do provider' });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  const toolCalls: string[] = [];
  let messageSeq = 0;
  let runSeq = 0;
  const august = aggregateAdvisorCostCenterDimension(
    sixtyFortyInput('2026-08', new Date('2026-08-15T00:00:00.000Z'), '10000'),
  );
  const july = aggregateAdvisorCostCenterDimension(
    sixtyFortyInput('2026-07', new Date('2026-07-15T00:00:00.000Z'), '5000'),
  );
  const rankingFacts = serializeAdvisorCostCenterRanking({
    status: 'OK',
    aggregation: august,
    ranking: rankAdvisorCostCenterDimension(august, 5),
  });
  const julyLookup = lookupAdvisorCostCenter(july, catalog, 'Administrativo');
  const lookupFacts = serializeAdvisorCostCenterLookup({
    status: 'OK',
    aggregation: july,
    costCenterQuery: 'Administrativo',
    match: julyLookup.status === 'FOUND' ? julyLookup.center : null,
  });
  const compareFacts = serializeAdvisorCostCenterComparison(
    compareAdvisorCostCenterDimension({
      base: july,
      target: august,
      catalogItem: catalog[0]!,
    }),
  );
  const shares = collectAdvisorCostCenterAttributedShares(
    sixtyFortyInput('2026-08', new Date('2026-08-15T00:00:00.000Z')),
  );
  const movementFacts = serializeAdvisorCostCenterMovementLines(
    listAdvisorCostCenterMovementLines({
      aggregation: august,
      shares,
      catalogItem: catalog[0]!,
      sourceLines: shares.map((share) => ({
        share,
        description: 'Aluguel',
        partyName: 'Fornecedor',
        categoryNames: ['Ocupação'],
      })),
      limit: 5,
    }),
  );
  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        return tenantId === 'tenant-a' || tenantId === 'tenant-b' ? settings(tenantId) : null;
      },
    },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        if (tenantId === 'tenant-b') {
          return conversation('tenant-b', 'user-b', 'conv-b');
        }
        return conversationId === 'conv-a' && tenantId === 'tenant-a' && userId === 'user-a'
          ? conversation()
          : conversationId === 'conv-c'
            ? conversation('tenant-a', 'user-a', 'conv-c')
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
      async listMessages(tenantId, conversationId) {
        return messages.filter(
          (item) => item.tenantId === tenantId && item.conversationId === conversationId,
        );
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
        runs[index] = { ...runs[index]!, status: input.status };
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
    cashComparison: {
      async compare() {
        toolCalls.push('compare_cash_months');
        return {
          tenantId: 'tenant-a',
          monthKey: '2026-08',
          comparisonMonthKey: '2026-07',
          periodA: {
            monthKey: '2026-07',
            billing: new Prisma.Decimal('136659.99'),
            realizedInflows: new Prisma.Decimal('136659.99'),
            realizedOutflows: new Prisma.Decimal('135897.54'),
            realizedResult: new Prisma.Decimal('762.45'),
            expectedReceivables: new Prisma.Decimal('0'),
            expectedPayables: new Prisma.Decimal('0'),
          },
          periodB: {
            monthKey: '2026-08',
            billing: new Prisma.Decimal('224790.3'),
            realizedInflows: new Prisma.Decimal('224790.3'),
            realizedOutflows: new Prisma.Decimal('98941.52'),
            realizedResult: new Prisma.Decimal('125848.78'),
            expectedReceivables: new Prisma.Decimal('0'),
            expectedPayables: new Prisma.Decimal('0'),
          },
          difference: {
            billing: new Prisma.Decimal('88130.31'),
            billingPercent: new Prisma.Decimal('64.49'),
            realizedInflows: new Prisma.Decimal('88130.31'),
            realizedOutflows: new Prisma.Decimal('-36955.98'),
            realizedResult: new Prisma.Decimal('125086.33'),
          },
          billingCoverage: 'FULL_BILLING' as const,
          inflowCategories: { available: false, items: [], increases: [], decreases: [] },
          outflowCategories: { available: false, items: [], increases: [], decreases: [] },
        };
      },
    },
    analyticalTools: {
      tools: [],
      async execute({ tenantId, call }) {
        toolCalls.push(call.name);
        if (tenantId !== 'tenant-a') {
          return {
            id: call.id,
            name: call.name,
            ok: false,
            content: JSON.stringify({ status: 'UNAVAILABLE' }),
          };
        }
        if (call.name === CASH_COST_CENTER_RANKING_TOOL_NAME) {
          return { id: call.id, name: call.name, ok: true, content: JSON.stringify(rankingFacts) };
        }
        if (call.name === COMPARE_CASH_COST_CENTER_TOOL_NAME) {
          return { id: call.id, name: call.name, ok: true, content: JSON.stringify(compareFacts) };
        }
        if (call.name === CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME) {
          return { id: call.id, name: call.name, ok: true, content: JSON.stringify(movementFacts) };
        }
        return { id: call.id, name: call.name, ok: true, content: JSON.stringify(lookupFacts) };
      },
    },
  });
  return { send, messages, openai, runs, toolCalls };
}

describe('F13.8.1D4.3 comparação', () => {
  const july = aggregateAdvisorCostCenterDimension(
    sixtyFortyInput('2026-07', new Date('2026-07-15T00:00:00.000Z'), '5000'),
  );
  const august = aggregateAdvisorCostCenterDimension(
    sixtyFortyInput('2026-08', new Date('2026-08-15T00:00:00.000Z'), '10000'),
  );

  it('compara OUTFLOW/INFLOW por costCenterId com delta e percentual', () => {
    const outflow = compareAdvisorCostCenterDimension({
      base: july,
      target: august,
      catalogItem: catalog[0]!,
    });
    expect(outflow.status).toBe('OK');
    expect(outflow.base?.amount.toString()).toBe('3000');
    expect(outflow.target?.amount.toString()).toBe('6000');
    expect(outflow.absoluteDelta?.toString()).toBe('3000');
    expect(outflow.percentageDelta?.toString()).toBe('100');
    expect(outflow.trend).toBe('INCREASE');

    const inflowJuly = aggregateAdvisorCostCenterDimension({
      ...sixtyFortyInput('2026-07', new Date('2026-07-15T00:00:00.000Z'), '2000'),
      direction: 'INFLOW',
      settlements: [
        settlement({
          id: 'r-jul',
          installmentExternalId: 'ap-2026-07',
          net: '2000',
          type: 'RECEIPT',
          kind: 'RECEIVABLE',
          occurredOn: new Date('2026-07-15T00:00:00.000Z'),
        }),
      ],
      allocations: [
        {
          costCenterId: 'cc-clinic',
          installmentKind: 'RECEIVABLE',
          amount: dec('2000'),
          installment: installment({ externalId: 'ap-2026-07', total: '2000', paid: '2000' }),
          confirmed: true,
        },
      ],
    });
    const inflowAug = aggregateAdvisorCostCenterDimension({
      ...sixtyFortyInput('2026-08', new Date('2026-08-15T00:00:00.000Z'), '2000'),
      direction: 'INFLOW',
      settlements: [
        settlement({
          id: 'r-aug',
          installmentExternalId: 'ap-2026-08',
          net: '2000',
          type: 'RECEIPT',
          kind: 'RECEIVABLE',
          occurredOn: new Date('2026-08-15T00:00:00.000Z'),
        }),
      ],
      allocations: [
        {
          costCenterId: 'cc-clinic',
          installmentKind: 'RECEIVABLE',
          amount: dec('2000'),
          installment: installment({ externalId: 'ap-2026-08', total: '2000', paid: '2000' }),
          confirmed: true,
        },
      ],
    });
    const inflow = compareAdvisorCostCenterDimension({
      base: inflowJuly,
      target: inflowAug,
      catalogItem: catalog[2]!,
    });
    expect(inflow.absoluteDelta?.toString()).toBe('0');
    expect(inflow.percentageDelta?.toString()).toBe('0');
  });

  it('base zero / target > 0 vira NOT_APPLICABLE; zero/zero é 0', () => {
    const emptyJuly = aggregateAdvisorCostCenterDimension({
      monthKey: '2026-07',
      direction: 'OUTFLOW',
      today: new Date('2026-09-25T15:00:00.000Z'),
      populationAmount: dec('100'),
      settlements: [],
      allocations: [],
      catalog,
    });
    const grown = compareAdvisorCostCenterDimension({
      base: emptyJuly,
      target: august,
      catalogItem: catalog[0]!,
    });
    expect(grown.base?.amount.toString()).toBe('0');
    expect(grown.target?.amount.toString()).toBe('6000');
    expect(grown.percentageDelta).toBeNull();
    const zeroZero = compareAdvisorCostCenterDimension({
      base: emptyJuly,
      target: emptyJuly,
      catalogItem: catalog[2]!,
    });
    expect(zeroZero.percentageDelta?.toString()).toBe('0');
  });

  it('coverage igual e diferente; join por id mesmo com nome alterado', () => {
    expect(
      compareAdvisorCostCenterDimension({
        base: july,
        target: august,
        catalogItem: catalog[0]!,
      }).coverageDiffers,
    ).toBe(false);
    const lowCoverage = aggregateAdvisorCostCenterDimension({
      ...sixtyFortyInput('2026-07', new Date('2026-07-15T00:00:00.000Z'), '5000'),
      populationAmount: dec('10000'),
    });
    expect(
      compareAdvisorCostCenterDimension({
        base: lowCoverage,
        target: august,
        catalogItem: catalog[0]!,
      }).coverageDiffers,
    ).toBe(true);
    const renamed = compareAdvisorCostCenterDimension({
      base: july,
      target: august,
      catalogItem: { id: 'cc-admin', name: 'Admin Novo', code: 'ADM' },
    });
    expect(renamed.costCenter?.costCenterId).toBe('cc-admin');
    expect(renamed.costCenter?.name).toBe('Admin Novo');
    expect(renamed.target?.amount.toString()).toBe('6000');
  });
});

describe('F13.8.1D4.3 movimentos', () => {
  it('rateio 60/40, conservação, TOP5, hasMore e ordenação', () => {
    const extraTitle = installment({ externalId: 'ap-extra', total: '1000', paid: '1000' });
    const input = {
      ...sixtyFortyInput('2026-08', new Date('2026-08-15T00:00:00.000Z')),
      populationAmount: dec('11000'),
      settlements: [
        ...sixtyFortyInput('2026-08', new Date('2026-08-15T00:00:00.000Z')).settlements,
        settlement({
          id: 's-small',
          installmentExternalId: 'ap-extra',
          net: '1000',
          occurredOn: new Date('2026-08-10T00:00:00.000Z'),
        }),
      ],
      allocations: [
        ...sixtyFortyInput('2026-08', new Date('2026-08-15T00:00:00.000Z')).allocations,
        {
          costCenterId: 'cc-admin',
          installmentKind: 'PAYABLE' as const,
          amount: dec('1000'),
          installment: extraTitle,
          confirmed: true,
        },
      ],
    };
    const aggregation = aggregateAdvisorCostCenterDimension(input);
    const shares = collectAdvisorCostCenterAttributedShares(input);
    const adminShares = shares.filter((row) => row.costCenterId === 'cc-admin');
    expect(adminShares[0]?.originalSettlementAmount.toString()).toBe('10000');
    expect(adminShares.find((row) => row.settlementKey === 's-2026-08')?.attributedAmount.toString()).toBe(
      '6000',
    );
    const sum = adminShares.reduce((acc, row) => acc.plus(row.attributedAmount), dec('0'));
    expect(sum.toString()).toBe(
      aggregation.centers.find((row) => row.costCenterId === 'cc-admin')?.amount.toString(),
    );
    const window = listAdvisorCostCenterMovementLines({
      aggregation,
      shares,
      catalogItem: catalog[0]!,
      sourceLines: shares.map((share) => ({
        share,
        description: share.settlementKey,
        partyName: null,
        categoryNames: [],
      })),
      limit: 1,
    });
    expect(window.hasMore).toBe(true);
    expect(window.lines).toHaveLength(1);
    expect(window.lines[0]?.attributedAmount.toString()).toBe('6000');
    expect(window.movementPopulationAmount.toString()).toBe(sum.toString());
    expect(window.costCenterAmount.toString()).toBe(sum.toString());
    const full = listAdvisorCostCenterMovementLines({
      aggregation,
      shares,
      catalogItem: catalog[0]!,
      sourceLines: shares.map((share) => ({
        share,
        description: share.settlementKey,
        partyName: null,
        categoryNames: [],
      })),
      limit: 5,
    });
    expect(full.hasMore).toBe(false);
    expect(full.lines.map((row) => row.settlementKey)).toEqual(['s-2026-08', 's-small']);
  });

  it('UNRESOLVED, ERROR, UNAVAILABLE e occurredOn não viram linha identificada', () => {
    const title = installment({ externalId: 'ap-1', total: '10000', paid: '5000', unpaid: '5000' });
    const unavailable = collectAdvisorCostCenterAttributedShares({
      direction: 'OUTFLOW',
      today: new Date('2026-09-25T15:00:00.000Z'),
      settlements: [settlement({ id: 's1', installmentExternalId: 'ap-1', net: '10000' })],
      allocations: [
        {
          costCenterId: 'cc-admin',
          installmentKind: 'PAYABLE',
          amount: dec('6000'),
          installment: title,
          confirmed: true,
        },
      ],
      catalog,
    });
    expect(unavailable).toHaveLength(0);
    expect(
      collectAdvisorCostCenterAttributedShares({
        direction: 'OUTFLOW',
        today: new Date('2026-09-25T15:00:00.000Z'),
        settlements: [settlement({ id: 's1', installmentExternalId: 'ap-1', net: '10000' })],
        allocations: [],
        catalog,
      }),
    ).toHaveLength(0);
    const julyOnly = collectAdvisorCostCenterAttributedShares({
      ...sixtyFortyInput('2026-08', new Date('2026-07-15T00:00:00.000Z')),
      settlements: [
        settlement({
          id: 's-jul',
          installmentExternalId: 'ap-2026-08',
          net: '10000',
          occurredOn: new Date('2026-07-15T00:00:00.000Z'),
        }),
      ],
    });
    expect(julyOnly.every((row) => row.occurredOn.getUTCMonth() === 6)).toBe(true);
  });
});

describe('F13.8.1D4.3 anáfora e precedência', () => {
  it('extrai nome sem a palavra centro e não rouba D2', () => {
    expect(extractAdvisorCostCenterMention('Quanto Laranjeiras cresceu de julho para agosto?')).toBe(
      'laranjeiras',
    );
    expect(
      extractAdvisorCostCenterMention('Quais foram as maiores saídas de Laranjeiras em agosto?'),
    ).toBe('laranjeiras');
    expect(extractAdvisorCostCenterMention('Quanto gastei em Laranjeiras em agosto?')).toBe(
      'laranjeiras',
    );
    expect(extractAdvisorCostCenterMention('Quais foram as maiores saídas em agosto?')).toBeNull();
    expect(extractAdvisorCostCenterMention('Quais foram as 5 maiores saídas de agosto?')).toBeNull();
  });

  it('resolve compare, movements, lookup anafórico, inherit target e ordinal', () => {
    const ranking = 'Qual centro teve maior saída em agosto de 2026?';
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Compare as saídas de Laranjeiras entre julho e agosto.',
        period: periodOf('Compare as saídas de Laranjeiras entre julho e agosto.'),
      }).intent?.kind,
    ).toBe('COST_CENTER_COMPARE');
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Quanto Laranjeiras cresceu de julho para agosto?',
        period: periodOf('Quanto Laranjeiras cresceu de julho para agosto?'),
      }).intent?.kind,
    ).toBe('COST_CENTER_COMPARE');
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Quais foram as maiores saídas de Laranjeiras em agosto?',
        period: periodOf('Quais foram as maiores saídas de Laranjeiras em agosto?'),
      }).intent?.kind,
    ).toBe('COST_CENTER_MOVEMENT_LINES');
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Quais lançamentos formaram o gasto de Laranjeiras em agosto?',
        period: periodOf('Quais lançamentos formaram o gasto de Laranjeiras em agosto?'),
      }).intent?.kind,
    ).toBe('COST_CENTER_MOVEMENT_LINES');
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'E quanto esse centro teve em julho?',
        period: periodOf('E quanto esse centro teve em julho?', [ranking]),
        priorUserContents: [ranking],
      }),
    ).toMatchObject({
      intent: { kind: 'COST_CENTER_LOOKUP' },
      anaphora: 'NEEDS_RANKING_WINNER',
    });
    const inherit = resolveAdvisorConversationalCostCenter({
      content: 'E as maiores saídas dele?',
      period: periodOf('E as maiores saídas dele?', [
        ranking,
        'Quanto Laranjeiras cresceu de julho para agosto?',
      ]),
      priorUserContents: [ranking, 'Quanto Laranjeiras cresceu de julho para agosto?'],
    });
    expect(inherit.intent?.kind).toBe('COST_CENTER_MOVEMENT_LINES');
    expect(inherit.inheritComparisonTarget).toBe(true);
    expect(inherit.inheritedMonthKey).toBe('2026-08');
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'E em junho?',
        period: periodOf('E em junho?', ['Quanto Laranjeiras cresceu de julho para agosto?']),
        priorUserContents: ['Quanto Laranjeiras cresceu de julho para agosto?'],
      }),
    ).toMatchObject({
      intent: { kind: 'COST_CENTER_LOOKUP', costCenterQuery: 'laranjeiras' },
      inheritComparisonTarget: false,
    });
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Quanto o segundo maior centro teve em julho?',
        period: periodOf('Quanto o segundo maior centro teve em julho?', [
          'Quais foram os 5 maiores centros em agosto?',
        ]),
        priorUserContents: ['Quais foram os 5 maiores centros em agosto?'],
      }).anaphora,
    ).toBe('ORDINAL_UNSUPPORTED');
    const rankingFive =
      'Quais foram os 5 centros de custo com maior saída em agosto de 2026?';
    for (const ordinal of [
      'Quanto o primeiro teve em julho?',
      'Quanto o segundo teve em julho?',
      'e o terceiro?',
    ]) {
      expect(
        resolveAdvisorConversationalCostCenter({
          content: ordinal,
          period: periodOf(ordinal, [rankingFive]),
          priorUserContents: [rankingFive],
        }),
        ordinal,
      ).toMatchObject({
        intent: null,
        anaphora: 'ORDINAL_UNSUPPORTED',
      });
    }
    expect(
      isCostCenterOrdinalQuestion(
        'quanto o segundo teve em julho?',
        [rankingFive],
      ),
    ).toBe(true);
    expect(isCostCenterOrdinalQuestion('quanto o segundo teve em julho?')).toBe(false);
    expect(extractAdvisorCostCenterMention('Clínica Life Jacaraípe.')).toBeNull();
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'E quanto esse centro teve em julho?',
        period: periodOf('E quanto esse centro teve em julho?'),
        priorUserContents: [],
      }).anaphora,
    ).toBe('UNRESOLVED');
    expect(
      resolveAdvisorCostCenterIntent({
        content: 'Qual centro teve maior saída em agosto?',
        period: periodOf('Qual centro teve maior saída em agosto?'),
      })?.kind,
    ).toBe('COST_CENTER_RANKING_WINNER');
    expect(resolveAdvisorDrilldownIntent('Quais foram as maiores saídas em agosto?')?.toolName).toBe(
      'cash_movement_lines',
    );
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Compare julho e agosto.',
        period: periodOf('Compare julho e agosto.'),
      }).intent,
    ).toBeNull();
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Quanto tenho a pagar hoje?',
        period: periodOf('Quanto tenho a pagar hoje?'),
      }),
    ).toBe('SNAPSHOT_OPEN_PAYABLES');
  });

  it('não herda âncora CC em pergunta genérica autossuficiente', () => {
    const priors = [
      'Qual centro teve maior saída em agosto de 2026?',
      'E quanto esse centro teve em julho?',
      'Quanto cresceu de julho para agosto?',
      'Quais foram as 5 maiores saídas dele em agosto?',
    ];
    const genericQuestions = [
      'Compare julho e agosto de 2026.',
      'Quais foram as 5 maiores saídas de agosto de 2026?',
      'Quanto recebi em agosto de 2026?',
      'Quanto gastei em agosto de 2026?',
      'Qual foi meu faturamento em agosto de 2026?',
      'Como foi agosto?',
    ];
    for (const content of genericQuestions) {
      expect(
        resolveAdvisorConversationalCostCenter({
          content,
          period: periodOf(content, priors),
          priorUserContents: priors,
        }),
        content,
      ).toMatchObject({
        intent: null,
        anaphora: 'NONE',
        needsRankingWinner: false,
      });
    }
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Compare esse centro entre julho e agosto.',
        period: periodOf('Compare esse centro entre julho e agosto.', priors),
        priorUserContents: priors,
      }).intent?.kind,
    ).toBe('COST_CENTER_COMPARE');
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Quanto esse centro teve em julho?',
        period: periodOf('Quanto esse centro teve em julho?', priors),
        priorUserContents: priors,
      }).intent?.kind,
    ).toBe('COST_CENTER_LOOKUP');
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Quais foram as maiores saídas dele em agosto?',
        period: periodOf('Quais foram as maiores saídas dele em agosto?', priors),
        priorUserContents: priors,
      }).intent?.kind,
    ).toBe('COST_CENTER_MOVEMENT_LINES');
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'E em junho?',
        period: periodOf('E em junho?', ['Quanto Laranjeiras cresceu de julho para agosto?']),
        priorUserContents: ['Quanto Laranjeiras cresceu de julho para agosto?'],
      }),
    ).toMatchObject({
      intent: { kind: 'COST_CENTER_LOOKUP', costCenterQuery: 'laranjeiras' },
    });
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Quanto Laranjeiras cresceu de julho para agosto?',
        period: periodOf('Quanto Laranjeiras cresceu de julho para agosto?', priors),
        priorUserContents: priors,
      }).intent?.kind,
    ).toBe('COST_CENTER_COMPARE');
    expect(
      resolveAdvisorConversationalCostCenter({
        content: 'Compare as saídas de Laranjeiras entre julho e agosto.',
        period: periodOf('Compare as saídas de Laranjeiras entre julho e agosto.', priors),
        priorUserContents: priors,
      }).intent?.kind,
    ).toBe('COST_CENTER_COMPARE');
  });
});

describe('F13.8.1D4.3 compositor, interpretativo e send', () => {
  it('fecha compare, movements, lookup e ordinal sem provider', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { send, openai, runs, toolCalls } = createHarness();
    const compare = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Compare as saídas de Laranjeiras entre julho e agosto de 2026.',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(compare.run).toBeNull();
    expect(compare.factualAnswer?.providerCalled).toBe(false);
    expect(compare.factualAnswer?.composerVersion).toBe(ADVISOR_FACTUAL_COMPOSER_VERSION);
    expect(compare.consultantMessage.content).toContain('Administrativo');
    expect(compare.consultantMessage.content).toContain('variação');
    expect(openai.generateCalls).toHaveLength(0);
    expect(toolCalls).toContain(COMPARE_CASH_COST_CENTER_TOOL_NAME);
    expect(toolCalls).not.toContain('compare_cash_months');

    const movement = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quais foram as maiores saídas de Laranjeiras em agosto?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(movement.run).toBeNull();
    expect(movement.consultantMessage.content).toContain('compõem esse total');
    expect(openai.generateCalls).toHaveLength(0);

    const ranking = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual centro teve maior saída em agosto de 2026?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(ranking.factualAnswer?.intentKind).toBe('COST_CENTER_RANKING_WINNER');
    const lookup = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E quanto esse centro teve em julho?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(lookup.run).toBeNull();
    expect(toolCalls).toContain(CASH_COST_CENTER_RANKING_TOOL_NAME);
    expect(lookup.consultantMessage.content).toContain('julho');
    expect(lookup.consultantMessage.content).toContain('Administrativo');
    expect(openai.generateCalls).toHaveLength(0);

    const grew = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto cresceu de julho para agosto?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(grew.run).toBeNull();
    expect(grew.consultantMessage.content).toContain('variação');

    const dele = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quais foram as maiores saídas dele em agosto?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(dele.run).toBeNull();
    expect(toolCalls).toContain(CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME);

    const { send: isolated, openai: isolatedOpenai, runs: isolatedRuns } = createHarness();
    const ordinal = await isolated.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto o segundo maior centro teve em julho?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(ordinal.run).toBeNull();
    expect(ordinal.consultantMessage.content).toContain('posição no ranking');
    expect(ordinal.consultantMessage.content).toContain('nome do centro');
    expect(isolatedOpenai.generateCalls).toHaveLength(0);
    expect(isolatedRuns).toHaveLength(0);
    expect(runs).toHaveLength(0);
    info.mockRestore();
  });

  it('não herda anáfora de outra conversa e CONSULTANT não é autoridade', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { send, messages } = createHarness();
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual centro teve maior saída em agosto de 2026?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    messages.push(
      message('fake-consultant', 'CONSULTANT', 'O maior foi Operações com R$ 9.999,00', 'tenant-a', 'conv-a'),
    );
    const follow = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E quanto esse centro teve em julho?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(follow.consultantMessage.content).toContain('Administrativo');
    expect(follow.consultantMessage.content).not.toContain('Operações');
    const other = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-c',
      question: 'E quanto esse centro teve em julho?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(other.consultantMessage.content).toContain('inequívoco');
    info.mockRestore();
  });

  it('mantém D2 e D1 e marca interpretativo', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { send, openai, toolCalls } = createHarness();
    const d2 = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quais foram as 5 maiores saídas de agosto?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(d2.factualAnswer).toBeNull();
    expect(toolCalls.at(-1)).not.toBe(CASH_COST_CENTER_MOVEMENT_LINES_TOOL_NAME);
    expect(openai.generateCalls.length).toBeGreaterThan(0);
    const d1 = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Compare julho e agosto.',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(d1.factualAnswer?.classification).toBe('FACTUAL_CLOSED');
    expect(d1.factualAnswer?.providerCalled).toBe(false);
    expect(d1.run).toBeNull();
    expect(toolCalls).toContain('compare_cash_months');
    expect(d1.consultantMessage.content).toContain('R$ 136.659,99');
    expect(d1.consultantMessage.content).toContain('R$ 224.790,30');
    expect(d1.consultantMessage.content).toContain('64,49%');
    expect(isAdvisorInterpretiveQuestion('Por que Laranjeiras gastou mais?')).toBe(true);
    expect(isAdvisorInterpretiveQuestion('Devo reduzir gastos em Laranjeiras?')).toBe(true);
    expect(isAdvisorInterpretiveQuestion('Esse aumento é preocupante?')).toBe(true);
    expect(isAdvisorInterpretiveQuestion('Qual estratégia você recomenda?')).toBe(true);
    const interpretive = composeAdvisorFactualAnswer({
      content: 'Por que Laranjeiras gastou mais?',
      anaphora: 'NONE',
      toolName: COMPARE_CASH_COST_CENTER_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify({ status: 'OK' }),
    });
    expect(interpretive.classification.kind).toBe('INTERPRETIVE');
    expect(interpretive.answer).toBeNull();
    info.mockRestore();
  });

  it('não transforma compare mensal genérico em compare de centro após âncora CC', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { send, toolCalls } = createHarness();
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual centro teve maior saída em agosto de 2026?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E quanto esse centro teve em julho?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    const generic = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Compare julho e agosto de 2026.',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(generic.factualAnswer?.classification).toBe('FACTUAL_CLOSED');
    expect(generic.factualAnswer?.providerCalled).toBe(false);
    expect(generic.run).toBeNull();
    expect(toolCalls.at(-1)).toBe('compare_cash_months');
    expect(toolCalls.filter((name) => name === COMPARE_CASH_COST_CENTER_TOOL_NAME)).toHaveLength(0);
    expect(generic.consultantMessage.content).toContain('R$ 136.659,99');
    expect(generic.consultantMessage.content).toContain('R$ 224.790,30');
    expect(generic.consultantMessage.content).toContain('R$ 88.130,31');
    expect(generic.consultantMessage.content).toContain('64,49%');
    expect(generic.consultantMessage.content).not.toContain('Administrativo');
    expect(generic.consultantMessage.content).not.toContain('84.568,61');
    expect(generic.consultantMessage.content).not.toContain('63.032,88');
    expect(generic.consultantMessage.content).not.toContain('25,47');
    info.mockRestore();
  });

  it('rejeita args perigosos das tools D4.3', () => {
    expect(() =>
      assertCompareCashCostCenterArgs({
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
        direction: 'OUTFLOW',
        costCenterQuery: 'Admin',
        tenantId: 'x',
      }),
    ).toThrow(/tenantId/);
    expect(() =>
      assertCashCostCenterMovementLinesArgs({
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        costCenterQuery: 'Admin',
        where: '1=1',
      }),
    ).toThrow();
    expect(() =>
      assertCompareCashCostCenterArgs({
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
        direction: 'OUTFLOW',
        costCenterQuery: 'Admin',
        companyId: 'x',
      }),
    ).toThrow();
    expect(() =>
      assertCashCostCenterMovementLinesArgs({
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        costCenterQuery: 'Admin',
        integrationId: 'x',
      }),
    ).toThrow();
    expect(() =>
      assertCompareCashCostCenterArgs({
        monthKey: '2026-08',
        comparisonMonthKey: '2026-07',
        direction: 'OUTFLOW',
        costCenterQuery: 'Admin',
        orderBy: 'amount',
      }),
    ).toThrow();
  });
});

describe('F13.8.1D4.3.3 ordinal não suportado', () => {
  it('esclarece referência ordinal sem inventar dados ou entidade', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const composed = composeAdvisorFactualAnswer({
      content: 'Quanto o segundo teve em julho?',
      anaphora: 'ORDINAL_UNSUPPORTED',
      toolName: CASH_COST_CENTER_LOOKUP_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify({
        status: 'UNRESOLVED',
        reason: 'COST_CENTER_ORDINAL_UNSUPPORTED',
        monthKey: '2026-07',
        scope: 'PERIOD',
        factKind: 'REALIZED_CASH_COST_CENTER_DIMENSION_LOOKUP',
        costCenter: null,
      }),
    });
    expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
    expect(composed.classification.intentKind).toBe('FACTUAL_LIMITATION');
    expect(composed.answer).toContain('identificar com segurança');
    expect(composed.answer).toContain('nome do centro');
    expect(composed.answer).not.toMatch(/não tenho os dados/i);
    expect(composed.answer).not.toMatch(/indispon/i);
    expect(composed.answer).not.toMatch(/julho/i);
    expect(composed.meta?.providerCalled).toBe(false);

    const { send, openai, runs } = createHarness();
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quais foram os 5 centros de custo com maior saída em agosto de 2026?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    for (const question of [
      'Quanto o primeiro teve em julho?',
      'Quanto o segundo teve em julho?',
      'e o terceiro?',
    ]) {
      const ordinal = await send.execute({
        tenantId: 'tenant-a',
        userId: 'user-a',
        conversationId: 'conv-a',
        question,
        now: new Date('2026-09-25T18:00:00.000Z'),
      });
      expect(ordinal.run, question).toBeNull();
      expect(ordinal.factualAnswer?.intentKind, question).toBe('FACTUAL_LIMITATION');
      expect(ordinal.consultantMessage.content, question).toContain('nome do centro');
      expect(ordinal.consultantMessage.content, question).not.toMatch(/não tenho os dados/i);
      expect(ordinal.consultantMessage.content, question).not.toMatch(/R\$/);
      expect(ordinal.consultantMessage.content, question).not.toContain('Administrativo');
      expect(ordinal.consultantMessage.content, question).not.toContain('Operações');
    }
    expect(openai.generateCalls).toHaveLength(0);
    expect(runs).toHaveLength(0);

    const named = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto gastei no centro Administrativo em julho?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(named.run).toBeNull();
    expect(named.consultantMessage.content).toContain('Administrativo');
    expect(named.consultantMessage.content).toContain('julho');
    expect(named.consultantMessage.content).toMatch(/R\$/);
    expect(openai.generateCalls).toHaveLength(0);
    info.mockRestore();
  });

  it('preserva anáfora, período elíptico, D1 e D2', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { send, openai } = createHarness();
    await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual centro teve maior saída em agosto de 2026?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    const esse = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto esse centro teve em julho?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(esse.consultantMessage.content).toContain('Administrativo');
    const ele = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto ele teve em julho?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(ele.consultantMessage.content).toContain('Administrativo');
    const junho = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'E em junho?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(junho.factualAnswer?.intentKind).not.toBe('FACTUAL_LIMITATION');
    expect(junho.consultantMessage.content).not.toContain('posição no ranking');

    const { send: isolated } = createHarness();
    const d1 = await isolated.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Compare julho e agosto de 2026.',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(d1.factualAnswer?.intentKind).not.toBe('COST_CENTER_LOOKUP');
    expect(d1.consultantMessage.content).not.toContain('Administrativo');
    const d2 = await isolated.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quais foram as 5 maiores saídas de agosto de 2026?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(resolveAdvisorDrilldownIntent(d2.userMessage.content)?.toolName).toBe(
      'cash_movement_lines',
    );
    expect(openai.generateCalls).toHaveLength(0);
    info.mockRestore();
  });
});
