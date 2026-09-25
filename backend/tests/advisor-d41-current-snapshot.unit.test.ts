import { describe, expect, it, vi } from 'vitest';

import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { Prisma } from '../src/generated/prisma/client.js';
import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { calculateInstallmentPendingStock } from '../src/modules/analytics/domain/installment-snapshot.js';
import type { FinancialStockSnapshot } from '../src/modules/analytics/domain/types.js';
import {
  ADVISOR_CURRENT_SNAPSHOT_FACT_NAME,
  AI_PROVIDER_MODEL_CATALOG,
  composeAdvisorFactualAnswer,
  createAllowAllConsultantRateLimiter,
  createSendAdvisorMessage,
  formatAdvisorCivilDate,
  resolveAdvisorConversationalPeriod,
  resolveAdvisorCurrentSnapshotIntent,
  serializeAdvisorCurrentSnapshotFacts,
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

function officialSnapshot(now = new Date('2026-09-25T18:00:00.000Z')): FinancialStockSnapshot {
  const today = civilTodayInSaoPaulo(now);
  const receivableRows = [
    { dueDate: new Date('2026-09-20T00:00:00.000Z'), unpaid: dec('80') },
    { dueDate: today, unpaid: dec('15') },
    { dueDate: new Date('2026-10-02T00:00:00.000Z'), unpaid: dec('5') },
  ];
  const payableRows = [
    { dueDate: new Date('2026-09-10T00:00:00.000Z'), unpaid: dec('30') },
    { dueDate: today, unpaid: dec('10') },
    { dueDate: new Date('2026-10-05T00:00:00.000Z'), unpaid: dec('20') },
  ];
  const receivablePending = calculateInstallmentPendingStock(receivableRows, today);
  const payablePending = calculateInstallmentPendingStock(payableRows, today);
  return {
    tenantId: 'tenant-a',
    today,
    receivables: {
      open: receivablePending.open,
      overdue: receivablePending.overdue,
      upcoming: receivablePending.dueToday.plus(receivablePending.upcoming),
    },
    payables: {
      open: payablePending.open,
      overdue: payablePending.overdue,
      upcoming: payablePending.dueToday.plus(payablePending.upcoming),
    },
    receivableDelinquency: {
      overdueUnpaid: receivablePending.overdue,
      openUnpaid: receivablePending.open,
      rate: receivablePending.overdue.div(receivablePending.open).times(100),
    },
    pending: {
      receivables: receivablePending,
      payables: payablePending,
    },
  };
}

function emptyOpenSnapshot(): FinancialStockSnapshot {
  const today = new Date('2026-09-25T00:00:00.000Z');
  const pending = calculateInstallmentPendingStock([], today);
  return {
    tenantId: 'tenant-a',
    today,
    receivables: { open: dec('0'), overdue: dec('0'), upcoming: dec('0') },
    payables: { open: dec('0'), overdue: dec('0'), upcoming: dec('0') },
    receivableDelinquency: { overdueUnpaid: dec('0'), openUnpaid: dec('0'), rate: null },
    pending: { receivables: pending, payables: pending },
  };
}

function snapshotFacts(snapshot: FinancialStockSnapshot, intentKind: string) {
  return JSON.stringify({
    ...serializeAdvisorCurrentSnapshotFacts(snapshot),
    intentKind,
  });
}

function periodOf(content: string, monthKey?: string) {
  return resolveAdvisorConversationalPeriod({
    content,
    referenceMonthKey: monthKey,
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

function conversation(
  tenantId = 'tenant-a',
  userId = 'user-a',
  id = 'conv-a',
): AiConversationRecord {
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

function builtContext(snapshot = officialSnapshot()): AdvisorBuiltContext {
  return {
    tenantId: 'tenant-a',
    monthKey: '2026-09',
    blocks: [
      { type: 'PLATFORM_INSTRUCTIONS', content: 'plataforma', trustLevel: 'PLATFORM' },
      { type: 'USER_QUESTION', content: 'q', trustLevel: 'UNTRUSTED' },
    ],
    currentSnapshot: serializeAdvisorCurrentSnapshotFacts(snapshot),
  };
}

function createHarness(options?: {
  readonly extraConversations?: readonly AiConversationRecord[];
  readonly extraSettings?: readonly AiTenantSettingsRecord[];
  readonly snapshot?: FinancialStockSnapshot | null;
  readonly context?: { build: (input: BuildAdvisorContextInput) => Promise<AdvisorBuiltContext> };
}) {
  const openai = createFakeIaProvider({ id: 'OPENAI', text: 'resposta do provider' });
  const messages: AiMessageRecord[] = [];
  const runs: AiRunRecord[] = [];
  let messageSeq = 0;
  let runSeq = 0;
  const conversationRows = [conversation(), ...(options?.extraConversations ?? [])];
  const snapshot = options?.snapshot === undefined ? officialSnapshot() : options.snapshot;
  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        const extra = options?.extraSettings?.find((row) => row.tenantId === tenantId);
        if (extra !== undefined) {
          return extra;
        }
        return tenantId === 'tenant-a' ? settings() : null;
      },
    },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        return (
          conversationRows.find(
            (row) => row.tenantId === tenantId && row.userId === userId && row.id === conversationId,
          ) ?? null
        );
      },
      async createMessage(tenantId, conversationId, input) {
        const created = message(`msg-${++messageSeq}`, input.senderType, input.content, tenantId, conversationId);
        messages.push(created);
        return created;
      },
      async updateConversationTitle() {
        return conversationRows[0] ?? null;
      },
      async listMessages(tenantId, conversationId) {
        return messages.filter((item) => item.tenantId === tenantId && item.conversationId === conversationId);
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
        const next = { ...current, status: input.status };
        runs[index] = next;
        return next;
      },
    },
    context:
      options?.context ??
      {
        build: vi.fn(async () => ({
          ...builtContext(snapshot ?? officialSnapshot()),
          currentSnapshot:
            snapshot === null ? null : serializeAdvisorCurrentSnapshotFacts(snapshot),
        })),
      },
    providers: createIaProviderRegistry({
      openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
  });
  return { send, messages, openai, runs };
}

describe('F13.8.1D4.1 intents e guards temporais', () => {
  it('fecha perguntas atuais e recusa histórico', () => {
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Quanto tenho a receber hoje?',
        period: periodOf('Quanto tenho a receber hoje?'),
      }),
    ).toBe('SNAPSHOT_OPEN_RECEIVABLES');
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Quanto tenho a pagar hoje?',
        period: periodOf('Quanto tenho a pagar hoje?'),
      }),
    ).toBe('SNAPSHOT_OPEN_PAYABLES');
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Quanto tenho vencido para receber?',
        period: periodOf('Quanto tenho vencido para receber?'),
      }),
    ).toBe('SNAPSHOT_OVERDUE_RECEIVABLES');
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Quanto tenho vencido para pagar?',
        period: periodOf('Quanto tenho vencido para pagar?'),
      }),
    ).toBe('SNAPSHOT_OVERDUE_PAYABLES');
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Quanto está vencido?',
        period: periodOf('Quanto está vencido?'),
      }),
    ).toBe('SNAPSHOT_OVERDUE_BOTH');
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Qual minha inadimplência atual?',
        period: periodOf('Qual minha inadimplência atual?'),
      }),
    ).toBe('SNAPSHOT_DELINQUENCY');
    expect(
      resolveAdvisorCurrentSnapshotIntent({
        content: 'Quanto vence hoje?',
        period: periodOf('Quanto vence hoje?'),
      }),
    ).toBe('SNAPSHOT_DUE_TODAY_BOTH');

    const historical = [
      'Quanto estava vencido em agosto de 2026?',
      'Quanto recebi em agosto de 2026?',
      'Quanto paguei em agosto de 2026?',
      'Qual foi meu faturamento em agosto de 2026?',
      'Compare julho e agosto.',
      'Quanto tenho a pagar em agosto?',
    ];
    for (const content of historical) {
      expect(resolveAdvisorCurrentSnapshotIntent({ content, period: periodOf(content) })).toBeNull();
    }
  });
});

