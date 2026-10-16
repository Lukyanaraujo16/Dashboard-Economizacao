/**
 * Homologação B.1 — PendingAnalyticalAction com OpenAI gpt-5.4-mini real.
 *
 * Uso: cd backend && npx tsx scripts/pending-analytical-action-b1-homolog.ts
 *
 * NÃO incluir no commit — artefato de prova.
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
import { parseAdvisorConversationBag } from '../src/modules/advisor/domain/advisor-conversation-bag.js';
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
];

type CapturedEvent = Record<string, unknown>;

function settings(): AiTenantSettingsRecord {
  return {
    id: 'set-b1',
    tenantId: TENANT,
    provider: 'OPENAI',
    model: MODEL,
    businessSegment: 'Clínica',
    businessDescription: 'Homolog B.1',
    consultantName: null,
    adminPrompt: null,
    tonePreset: 'PROFISSIONAL_OBJETIVO',
    tone: 'objetivo',
    emojiPreference: 'MODERATE',
    status: 'ACTIVE',
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function createHarness() {
  const conversations = new Map<string, AiConversationRecord>();
  const messagesByConv = new Map<string, AiMessageRecord[]>();
  const contexts = new Map<string, unknown>();
  const runs: AiRunRecord[] = [];
  const events: CapturedEvent[] = [];
  const capturedToolCalls: Array<{
    name: string;
    arguments: Record<string, unknown>;
    ok: boolean;
  }> = [];
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
          (parsed.event.startsWith('advisor_pending_') ||
            parsed.event.startsWith('advisor_agent_') ||
            parsed.event === 'advisor_factual_answer_composed')
        ) {
          events.push(parsed);
        }
      } catch {
        // ignore
      }
    }
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
        return [
          {
            id: 'cc-lar',
            tenantId: TENANT,
            name: 'Laranjeiras',
            code: 'LAR',
            active: true,
            externalId: 'ext-lar',
            syncedAt: NOW,
          } as never,
        ];
      },
    },
  });

  const baseTools = createAdvisorAnalyticalToolExecutor({
    cashComparison: {
      async compare() {
        throw new Error('cashComparison não usado');
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
          returnedCount: 0,
          hasMore: false,
          lines: [],
        };
      },
    },
    payableTitles,
  });

  const analyticalTools: AdvisorAnalyticalToolExecutor = {
    tools: baseTools.tools,
    async execute(input) {
      const result = await baseTools.execute(input);
      capturedToolCalls.push({
        name: input.call.name,
        arguments: input.call.arguments,
        ok: result.ok,
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
            'stock.payables.open: 98200.00',
            'stock.payables.overdue: 80000.00',
            'cash.position.current: 120000.00',
          ].join('\n'),
          trustLevel: 'ANALYTICAL_FACT',
        },
        {
          type: 'CONVERSATION_HISTORY',
          content:
            history.length === 0
              ? 'ABSENT'
              : history.map((m) => `${m.senderType}: ${m.content}`).join('\n'),
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
        return {
          ...row,
          analyticalContext: contexts.get(conversationId) ?? null,
        };
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
      async saveAnalyticalContext(tenantId, conversationId, context) {
        const row = conversations.get(conversationId);
        if (!row || row.tenantId !== tenantId) return false;
        contexts.set(conversationId, context);
        return true;
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
    capturedToolCalls,
    ensureConversation(id: string) {
      if (!conversations.has(id)) {
        conversations.set(id, {
          id,
          tenantId: TENANT,
          userId: USER,
          status: 'OPEN',
          title: null,
          analyticalContext: null,
          startedAt: NOW,
          lastMessageAt: NOW,
          createdAt: NOW,
          updatedAt: NOW,
        });
        messagesByConv.set(id, []);
        contexts.set(id, null);
      }
    },
    pendingOf(id: string) {
      return parseAdvisorConversationBag(contexts.get(id) ?? null).slots.pendingAnalyticalAction;
    },
    restore() {
      console.info = originalInfo;
    },
  };
}

async function ask(
  harness: ReturnType<typeof createHarness>,
  conversationId: string,
  question: string,
  label: string,
) {
  harness.ensureConversation(conversationId);
  harness.events.length = 0;
  harness.capturedToolCalls.length = 0;
  const started = Date.now();
  console.log(`\n======== ${label} ========`);
  console.log('USER:', question);
  const result = await harness.send.execute({
    tenantId: TENANT,
    userId: USER,
    conversationId,
    question,
    monthKey: MONTH,
    now: NOW,
  });
  const pending = harness.pendingOf(conversationId);
  const pendingEvents = harness.events.filter(
    (e) => typeof e.event === 'string' && String(e.event).startsWith('advisor_pending_'),
  );
  console.log('ASSISTANT:', result.consultantMessage.content.slice(0, 900));
  console.log('latencyMs:', Date.now() - started);
  console.log('tools:', harness.capturedToolCalls);
  console.log(
    'pending:',
    pending === null
      ? null
      : {
          id: pending.id,
          status: pending.status,
          domain: pending.domain,
          operation: pending.operation,
          objective: pending.objective,
          steps: pending.steps,
          offerSnippet: pending.offerSnippet.slice(0, 160),
        },
  );
  console.log('pendingEvents:', pendingEvents);
  return { result, pending, pendingEvents, latencyMs: Date.now() - started };
}

async function main() {
  console.log('B.1 homolog model=', MODEL);

  // PAYABLE: criar pending + ACCEPT inédita
  {
    const h = createHarness();
    try {
      await ask(
        h,
        'c-pay',
        'Alfred, olhando minhas contas deste mês, qual é o compromisso financeiro mais alto que eu ainda tenho pela frente?',
        'PAYABLE Q1 — winner + oferta',
      );
      const pending = h.pendingOf('c-pay');
      if (pending === null) {
        await ask(
          h,
          'c-pay',
          'Além do maior, se quiser liste os próximos maiores compromissos abertos deste mês em ordem de valor.',
          'PAYABLE Q1b — reforço de oferta',
        );
      }
      if (h.pendingOf('c-pay') !== null) {
        await ask(h, 'c-pay', 'manda ver então', 'PAYABLE Q2 — ACCEPT inédita');
      } else {
        console.log('WARN: pending não criado no caso PAYABLE');
      }
    } finally {
      h.restore();
    }
  }

  // ACCEPT formulações inéditas isoladas
  for (const phrase of ['fica à vontade pra trazer', 'me mostra essa lista', 'pode seguir com isso aí']) {
    const h = createHarness();
    try {
      await ask(
        h,
        'c-acc',
        'Qual o maior título em aberto deste mês? Ofereça listar os próximos maiores em ordem.',
        `SEED para "${phrase}"`,
      );
      if (h.pendingOf('c-acc') !== null) {
        await ask(h, 'c-acc', phrase, `ACCEPT inédita: ${phrase}`);
      } else {
        console.log('SKIP — pending ausente para', phrase);
      }
    } finally {
      h.restore();
    }
  }

  // MODIFY
  {
    const h = createHarness();
    try {
      await ask(
        h,
        'c-mod',
        'Qual o maior compromisso aberto deste mês? Ofereça listar os próximos maiores.',
        'MODIFY seed',
      );
      if (h.pendingOf('c-mod') !== null) {
        await ask(h, 'c-mod', 'beleza, mas filtra só Laranjeiras', 'MODIFY cost center');
      }
    } finally {
      h.restore();
    }
  }

  // REJECT
  {
    const h = createHarness();
    try {
      await ask(
        h,
        'c-rej',
        'Qual o maior compromisso aberto deste mês? Ofereça listar os próximos maiores.',
        'REJECT seed',
      );
      if (h.pendingOf('c-rej') !== null) {
        await ask(h, 'c-rej', 'pode deixar, dispenso', 'REJECT');
      }
    } finally {
      h.restore();
    }
  }

  // UNRELATED
  {
    const h = createHarness();
    try {
      await ask(
        h,
        'c-unr',
        'Qual o maior compromisso aberto deste mês? Ofereça listar os próximos maiores.',
        'UNRELATED seed',
      );
      if (h.pendingOf('c-unr') !== null) {
        await ask(h, 'c-unr', 'quanto faturou a empresa no mês passado?', 'UNRELATED');
      }
    } finally {
      h.restore();
    }
  }

  // Decision support
  {
    const h = createHarness();
    try {
      await ask(
        h,
        'c-dec',
        'Estou pensando em contratar um funcionário, olhando o financeiro o que você acha?',
        'DECISION Q1',
      );
      if (h.pendingOf('c-dec') !== null) {
        await ask(h, 'c-dec', 'olha por gentileza', 'DECISION ACCEPT');
      } else {
        console.log('DECISION: pending não criado (oferta pode ter sido só prosa não allowlisted)');
      }
    } finally {
      h.restore();
    }
  }

  console.log('\nB.1 homolog done. tools catalog:', listAdvisorAnalyticalTools().map((t) => t.name));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
