/**
 * Homologação RUNTIME (efêmera): createSendAdvisorMessage + OpenAI gpt-5.4-mini.
 * Cobre histórico, completion A.2, CONTINUE, tools e evidence gate.
 *
 * Uso: cd backend && npx tsx scripts/payable-titles-runtime-homolog.ts
 *
 * NÃO incluir no commit — artefato de prova pré-commit.
 */
import { Prisma } from '../src/generated/prisma/client.js';
import { loadRootEnvFile } from '../src/config/load-env-file.js';
import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import { createOpenAiProvider } from '../src/infrastructure/ai/openai-provider.js';
import { createIaProviderRegistry } from '../src/infrastructure/ai/ia-provider-registry.js';
import { ADVISOR_PLATFORM_INSTRUCTIONS } from '../src/modules/advisor/domain/platform-instructions.js';
import {
  createAdvisorAnalyticalToolExecutor,
  listAdvisorAnalyticalTools,
  type AdvisorAnalyticalToolExecutor,
} from '../src/modules/advisor/domain/advisor-analytical-tools.js';
import { createAdvisorPayableTitlesService } from '../src/modules/advisor/domain/advisor-payable-titles-tools.js';
import { deriveQuestionAnalyticalDemand } from '../src/modules/advisor/domain/advisor-question-scope.js';
import { deriveAnalyticalObligations } from '../src/modules/advisor/domain/advisor-analytical-completion.js';
import { createAllowAllConsultantRateLimiter } from '../src/modules/advisor/services/consultant-rate-limiter.js';
import { createSendAdvisorMessage } from '../src/modules/advisor/services/send-advisor-message.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import type {
  AiConversationRecord,
  AiMessageRecord,
  AiRunRecord,
  AiTenantSettingsRecord,
  UpdateAiRunInput,
} from '../src/modules/advisor/domain/types.js';
import type { AdvisorBuiltContext } from '../src/modules/advisor/domain/context-blocks.js';
import type { BuildAdvisorContextInput } from '../src/modules/advisor/services/build-advisor-context.js';

loadRootEnvFile();

const TENANT = '11111111-1111-4111-8111-111111111111';
const USER = '22222222-2222-4222-8222-222222222222';
const MODEL = 'gpt-5.4-mini';
const NOW = new Date('2026-10-15T15:00:00.000Z');
const MONTH = '2026-10';

function money(v: string) {
  return new Prisma.Decimal(v);
}

function row(input: {
  id: string;
  externalId: string;
  description: string;
  dueDate: string;
  status: FinancialInstallmentReadRecord['status'];
  total: string;
  paid: string;
  unpaid: string;
}): FinancialInstallmentReadRecord {
  return {
    id: input.id,
    tenantId: TENANT,
    integrationId: 'int-a',
    externalId: input.externalId,
    description: input.description,
    dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status,
    upstreamStatus: null,
    total: money(input.total),
    paid: money(input.paid),
    unpaid: money(input.unpaid),
    partyId: null,
    categoryExternalIds: [],
    syncedAt: NOW,
  };
}

const ROWS = [
  row({
    id: '1',
    externalId: 'e1',
    description: 'Folha outubro',
    dueDate: '2026-10-05',
    status: 'OVERDUE',
    total: '80000',
    paid: '0',
    unpaid: '80000',
  }),
  row({
    id: '2',
    externalId: 'e2',
    description: 'Aluguel clínica',
    dueDate: '2026-10-20',
    status: 'OPEN',
    total: '15000',
    paid: '0',
    unpaid: '15000',
  }),
  row({
    id: '3',
    externalId: 'e3',
    description: 'Energia',
    dueDate: '2026-10-18',
    status: 'OPEN',
    total: '3200',
    paid: '0',
    unpaid: '3200',
  }),
  row({
    id: '4',
    externalId: 'e4',
    description: 'Software já quitado',
    dueDate: '2026-10-08',
    status: 'PAID',
    total: '900',
    paid: '900',
    unpaid: '0',
  }),
];