describe('F13.8.1D4.1 paridade dueToday/upcomingFuture', () => {
  it('deriva baldes exclusivos da mesma população e não mistura vence-hoje em upcomingFuture', () => {
    const snapshot = officialSnapshot();
    const facts = serializeAdvisorCurrentSnapshotFacts(snapshot);
    expect(facts.asOf).toBe(formatAdvisorCivilDate(snapshot.today));
    expect(facts.asOfTimeZone).toBe('America/Sao_Paulo');
    expect(facts.receivables.open).toBe('100');
    expect(facts.receivables.overdue).toBe('80');
    expect(facts.receivables.dueToday).toBe('15');
    expect(facts.receivables.upcomingFuture).toBe('5');
    expect(facts.payables.open).toBe('60');
    expect(facts.payables.overdue).toBe('30');
    expect(facts.payables.dueToday).toBe('10');
    expect(facts.payables.upcomingFuture).toBe('20');
    expect(dec(facts.receivables.open).equals(
      dec(facts.receivables.overdue).plus(facts.receivables.dueToday).plus(facts.receivables.upcomingFuture),
    )).toBe(true);
    expect(dec(facts.payables.open).equals(
      dec(facts.payables.overdue).plus(facts.payables.dueToday).plus(facts.payables.upcomingFuture),
    )).toBe(true);
    expect(facts.receivables.upcomingFuture).not.toBe(snapshot.receivables.upcoming.toString());
  });

  it('asOf segue a data civil de São Paulo na virada', () => {
    const before = serializeAdvisorCurrentSnapshotFacts(
      officialSnapshot(new Date('2026-09-30T23:30:00.000-03:00')),
    );
    const after = serializeAdvisorCurrentSnapshotFacts(
      officialSnapshot(new Date('2026-10-01T00:30:00.000-03:00')),
    );
    expect(before.asOf).toBe('2026-09-30');
    expect(after.asOf).toBe('2026-10-01');
  });
});

