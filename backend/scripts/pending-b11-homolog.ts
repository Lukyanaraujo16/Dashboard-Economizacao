/**
 * Homologação B.1.1 — extract semântico (sem regex de oferta) + compound + decision support.
 * Uso: cd backend && npx tsx scripts/pending-b11-homolog.ts
 */
import { loadRootEnvFile } from '../src/config/load-env-file.js';
import { createOpenAiProvider } from '../src/infrastructure/ai/openai-provider.js';
import {
  createPendingAnalyticalAction,
  type PendingAnalyticalAction,
} from '../src/modules/advisor/domain/pending-analytical-action.js';
import {
  extractPendingAnalyticalActionFromOffer,
  resolvePendingAnalyticalActionDecision,
} from '../src/modules/advisor/domain/pending-analytical-action-classify.js';
import { executePendingAnalyticalAction } from '../src/modules/advisor/domain/pending-analytical-action-execute.js';
import { createAdvisorAnalyticalToolExecutor } from '../src/modules/advisor/domain/advisor-analytical-tools.js';
import { createAdvisorPayableTitlesService } from '../src/modules/advisor/domain/advisor-payable-titles-tools.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';

loadRootEnvFile();

const TENANT = '11111111-1111-4111-8111-111111111111';
const MODEL = 'gpt-5.4-mini';
const MONTH = '2026-10';
const NOW = new Date('2026-10-15T15:00:00.000Z');

function money(v: string) {
  return new Prisma.Decimal(v);
}