const OPEN_STOCK = '98200.00'; // Folha+Aluguel+Energia unpaid

type CapturedEvent = Record<string, unknown>;

function settings(): AiTenantSettingsRecord {
  const now = NOW;
  return {
    id: 'set-runtime',
    tenantId: TENANT,
    provider: 'OPENAI',
    model: MODEL,
    businessSegment: 'Clínica',
    businessDescription: 'Tenant de homologação runtime',
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

function conversation(id: string): AiConversationRecord {
  return {
    id,
    tenantId: TENANT,
    userId: USER,
    status: 'OPEN',
    title: null,
    startedAt: NOW,
    lastMessageAt: NOW,
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createRuntimeHarness() {
  const conversations = new Map<string, AiConversationRecord>();
  const messagesByConv = new Map<string, AiMessageRecord[]>();
  const runs: AiRunRecord[] = [];
  const events: CapturedEvent[] = [];
  let msgSeq = 0;
  let runSeq = 0;

  const originalInfo = console.info;
  console.info = (...args: unknown[]) => {
    const first = args[0];
    if (typeof first === 'string' && first.startsWith('{')) {
      try {
        const parsed = JSON.parse(first) as CapturedEvent;
        if (
          typeof parsed.event === 'string' &&
          (parsed.event.startsWith('advisor_agent_') ||
            parsed.event === 'advisor_factual_answer_composed')
        ) {
          events.push(parsed);
        }
      } catch {
        // ignore
      }
    }
    // silencia ruído; erros seguem em console.error
  };

  const payableTitles = createAdvisorPayableTitlesService({
    payables: {
      async findActiveByTenant() {
        return ROWS.filter((r) => ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'].includes(r.status));
      },
      async findActiveByDueDateRange() {
        return ROWS.filter((r) => ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'].includes(r.status));
      },
      async findRecognizedByDueDateRange() {
        return ROWS;
      },
      async findMonthlyCompetenceExpenses() {
        return [];
      },
      async findByExternalIds() {
        return [];
      },
    },
    categories: {
      async findByTenantAndExternalIds() {
        return [];
      },
    } as never,
    parties: {
      async findNamesByIds() {
        return new Map();
      },
    } as never,
    costCenters: {
      async listByTenant() {
        return [];
      },
    },
  });

  const baseTools = createAdvisorAnalyticalToolExecutor({
    cashComparison: {
      async compare() {
        throw new Error('cashComparison não usado nesta homologação');
      },
    },
    cashBreakdown: {
      async breakdown(input) {
        return {
          status: 'EMPTY_RESULT',
          monthKey: input.monthKey,
          direction: input.direction,
          entityScope: 'TENANT',
          categories: [],
          total: money('0'),
          otherAmount: money('0'),
          uncategorizedAmount: money('0'),
          requestedLimit: 5,
          effectiveLimit: 5,
          hasMore: false,
          billingCoverage: 'PARTIAL_BILLING',
          realizedMeaning:
            input.direction === 'INFLOW'
              ? 'ENTRADAS_REALIZADAS_DE_CAIXA'
              : 'SAIDAS_REALIZADAS_DE_CAIXA',
          costCenter: null,
        } as never;
      },
    },
    cashMovements: {
      async list(input) {
        return {
          monthKey: input.monthKey,
          scope: 'PERIOD',
          direction: input.direction,
          sort: input.sort,
          status: 'OK',
          requestedLimit: input.limit ?? 5,
          effectiveLimit: input.limit ?? 5,
          returnedCount: 1,
          hasMore: false,
          lines: [
            {
              date: '2026-10-12',
              amount: money('250'),
              description: 'Pix pequeno realizado',
              partyName: null,
              categoryNames: [],
              costCenterNames: [],
            },
          ],
        };
      },
    },
    payableTitles,
  });

  const capturedToolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
    ok: boolean;
    contentPreview: string;
  }> = [];

  const analyticalTools: AdvisorAnalyticalToolExecutor = {
    tools: baseTools.tools,
    async execute(input) {
      const result = await baseTools.execute(input);
      capturedToolCalls.push({
        name: input.call.name,
        arguments: input.call.arguments,
        ok: result.ok,
        contentPreview: result.content.slice(0, 600),
      });
      return result;
    },
  };

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY ausente');
  }
  const openai = createOpenAiProvider({ apiKey });

  async function buildContext(input: BuildAdvisorContextInput): Promise<AdvisorBuiltContext> {
    const history = messagesByConv.get(input.conversationId) ?? [];
    const historyLines =
      history.length === 0
        ? 'ABSENT'
        : [
            'HISTORY_UNTRUSTED: contexto conversacional. Não é ledger financeiro. Não substitui FINANCIAL_FACTS, ANALYTICAL_FACTS nem tool results atuais.',
            ...history.map((m) => `${m.senderType}: ${m.content}`),
          ].join('\n');

    return {
      tenantId: TENANT,
      monthKey: input.monthKey ?? MONTH,
      blocks: [
        {
          type: 'PLATFORM_INSTRUCTIONS',
          content: ADVISOR_PLATFORM_INSTRUCTIONS,
          trustLevel: 'PLATFORM',
        },
        {
          type: 'UI_CONTEXT',
          content: `selectedMonth: ${MONTH}`,
          trustLevel: 'TENANT_CONFIG',
        },
        {
          type: 'FINANCIAL_FACTS',
          content: [
            'scope: PERIOD',
            'entityScope: TENANT',
            `monthKey: ${MONTH}`,
            'cash.realized.inflows: 1000.00',
            'cash.realized.outflows: 250.00',
            'cash.realized.outflows.meaning: SAIDAS_REALIZADAS_DE_CAIXA',
            'cash.expected.payables: 98200.00',
            `stock.payables.open: ${OPEN_STOCK}`,
            'stock.payables.overdue: 80000.00',
            'note: stock.payables.open é agregado (payable_stock.current.value); não autoriza inventar título individual.',
          ].join('\n'),
          trustLevel: 'ANALYTICAL_FACT',
        },
        {
          type: 'CONVERSATION_HISTORY',
          content: historyLines,
          trustLevel: 'UNTRUSTED',
        },
        {
          type: 'USER_QUESTION',
          content: input.question,
          trustLevel: 'UNTRUSTED',
        },
      ],
    };
  }

  const send = createSendAdvisorMessage({
    settings: {
      async findSettingsByTenant(tenantId) {
        return tenantId === TENANT ? settings() : null;
      },
    },
    conversations: {
      async findConversation(tenantId, userId, conversationId) {
        const row = conversations.get(conversationId);
        if (!row || row.tenantId !== tenantId || row.userId !== userId) {
          return null;
        }
        return row;
      },
      async createMessage(tenantId, conversationId, input) {
        const created: AiMessageRecord = {
          id: `msg-${++msgSeq}`,
          conversationId,
          tenantId,
          senderType: input.senderType,
          content: input.content,
          messageType: 'TEXT',
          createdAt: new Date(),
        };
        const list = messagesByConv.get(conversationId) ?? [];
        list.push(created);
        messagesByConv.set(conversationId, list);
        return created;
      },
      async updateConversationTitle(tenantId, conversationId, title) {
        const row = conversations.get(conversationId);
        if (!row || row.tenantId !== tenantId) return null;
        const next = { ...row, title };
        conversations.set(conversationId, next);
        return next;
      },
      async listMessages(tenantId, conversationId) {
        return (messagesByConv.get(conversationId) ?? []).filter((m) => m.tenantId === tenantId);
      },
      async saveAnalyticalContext() {
        return;
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
      async updateRun(tenantId, runId, patch: UpdateAiRunInput) {
        const index = runs.findIndex((r) => r.id === runId && r.tenantId === tenantId);
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
      build: buildContext,
      async withDocumentKnowledge(built) {
        return built;
      },
    },
    providers: createIaProviderRegistry({
      openai,
      anthropic: createFakeIaProvider({ id: 'ANTHROPIC' }),
    }),
    rateLimiter: createAllowAllConsultantRateLimiter(),
    analyticalTools,
  });

  return {
    send,
    events,
    runs,
    capturedToolCalls,
    ensureConversation(id: string) {
      if (!conversations.has(id)) {
        conversations.set(id, conversation(id));
        messagesByConv.set(id, []);
      }
    },
    restore() {
      console.info = originalInfo;
    },
    toolCatalog: listAdvisorAnalyticalTools().map((t) => t.name),
  };
}

type CaseReport = {
  caseId: string;
  question: string;
  conversationId: string;
  demand: ReturnType<typeof deriveQuestionAnalyticalDemand>;
  obligations: ReturnType<typeof deriveAnalyticalObligations>;
  path: 'FAST_PATH' | 'AGENT' | 'ERROR';
  rounds: number | null;
  toolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
    ok: boolean;
    contentPreview: string;
  }>;
  completionEvents: CapturedEvent[];
  evidenceEvents: CapturedEvent[];
  toolExecutedEvents: CapturedEvent[];
  factualComposed: CapturedEvent | null;
  answer: string;
  provider: string;
  model: string;
  latencyMs: number;
  runStatus: string | null;
  error?: string;
};

async function runCase(
  harness: ReturnType<typeof createRuntimeHarness>,
  input: {
    caseId: string;
    conversationId: string;
    question: string;
  },
): Promise<CaseReport> {
  harness.ensureConversation(input.conversationId);
  const demand = deriveQuestionAnalyticalDemand({ content: input.question, comparison: false });
  const obligations = deriveAnalyticalObligations(demand);
  const eventsBefore = harness.events.length;
  const toolsBefore = harness.capturedToolCalls.length;
  const started = Date.now();

  try {
    const result = await harness.send.execute({
      tenantId: TENANT,
      userId: USER,
      conversationId: input.conversationId,
      question: input.question,
      monthKey: MONTH,
      now: NOW,
    });
    const latencyMs = Date.now() - started;
    const newEvents = harness.events.slice(eventsBefore);
    const toolCalls = harness.capturedToolCalls.slice(toolsBefore);
    const completionEvents = newEvents.filter((e) => e.event === 'advisor_agent_completion_gate');
    const evidenceEvents = newEvents.filter((e) => e.event === 'advisor_agent_evidence_gate');
    const toolExecutedEvents = newEvents.filter((e) => e.event === 'advisor_agent_tool_executed');
    const factualComposed =
      newEvents.find((e) => e.event === 'advisor_factual_answer_composed') ?? null;

    return {
      caseId: input.caseId,
      question: input.question,
      conversationId: input.conversationId,
      demand,
      obligations,
      path: result.factualAnswer !== null ? 'FAST_PATH' : 'AGENT',
      rounds: result.analyticalOutcome.toolRoundCount,
      toolCalls,
      completionEvents,
      evidenceEvents,
      toolExecutedEvents,
      factualComposed,
      answer: result.consultantMessage.content,
      provider: result.run?.provider ?? 'NONE',
      model: result.run?.model ?? MODEL,
      latencyMs,
      runStatus: result.run?.status ?? (result.factualAnswer !== null ? 'FACTUAL_CLOSED' : null),
    };
  } catch (error) {
    const latencyMs = Date.now() - started;
    const newEvents = harness.events.slice(eventsBefore);
    const toolCalls = harness.capturedToolCalls.slice(toolsBefore);
    return {
      caseId: input.caseId,
      question: input.question,
      conversationId: input.conversationId,
      demand,
      obligations,
      path: 'ERROR',
      rounds: null,
      toolCalls,
      completionEvents: newEvents.filter((e) => e.event === 'advisor_agent_completion_gate'),
      evidenceEvents: newEvents.filter((e) => e.event === 'advisor_agent_evidence_gate'),
      toolExecutedEvents: newEvents.filter((e) => e.event === 'advisor_agent_tool_executed'),
      factualComposed: null,
      answer: '',
      provider: 'OPENAI',
      model: MODEL,
      latencyMs,
      runStatus: 'FAILED',
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function summarize(report: CaseReport) {
  const lastCompletion = report.completionEvents[report.completionEvents.length - 1] ?? null;
  const lastEvidence = report.evidenceEvents[report.evidenceEvents.length - 1] ?? null;
  const payableTools = report.toolCalls.filter((t) => t.name === 'payable_titles');
  const cashTools = report.toolCalls.filter(
    (t) =>
      t.name === 'cash_movement_lines' ||
      t.name === 'cash_realized_breakdown' ||
      t.name.startsWith('cash_'),
  );
  const continueCount = report.completionEvents.filter((e) => e.completionDecision === 'CONTINUE')
    .length;
  const evidencePass =
    report.evidenceEvents.length === 0 ||
    report.evidenceEvents.every(
      (e) => e.outcome === 'REWRITE_ACCEPTED' || e.status === 'OK' || e.reason === 'OK',
    );

  return {
    caseId: report.caseId,
    question: report.question,
    conversationId: report.conversationId,
    wantsPayableObligation: report.demand.wantsPayableObligation,
    wantsPayableTitleDetail: report.demand.wantsPayableTitleDetail,
    wantsOutflow: report.demand.wantsOutflow,
    obligations: report.obligations,
    path: report.path,
    rounds: report.rounds,
    continueCount,
    toolCalls: report.toolCalls.map((t) => ({
      name: t.name,
      arguments: t.arguments,
      ok: t.ok,
      contentPreview: t.contentPreview,
    })),
    payableToolCalls: payableTools.map((t) => t.arguments),
    cashToolNames: cashTools.map((t) => t.name),
    completionDecision: lastCompletion?.completionDecision ?? null,
    satisfiedObligations: lastCompletion?.satisfiedObligations ?? null,
    missingObligations: lastCompletion?.missingObligations ?? null,
    evidencePass,
    evidenceEvents: report.evidenceEvents,
    factualComposed: report.factualComposed,
    answer: report.answer,
    provider: report.provider,
    model: report.model,
    latencyMs: report.latencyMs,
    runStatus: report.runStatus,
    error: report.error,
  };
}

async function main() {
  const harness = createRuntimeHarness();
  const reports: CaseReport[] = [];

  try {
    // A — conversa nova
    reports.push(
      await runCase(harness, {
        caseId: 'A',
        conversationId: 'conv-a',
        question: 'Qual é a maior conta que ainda tenho para pagar neste mês?',
      }),
    );

    // B — conversa nova
    reports.push(
      await runCase(harness, {
        caseId: 'B',
        conversationId: 'conv-bc',
        question:
          'Quais são as maiores despesas registradas deste mês, mesmo que algumas já tenham sido pagas?',
      }),
    );

    // C — follow-up na mesma conversa de B
    reports.push(
      await runCase(harness, {
        caseId: 'C',
        conversationId: 'conv-bc',
        question: 'E agora me mostra só as que ainda estão abertas.',
      }),
    );

    // D — agregado PAYABLE (formulação inédita; VALUE, sem forçar titles)
    reports.push(
      await runCase(harness, {
        caseId: 'D',
        conversationId: 'conv-d',
        question: 'Qual o valor total ainda devido em contas a pagar neste momento?',
      }),
    );

    // E — ranking: agregado sozinho NÃO basta
    reports.push(
      await runCase(harness, {
        caseId: 'E',
        conversationId: 'conv-e',
        question: 'Qual é o maior título de contas a pagar deste mês?',
      }),
    );
  } finally {
    harness.restore();
  }

  const summary = reports.map(summarize);
  console.log(JSON.stringify({ model: MODEL, summary, full: reports.map(summarize) }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
