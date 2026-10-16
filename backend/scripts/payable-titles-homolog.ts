/**
 * Homologação local (não produção): gpt-5.4-mini + tool payable_titles.
 * Dados in-memory; não altera tenant/settings.
 *
 * Uso: cd backend && npx tsx scripts/payable-titles-homolog.ts
 */
import { Prisma } from '../src/generated/prisma/client.js';
import { loadRootEnvFile } from '../src/config/load-env-file.js';
import { createOpenAiProvider } from '../src/infrastructure/ai/openai-provider.js';
import { ADVISOR_PLATFORM_INSTRUCTIONS } from '../src/modules/advisor/domain/platform-instructions.js';
import {
  createAdvisorAnalyticalToolExecutor,
  listAdvisorAnalyticalTools,
} from '../src/modules/advisor/domain/advisor-analytical-tools.js';
import { createAdvisorPayableTitlesService } from '../src/modules/advisor/domain/advisor-payable-titles-tools.js';
import { deriveQuestionAnalyticalDemand } from '../src/modules/advisor/domain/advisor-question-scope.js';
import {
  deriveAnalyticalObligations,
  evaluateAnalyticalCompletion,
} from '../src/modules/advisor/domain/advisor-analytical-completion.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';
import type { AdvisorContextBlock } from '../src/modules/advisor/domain/context-blocks.js';
loadRootEnvFile();

const TENANT = '11111111-1111-4111-8111-111111111111';
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

const QUESTIONS = [
  'Qual é a maior obrigação ainda em aberto neste mês?',
  'Liste as 5 maiores obrigações a pagar do mês.',
  'Quais títulos a pagar vencem primeiro neste mês?',
  'Quero ver as despesas registradas do mês incluindo as já quitadas e as abertas.',
  'Agora mostre só as contas a pagar que já foram pagas.',
  'Qual foi a maior saída realizada de caixa neste mês?',
  'Qual a maior conta a pagar em aberto?',
  'Quais títulos do centro XYZ999 inexistente?',
] as const;

function baseBlocks(question: string): AdvisorContextBlock[] {
  return [
    {
      type: 'PLATFORM_INSTRUCTIONS',
      content: ADVISOR_PLATFORM_INSTRUCTIONS,
      trustLevel: 'PLATFORM',
    },
    {
      type: 'FINANCIAL_FACTS',
      content: [
        'scope: PERIOD',
        'entityScope: TENANT',
        `monthKey: ${MONTH}`,
        'cash.realized.outflows: 250.00',
        'cash.realized.outflows.meaning: SAIDAS_REALIZADAS_DE_CAIXA',
        'cash.expected.payables: 98200.00',
        'stock.payables.open: 98200.00',
        'note: stock.payables.open é agregado; não autoriza inventar título individual.',
      ].join('\n'),
      trustLevel: 'ANALYTICAL_FACT',
    },
    {
      type: 'USER_QUESTION',
      content: question,
      trustLevel: 'UNTRUSTED',
    },
  ];
}

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY ausente');
  }

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

  const tools = createAdvisorAnalyticalToolExecutor({
    cashComparison: {
      async compare() {
        throw new Error('not used in homolog');
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
          requestedLimit: 5,
          effectiveLimit: 5,
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

  const provider = createOpenAiProvider({ apiKey });
  const toolDefs = listAdvisorAnalyticalTools();
  const report: Array<Record<string, unknown>> = [];

  for (const question of QUESTIONS) {
    const demand = deriveQuestionAnalyticalDemand({ content: question, comparison: false });
    const required = deriveAnalyticalObligations(demand);
    const first = await provider.generate({
      tenantId: TENANT,
      provider: 'OPENAI',
      model: MODEL,
      blocks: baseBlocks(question),
      tools: toolDefs,
    });

    const calls = first.toolCalls ?? [];
    const results = [];
    for (const call of calls) {
      const executed = await tools.execute({
        tenantId: TENANT,
        call: {
          id: call.id,
          name: call.name,
          arguments: call.arguments,
        },
        resolvedMonthKey: MONTH,
        now: NOW,
      });
      results.push(executed);
    }

    const completion = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: results.map((r) => ({
        toolName: r.name,
        content: r.content,
        ok: r.ok,
      })),
      availableToolNames: toolDefs.map((t) => t.name),
      preloadFactScopes: ['TENANT'],
    });

    let finalText = first.text ?? '';
    if (calls.length > 0) {
      const second = await provider.generate({
        tenantId: TENANT,
        provider: 'OPENAI',
        model: MODEL,
        blocks: baseBlocks(question),
        tools: toolDefs,
        toolRounds: [
          {
            calls: calls.map((c) => ({
              id: c.id,
              name: c.name,
              arguments: c.arguments,
            })),
            results: results.map((r) => ({
              id: r.id,
              name: r.name,
              ok: r.ok,
              content: r.content,
              resultCardinality: r.resultCardinality,
            })),
          },
        ],
      });
      finalText = second.text ?? finalText;
    }

    const entry = {
      question,
      wantsPayableObligation: demand.wantsPayableObligation,
      requiredObligations: required,
      toolCalls: calls.map((c) => ({ name: c.name, arguments: c.arguments })),
      completionDecision: completion.decision,
      satisfied: [...completion.satisfiedObligations],
      missing: completion.missingObligations,
      answerPreview: finalText.slice(0, 320),
    };
    report.push(entry);
    console.log(JSON.stringify(entry, null, 2));
  }

  console.log('\n=== SUMMARY ===');
  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