function row(input: {
  id: string;
  externalId: string;
  description: string;
  dueDate: string;
  status: FinancialInstallmentReadRecord['status'];
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
    total: money(input.unpaid),
    paid: money('0'),
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
    unpaid: '80000',
  }),
  row({
    id: '2',
    externalId: 'e2',
    description: 'Aluguel',
    dueDate: '2026-10-20',
    status: 'OPEN',
    unpaid: '15000',
  }),
];

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY ausente');
  const provider = createOpenAiProvider({ apiKey });

  const novelOffers = [
    'Há espaço de caixa, mas a pressão de obrigações é alta. Também dá para conferir isso cruzando a posição atual do caixa com os títulos vencidos.',
    'Eu consigo cruzar a posição atual do caixa e os compromissos em atraso para uma leitura mais prática do risco.',
    'Se fizer sentido, verifico a posição de caixa e os títulos que já venceram.',
    'Quer que eu veja como estão os vencimentos junto com a posição atual do caixa?',
  ];

  console.log('\n=== B.1.1 ofertas inéditas (sem “posso/se quiser” obrigatório) ===');
  for (const [i, offer] of novelOffers.entries()) {
    const t0 = Date.now();
    const pending = await extractPendingAnalyticalActionFromOffer({
      provider,
      providerId: 'OPENAI',
      model: MODEL,
      tenantId: TENANT,
      assistantText: [
        'Leitura objetiva: caixa atual relevante, mas estoque de atraso elevado.',
        offer,
      ].join(' '),
      createdFromMessageId: `msg-offer-${i}`,
      resolvedMonthKey: MONTH,
      now: NOW,
    });
    console.log(
      JSON.stringify({
        i: i + 1,
        extractorCalled: true,
        pendingCreated: pending !== null,
        domain: pending?.domain ?? null,
        operation: pending?.operation ?? null,
        stepCount: pending?.steps.length ?? 0,
        steps: pending?.steps ?? null,
        offerSnippet: pending?.offerSnippet?.slice(0, 120) ?? null,
        rejectReason: pending === null ? 'NO_PENDING_OR_INVALID' : null,
        ms: Date.now() - t0,
      }),
    );
  }

  console.log('\n=== B.1.1 decision support compound + ACCEPT inédita ===');
  const decisionAnswer = [
    'Pelos fatos, não dá para afirmar conforto absoluto para expandir quadro sem olhar a pressão das obrigações.',
    'Caixa atual: R$ 120.000,00. Títulos em aberto: R$ 98.200,00. Em atraso: R$ 80.000,00.',
    'Eu consigo cruzar a posição atual do caixa e os títulos vencidos para uma leitura mais prática do risco financeiro.',
  ].join(' ');

  const tExtract = Date.now();
  const compound = await extractPendingAnalyticalActionFromOffer({
    provider,
    providerId: 'OPENAI',
    model: MODEL,
    tenantId: TENANT,
    assistantText: decisionAnswer,
    createdFromMessageId: 'msg-decision',
    resolvedMonthKey: MONTH,
    now: NOW,
  });
  console.log(
    JSON.stringify({
      phase: 'extract',
      pendingCreated: compound !== null,
      contract: compound
        ? {
            domain: compound.domain,
            operation: compound.operation,
            objective: compound.objective,
            steps: compound.steps,
            offerSnippet: compound.offerSnippet,
          }
        : null,
      ms: Date.now() - tExtract,
    }),
  );

  if (compound !== null) {
    const acceptPhrase = 'pode seguir nessa linha, por favor';
    const tResolve = Date.now();
    const decision = await resolvePendingAnalyticalActionDecision({
      provider,
      providerId: 'OPENAI',
      model: MODEL,
      tenantId: TENANT,
      userMessage: acceptPhrase,
      pending: compound,
    });
    console.log(
      JSON.stringify({
        phase: 'resolve',
        phrase: acceptPhrase,
        decision: decision?.decision ?? null,
        ms: Date.now() - tResolve,
      }),
    );

    if (decision?.decision === 'ACCEPT') {
      const payableTitles = createAdvisorPayableTitlesService({
        payables: {
          async findActiveByTenant() {
            return ROWS.filter((r) => ['OPEN', 'OVERDUE'].includes(r.status));
          },
          async findActiveByDueDateRange() {
            return ROWS.filter((r) => ['OPEN', 'OVERDUE'].includes(r.status));
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
        categories: { async findByTenantAndExternalIds() { return []; } } as never,
        parties: { async findNamesByIds() { return new Map(); } } as never,
        costCenters: { async listByTenant() { return []; } },
      });
      const tools = createAdvisorAnalyticalToolExecutor({
        cashComparison: { async compare() { throw new Error('n/a'); } },
        payableTitles,
      });
      const tExec = Date.now();
      const execution = await executePendingAnalyticalAction({
        action: compound,
        tenantId: TENANT,
        resolvedMonthKey: MONTH,
        analyticalTools: tools,
        now: NOW,
      });
      console.log(
        JSON.stringify({
          phase: 'execute',
          status: execution.status,
          toolNames:
            execution.status === 'UNAVAILABLE'
              ? []
              : execution.executions.map((e) => e.name),
          hasSnapshotStep: compound.steps.some((s) => s.toolName === null),
          ms: Date.now() - tExec,
        }),
      );
    }
  }

  console.log('\n=== B.1.1 PAYABLE ranking offer + ACCEPT ===');
  const payableOffer =
    'O maior compromisso aberto é Folha outubro (R$ 80.000). Também dá para listar os próximos maiores títulos abertos deste mês em ordem de valor.';
  const payablePending = await extractPendingAnalyticalActionFromOffer({
    provider,
    providerId: 'OPENAI',
    model: MODEL,
    tenantId: TENANT,
    assistantText: payableOffer,
    createdFromMessageId: 'msg-pay',
    resolvedMonthKey: MONTH,
    now: NOW,
  });
  console.log(
    JSON.stringify({
      pendingCreated: payablePending !== null,
      domain: payablePending?.domain ?? null,
      operation: payablePending?.operation ?? null,
      steps: payablePending?.steps ?? null,
    }),
  );
  if (payablePending !== null) {
    const resolved = await resolvePendingAnalyticalActionDecision({
      provider,
      providerId: 'OPENAI',
      model: MODEL,
      tenantId: TENANT,
      userMessage: 'fica à vontade pra trazer isso',
      pending: payablePending,
    });
    console.log(JSON.stringify({ acceptDecision: resolved?.decision ?? null }));
  }

  // sanity: seeded ACCEPT still works
  const seeded: PendingAnalyticalAction = createPendingAnalyticalAction({
    id: 'seed-b11',
    createdFromMessageId: 'm',
    domain: 'PAYABLE',
    operation: 'RANKING_TOPN',
    steps: [
      {
        toolName: 'payable_titles',
        filters: { monthKey: MONTH, status: 'OPEN', ordering: 'VALUE_DESC', limit: 5 },
      },
    ],
    objective: 'próximos maiores',
    offerSnippet: 'listar próximos',
    now: NOW,
  })!;
  const unrelated = await resolvePendingAnalyticalActionDecision({
    provider,
    providerId: 'OPENAI',
    model: MODEL,
    tenantId: TENANT,
    userMessage: 'qual foi meu faturamento?',
    pending: seeded,
  });
  console.log(JSON.stringify({ unrelatedCheck: unrelated?.decision ?? null }));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