describe('F13.8.1D4.1 compositor', () => {
  it('responde open, overdue, both e delinquency sem provider', () => {
    const snapshot = officialSnapshot();
    const receive = composeAdvisorFactualAnswer({
      content: 'Quanto tenho a receber hoje?',
      anaphora: 'NONE',
      toolName: ADVISOR_CURRENT_SNAPSHOT_FACT_NAME,
      toolOk: true,
      toolContent: snapshotFacts(snapshot, 'SNAPSHOT_OPEN_RECEIVABLES'),
    });
    expect(receive.classification.kind).toBe('FACTUAL_CLOSED');
    expect(receive.answer).toContain('R$ 100,00');
    expect(receive.answer).toContain('receber');
    expect(receive.meta?.providerCalled).toBe(false);

    const overdue = composeAdvisorFactualAnswer({
      content: 'Quanto está vencido?',
      anaphora: 'NONE',
      toolName: ADVISOR_CURRENT_SNAPSHOT_FACT_NAME,
      toolOk: true,
      toolContent: snapshotFacts(snapshot, 'SNAPSHOT_OVERDUE_BOTH'),
    });
    expect(overdue.answer).toContain('R$ 80,00');
    expect(overdue.answer).toContain('R$ 30,00');

    const delinquency = composeAdvisorFactualAnswer({
      content: 'Qual minha inadimplência atual?',
      anaphora: 'NONE',
      toolName: ADVISOR_CURRENT_SNAPSHOT_FACT_NAME,
      toolOk: true,
      toolContent: snapshotFacts(snapshot, 'SNAPSHOT_DELINQUENCY'),
    });
    expect(delinquency.answer).toContain('recebíveis');
    expect(delinquency.answer).not.toMatch(/lucro|EBITDA|margem/i);

    const dueToday = composeAdvisorFactualAnswer({
      content: 'Quanto vence hoje?',
      anaphora: 'NONE',
      toolName: ADVISOR_CURRENT_SNAPSHOT_FACT_NAME,
      toolOk: true,
      toolContent: snapshotFacts(snapshot, 'SNAPSHOT_DUE_TODAY_BOTH'),
    });
    expect(dueToday.answer).toContain('R$ 15,00');
    expect(dueToday.answer).toContain('R$ 10,00');
  });

  it('open=0 mantém percentage null e não vira 0%', () => {
    const facts = serializeAdvisorCurrentSnapshotFacts(emptyOpenSnapshot());
    expect(facts.receivableDelinquency.percentage).toBe('ABSENT');
    const composed = composeAdvisorFactualAnswer({
      content: 'Qual minha inadimplência atual?',
      anaphora: 'NONE',
      toolName: ADVISOR_CURRENT_SNAPSHOT_FACT_NAME,
      toolOk: true,
      toolContent: JSON.stringify({ ...facts, intentKind: 'SNAPSHOT_DELINQUENCY' }),
    });
    expect(composed.answer).toMatch(/não se aplica/i);
    expect(composed.answer).not.toContain('0%');
  });
});

