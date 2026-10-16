/**
 * Homologação local B.1.2 — composição user-facing pós-ACCEPT (gpt-5.4-mini).
 * Efêmero — NÃO commit.
 */
import { loadRootEnvFile } from '../src/config/load-env-file.js';
import { createOpenAiProvider } from '../src/infrastructure/ai/openai-provider.js';
import { createPendingAnalyticalAction } from '../src/modules/advisor/domain/pending-analytical-action.js';
import {
  buildPendingActionComposeBlocks,
  executePendingAnalyticalAction,
  pendingAnswerLooksLikeTechnicalDump,
} from '../src/modules/advisor/domain/pending-analytical-action-execute.js';
import { gateAdvisorEvidenceBoundAnswer } from '../src/modules/advisor/domain/advisor-evidence-bound-answer.js';
import { createAdvisorAnalyticalToolExecutor } from '../src/modules/advisor/domain/advisor-analytical-tools.js';
import { createAdvisorPayableTitlesService } from '../src/modules/advisor/domain/advisor-payable-titles-tools.js';
import { Prisma } from '../src/generated/prisma/client.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';

loadRootEnvFile();

const TENANT = '11111111-1111-4111-8111-111111111111';
const MONTH = '2026-10';
const NOW = new Date('2026-10-15T15:00:00.000Z');

function money(v: string) {
  return new Prisma.Decimal(v);
}

function row(input: {
  id: string;
  description: string;
  dueDate: string;
  status: FinancialInstallmentReadRecord['status'];
  unpaid: string;
}): FinancialInstallmentReadRecord {
  return {
    id: input.id,
    tenantId: TENANT,
    integrationId: 'int-a',
    externalId: input.id,
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

async function main() {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new Error('OPENAI_API_KEY ausente');
  const provider = createOpenAiProvider({ apiKey });

  const pending = createPendingAnalyticalAction({
    id: 'homolog-ux-1',
    createdFromMessageId: 'msg-offer',
    domain: 'SNAPSHOT',
    operation: 'CURRENT_POSITION',
    steps: [
      { toolName: null, filters: { monthKey: MONTH } },
      {
        toolName: 'payable_titles',
        filters: {
          monthKey: MONTH,
          status: 'OVERDUE',
          ordering: 'VALUE_DESC',
          limit: 5,
        },
      },
    ],
    objective: 'avaliar posição de caixa e compromissos vencidos',
    offerSnippet: 'posso cruzar caixa atual e vencidos para uma leitura prática',
    now: NOW,
  });
  if (pending === null) throw new Error('pending inválido');

  const payableTitles = createAdvisorPayableTitlesService({
    payables: {
      async findActiveByTenant() {
        return [
          row({
            id: '1',
            description: 'Empréstimo Bancário',
            dueDate: '2026-10-06',
            status: 'OVERDUE',
            unpaid: '1550.24',
          }),
          row({
            id: '2',
            description: 'Salário secretária',
            dueDate: '2026-10-06',
            status: 'OVERDUE',
            unpaid: '2500',
          }),
        ];
      },
      async findActiveByDueDateRange() {
        return [
          row({
            id: '1',
            description: 'Empréstimo Bancário',
            dueDate: '2026-10-06',
            status: 'OVERDUE',
            unpaid: '1550.24',
          }),
          row({
            id: '2',
            description: 'Salário secretária',
            dueDate: '2026-10-06',
            status: 'OVERDUE',
            unpaid: '2500',
          }),
        ];
      },
      async findRecognizedByDueDateRange() {
        return [];
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

  const execution = await executePendingAnalyticalAction({
    action: pending,
    tenantId: TENANT,
    resolvedMonthKey: MONTH,
    analyticalTools: tools,
    now: NOW,
  });

  const snapshotFactsText = [
    'scope: PERIOD',
    'entityScope: TENANT',
    'provenance: fatos oficiais da empresa (tenant-wide).',
    'temporalScope: PERIOD',
    `monthKey: ${MONTH}`,
    'cash.realized.inflows: 21752.67',
    'cash.realized.outflows: 800.00',
    'stock.payables.open: 98200.00',
    'stock.payables.overdue: 6225.00',
  ].join('\n');

  const blocks = buildPendingActionComposeBlocks({
    action: pending,
    execution,
    snapshotFactsText,
    userMessage: 'quero sim',
    resolvedMonthKey: MONTH,
  });

  const t0 = Date.now();
  const drafted = await provider.generate({
    tenantId: TENANT,
    provider: 'OPENAI',
    model: 'gpt-5.4-mini',
    blocks,
  });
  const gated = gateAdvisorEvidenceBoundAnswer({
    answerText: drafted.text,
    evidenceItems: [
      { text: snapshotFactsText, entityScope: 'TENANT', source: 'FINANCIAL_FACTS' },
      ...(execution.status === 'UNAVAILABLE'
        ? []
        : execution.executions.map((e) => ({
            text: e.content,
            entityScope: 'TENANT' as const,
            source: 'TOOL_RESULT' as const,
          }))),
    ],
    agentToolPath: true,
    requiredEntityScope: 'UNKNOWN',
    requiredCostCenterName: null,
  });

  console.log(
    JSON.stringify(
      {
        pendingId: pending.id,
        executionStatus: execution.status,
        latencyMs: Date.now() - t0,
        looksLikeDump: pendingAnswerLooksLikeTechnicalDump(gated.text),
        gateOk: gated.ok,
        answerPreview: gated.text.slice(0, 1200),
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