describe('F13.8.1D4.1 send-advisor-message', () => {
  it('fecha snapshot sem provider nem ai_run e persiste CONSULTANT', async () => {
    const info = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const { send, messages, openai, runs } = createHarness();
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Quanto tenho a receber hoje?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(result.factualAnswer?.intentKind).toBe('SNAPSHOT_OPEN_RECEIVABLES');
    expect(result.run).toBeNull();
    expect(openai.generateCalls).toHaveLength(0);
    expect(runs).toHaveLength(0);
    expect(result.consultantMessage.senderType).toBe('CONSULTANT');
    expect(result.consultantMessage.content).toContain('R$ 100,00');
    expect(messages.filter((item) => item.senderType === 'CONSULTANT')).toHaveLength(1);
    expect(info.mock.calls.some((call) => String(call[0]).includes('advisor_factual_answer_composed'))).toBe(
      true,
    );
    info.mockRestore();
  });

  it('não fecha histórico como snapshot', async () => {
    const { send, openai } = createHarness();
    const result = await send.execute({
      tenantId: 'tenant-a',
      userId: 'user-a',
      conversationId: 'conv-a',
      question: 'Qual foi meu faturamento em agosto de 2026?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(result.factualAnswer).toBeNull();
    expect(result.run).not.toBeNull();
    expect(openai.generateCalls.length).toBeGreaterThan(0);
  });

  it('isola snapshot entre tenants', async () => {
    const { send, openai } = createHarness({
      extraConversations: [conversation('tenant-b', 'user-b', 'conv-b')],
      extraSettings: [settings('tenant-b')],
      context: {
        build: vi.fn(async (input: BuildAdvisorContextInput) => ({
          tenantId: input.tenantId,
          monthKey: '2026-09',
          blocks: builtContext().blocks,
          currentSnapshot:
            input.tenantId === 'tenant-a'
              ? serializeAdvisorCurrentSnapshotFacts(officialSnapshot())
              : null,
        })),
      },
    });
    const isolated = await send.execute({
      tenantId: 'tenant-b',
      userId: 'user-b',
      conversationId: 'conv-b',
      question: 'Quanto tenho a receber hoje?',
      now: new Date('2026-09-25T18:00:00.000Z'),
    });
    expect(isolated.factualAnswer).toBeNull();
    expect(openai.generateCalls.length).toBeGreaterThan(0);
    expect(isolated.consultantMessage.content).not.toContain('R$ 100,00');
  });
});
