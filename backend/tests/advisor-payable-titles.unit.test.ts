import { describe, expect, it } from 'vitest';
import { Prisma } from '../src/generated/prisma/client.js';

import {
  assertPayableTitlesArgs,
  createAdvisorPayableTitlesService,
} from '../src/modules/advisor/domain/advisor-payable-titles-tools.js';
import {
  PAYABLE_TITLES_TOOL_NAME,
  rankAdvisorPayableTitles,
  serializeAdvisorPayableTitles,
} from '../src/modules/advisor/domain/advisor-payable-titles.js';
import { deriveQuestionAnalyticalDemand } from '../src/modules/advisor/domain/advisor-question-scope.js';
import {
  analyzeToolEvidence,
  deriveAnalyticalObligations,
  evaluateAnalyticalCompletion,
} from '../src/modules/advisor/domain/advisor-analytical-completion.js';
import { listAdvisorAnalyticalTools } from '../src/modules/advisor/domain/advisor-analytical-tools.js';
import { buildPayableTitlesQuery } from '../src/modules/advisor/domain/analytical/build-analytical-query-from-tool.js';
import { validateAnalyticalCapability } from '../src/modules/advisor/domain/analytical/validate-analytical-capability.js';
import { AdvisorDomainError } from '../src/modules/advisor/domain/advisor-domain-error.js';
import {
  applyAdvisorEvidenceBoundRewrite,
  gateAdvisorEvidenceBoundAnswer,
  stripUnsupportedMonetaryClaims,
} from '../src/modules/advisor/domain/advisor-evidence-bound-answer.js';
import type { FinancialInstallmentReadRecord } from '../src/modules/finance/domain/types.js';

const TENANT_A = '11111111-1111-4111-8111-111111111111';
const TENANT_B = '22222222-2222-4222-8222-222222222222';
const NOW = new Date('2026-10-15T15:00:00.000Z');

function money(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function payable(input: {
  readonly id: string;
  readonly externalId: string;
  readonly tenantId?: string;
  readonly description?: string | null;
  readonly dueDate: string;
  readonly status: FinancialInstallmentReadRecord['status'];
  readonly total: string;
  readonly paid: string;
  readonly unpaid: string;
  readonly partyId?: string | null;
}): FinancialInstallmentReadRecord {
  return {
    id: input.id,
    tenantId: input.tenantId ?? TENANT_A,
    integrationId: 'int-a',
    externalId: input.externalId,
    description: input.description ?? null,
    dueDate: new Date(`${input.dueDate}T00:00:00.000Z`),
    competenceDate: null,
    upstreamCreatedAt: null,
    upstreamUpdatedAt: null,
    status: input.status,
    upstreamStatus: null,
    total: money(input.total),
    paid: money(input.paid),
    unpaid: money(input.unpaid),
    partyId: input.partyId ?? null,
    categoryExternalIds: ['cat-expense'],
    syncedAt: NOW,
  };
}

const SAMPLE_OPEN = [
  payable({
    id: 'p1',
    externalId: 'ext-1',
    description: 'Aluguel',
    dueDate: '2026-10-20',
    status: 'OPEN',
    total: '5000',
    paid: '0',
    unpaid: '5000',
    partyId: 'party-1',
  }),
  payable({
    id: 'p2',
    externalId: 'ext-2',
    description: 'Energia',
    dueDate: '2026-10-18',
    status: 'OPEN',
    total: '1200',
    paid: '0',
    unpaid: '1200',
    partyId: 'party-2',
  }),
  payable({
    id: 'p3',
    externalId: 'ext-3',
    description: 'Folha',
    dueDate: '2026-10-05',
    status: 'OVERDUE',
    total: '8000',
    paid: '0',
    unpaid: '8000',
    partyId: 'party-1',
  }),
];

const SAMPLE_PAID = payable({
  id: 'p4',
  externalId: 'ext-4',
  description: 'Software',
  dueDate: '2026-10-10',
  status: 'PAID',
  total: '900',
  paid: '900',
  unpaid: '0',
  partyId: 'party-3',
});

function createService(rows: readonly FinancialInstallmentReadRecord[]) {
  return createAdvisorPayableTitlesService({
    payables: {
      async findActiveByTenant() {
        return rows.filter((row) =>
          ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'].includes(row.status),
        );
      },
      async findActiveByDueDateRange(query) {
        return rows.filter(
          (row) =>
            row.tenantId === query.tenantId &&
            ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'].includes(row.status) &&
            row.dueDate.getTime() >= query.from.getTime() &&
            row.dueDate.getTime() <= query.to.getTime(),
        );
      },
      async findRecognizedByDueDateRange(query) {
        return rows.filter(
          (row) =>
            row.tenantId === query.tenantId &&
            ['OPEN', 'OVERDUE', 'PARTIALLY_PAID', 'PAID'].includes(row.status) &&
            row.dueDate.getTime() >= query.from.getTime() &&
            row.dueDate.getTime() <= query.to.getTime(),
        );
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
        return [
          {
            id: 'c1',
            tenantId: TENANT_A,
            integrationId: 'int-a',
            externalId: 'cat-expense',
            name: 'Despesas Operacionais',
            type: 'EXPENSE' as const,
            parentExternalId: null,
            active: true,
          },
        ];
      },
    } as never,
    parties: {
      async findNamesByIds(_scope: { tenantId: string }, ids: readonly string[]) {
        const map = new Map<string, string>();
        for (const id of ids) {
          map.set(id, id === 'party-1' ? 'Fornecedor Alfa' : id === 'party-2' ? 'Fornecedor Beta' : 'Fornecedor Gama');
        }
        return map;
      },
    } as never,
    costCenters: {
      async listByTenant() {
        return [
          { id: 'cc-1', name: 'Unidade Norte', code: 'NOR', active: true },
          { id: 'cc-2', name: 'Unidade Sul', code: 'SUL', active: true },
        ];
      },
    },
    costCenterAllocations: {
      async findActivePayableAllocationsByDueDate(query: {
        readonly tenantId: string;
        readonly costCenterId: string;
      }) {
        if (query.costCenterId !== 'cc-1') {
          return [];
        }
        return rows
          .filter((row) => ['OPEN', 'OVERDUE', 'PARTIALLY_PAID'].includes(row.status))
          .filter((row) => row.externalId === 'ext-1' || row.externalId === 'ext-3')
          .map((installment) => ({
            amount: installment.unpaid,
            installment,
          }));
      },
      async findRecognizedPayableAllocationsByDueDate(query: {
        readonly tenantId: string;
        readonly costCenterId: string;
      }) {
        if (query.costCenterId !== 'cc-1') {
          return [];
        }
        return rows
          .filter((row) => row.externalId === 'ext-1' || row.externalId === 'ext-3' || row.externalId === 'ext-4')
          .map((installment) => ({
            amount: installment.unpaid.greaterThan(0) ? installment.unpaid : installment.total,
            installment,
          }));
      },
    } as never,
  });
}

describe('payable_titles — primitiva PAYABLE', () => {
  it('A) RANKING VALUE_DESC retorna maior título OPEN por unpaid', async () => {
    const service = createService([...SAMPLE_OPEN, SAMPLE_PAID]);
    const result = await service.list({
      tenantId: TENANT_A,
      monthKey: '2026-10',
      status: 'OPEN',
      ordering: 'VALUE_DESC',
      limit: 1,
      now: NOW,
    });
    expect(result.status).toBe('OK');
    expect(result.domain).toBe('PAYABLE');
    expect(result.returnedCount).toBe(1);
    expect(result.lines[0]?.description).toBe('Folha');
    expect(result.lines[0]?.amount).toBe('8000');
    expect(result.lines[0]?.situation).toBe('OVERDUE');
  });

  it('B) TOP N respeita limit e ordenação', async () => {
    const service = createService(SAMPLE_OPEN);
    const result = await service.list({
      tenantId: TENANT_A,
      monthKey: '2026-10',
      status: 'OPEN',
      ordering: 'VALUE_DESC',
      limit: 2,
      now: NOW,
    });
    expect(result.returnedCount).toBe(2);
    expect(result.hasMore).toBe(true);
    expect(result.lines.map((line) => line.amount)).toEqual(['8000', '5000']);
  });

  it('C) OPEN não retorna título quitado', async () => {
    const service = createService([...SAMPLE_OPEN, SAMPLE_PAID]);
    const result = await service.list({
      tenantId: TENANT_A,
      monthKey: '2026-10',
      status: 'OPEN',
      ordering: 'VALUE_DESC',
      limit: 20,
      now: NOW,
    });
    expect(result.lines.every((line) => line.situation !== 'PAID')).toBe(true);
    expect(result.lines.some((line) => line.description === 'Software')).toBe(false);
  });

  it('D) ALL considera aberto + pago', async () => {
    const service = createService([...SAMPLE_OPEN, SAMPLE_PAID]);
    const result = await service.list({
      tenantId: TENANT_A,
      monthKey: '2026-10',
      status: 'ALL',
      ordering: 'VALUE_DESC',
      limit: 20,
      now: NOW,
    });
    expect(result.lines.some((line) => line.description === 'Software')).toBe(true);
    expect(result.lines.some((line) => line.description === 'Folha')).toBe(true);
  });

  it('E) OVERDUE respeita vencimento passado', async () => {
    const service = createService(SAMPLE_OPEN);
    const result = await service.list({
      tenantId: TENANT_A,
      monthKey: '2026-10',
      status: 'OVERDUE',
      ordering: 'VALUE_DESC',
      limit: 20,
      now: NOW,
    });
    expect(result.lines).toHaveLength(1);
    expect(result.lines[0]?.description).toBe('Folha');
    expect(result.lines[0]?.situation).toBe('OVERDUE');
  });

  it('F) Tenant isolation', async () => {
    const foreign = payable({
      id: 'px',
      externalId: 'ext-x',
      tenantId: TENANT_B,
      description: 'Outro tenant',
      dueDate: '2026-10-20',
      status: 'OPEN',
      total: '99999',
      paid: '0',
      unpaid: '99999',
    });
    const service = createService([...SAMPLE_OPEN, foreign]);
    const result = await service.list({
      tenantId: TENANT_A,
      monthKey: '2026-10',
      status: 'OPEN',
      ordering: 'VALUE_DESC',
      limit: 20,
      now: NOW,
    });
    expect(result.lines.some((line) => line.description === 'Outro tenant')).toBe(false);
  });

  it('G) costCenterQuery tenant-scoped', async () => {
    const service = createService([...SAMPLE_OPEN, SAMPLE_PAID]);
    const result = await service.list({
      tenantId: TENANT_A,
      monthKey: '2026-10',
      status: 'OPEN',
      ordering: 'VALUE_DESC',
      costCenterQuery: 'Unidade Norte',
      limit: 20,
      now: NOW,
    });
    expect(result.entityScope).toBe('COST_CENTER');
    expect(result.costCenter?.name).toBe('Unidade Norte');
    expect(result.lines.every((line) => line.description === 'Aluguel' || line.description === 'Folha')).toBe(
      true,
    );
  });

  it('H) LLM não pode fornecer tenantId/costCenterId', () => {
    expect(() =>
      assertPayableTitlesArgs({
        monthKey: '2026-10',
        status: 'OPEN',
        tenantId: TENANT_A,
      }),
    ).toThrow(AdvisorDomainError);
    expect(() =>
      assertPayableTitlesArgs({
        monthKey: '2026-10',
        status: 'OPEN',
        costCenterId: 'cc-1',
      }),
    ).toThrow(AdvisorDomainError);
  });

  it('I) Evidence PAYABLE autoriza resposta PAYABLE', () => {
    const serialized = serializeAdvisorPayableTitles(
      rankAdvisorPayableTitles({
        monthKey: '2026-10',
        titleStatus: 'OPEN',
        ordering: 'VALUE_DESC',
        requestedLimit: 1,
        effectiveLimit: 1,
        available: true,
        entityScope: 'TENANT',
        costCenter: null,
        items: [
          {
            externalId: 'ext-1',
            description: 'Aluguel',
            supplierName: 'Fornecedor Alfa',
            categoryNames: ['Despesas Operacionais'],
            dueDate: new Date('2026-10-20T00:00:00.000Z'),
            rankAmount: money('5000'),
            unpaid: money('5000'),
            paid: money('0'),
            total: money('5000'),
            installmentStatus: 'OPEN',
            situation: 'UPCOMING',
            costCenterNames: [],
          },
        ],
      }),
    );
    const ref = analyzeToolEvidence(
      {
        toolName: PAYABLE_TITLES_TOOL_NAME,
        content: JSON.stringify(serialized),
        ok: true,
      },
      false,
    );
    expect(ref.satisfies).toEqual(
      expect.arrayContaining(['VALUE', 'PAYABLE_TITLES', 'RANKING', 'MOVEMENTS']),
    );
    expect(serialized.domain).toBe('PAYABLE');
  });

  it('A3-A) PAYABLE aggregate VALUE não exige PAYABLE_TITLES', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Qual o valor total ainda devido em contas a pagar?',
      comparison: false,
    });
    expect(demand.wantsPayableObligation).toBe(true);
    expect(demand.wantsPayableTitleDetail).toBe(false);
    const required = deriveAnalyticalObligations(demand);
    expect(required).toContain('VALUE');
    expect(required).not.toContain('PAYABLE_TITLES');
  });

  it('A3-B) PAYABLE ranking exige PAYABLE_TITLES', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'qual a maior conta a pagar?',
      comparison: false,
    });
    expect(demand.wantsPayableObligation).toBe(true);
    expect(demand.wantsPayableTitleDetail).toBe(true);
    expect(deriveAnalyticalObligations(demand)).toContain('PAYABLE_TITLES');
  });

  it('A3-C) PAYABLE movements/detail exige PAYABLE_TITLES', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'liste os títulos a pagar que vencem neste mês',
      comparison: false,
    });
    expect(demand.wantsPayableTitleDetail).toBe(true);
    expect(deriveAnalyticalObligations(demand)).toContain('PAYABLE_TITLES');

    const followUp = deriveQuestionAnalyticalDemand({
      content: 'E agora me mostra só as que ainda estão abertas.',
      comparison: false,
    });
    expect(followUp.wantsPayableObligation).toBe(true);
    expect(followUp.wantsPayableTitleDetail).toBe(true);
    expect(deriveAnalyticalObligations(followUp)).toContain('PAYABLE_TITLES');
  });

  it('A3-D) payable_stock satisfaz aggregate VALUE', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'Quanto está o estoque atual de contas a pagar?',
      comparison: false,
    });
    const required = deriveAnalyticalObligations(demand);
    expect(required).toEqual(['VALUE']);
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [],
      availableToolNames: [PAYABLE_TITLES_TOOL_NAME],
      preloadFactScopes: ['TENANT'],
    });
    expect(state.satisfiedObligations.has('VALUE')).toBe(true);
    expect(state.missingObligations).toEqual([]);
    expect(state.decision).toBe('ANSWER');
  });

  it('A3-E) payable_stock NÃO satisfaz ranking/detail', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'qual a maior obrigação a pagar?',
      comparison: false,
    });
    const required = deriveAnalyticalObligations(demand);
    expect(required).toContain('PAYABLE_TITLES');
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [],
      availableToolNames: [PAYABLE_TITLES_TOOL_NAME],
      preloadFactScopes: ['TENANT'],
    });
    expect(state.satisfiedObligations.has('PAYABLE_TITLES')).toBe(false);
    expect(state.missingObligations).toContain('PAYABLE_TITLES');
  });

  it('A3-F) 98200.00 evidencia R$ 98.200,00 e R$ 98.200', () => {
    const facts = {
      text: 'entityScope: TENANT\nstock.payables.open: 98200.00',
      entityScope: 'TENANT' as const,
      source: 'FINANCIAL_FACTS' as const,
    };
    expect(
      gateAdvisorEvidenceBoundAnswer({
        answerText: 'O total em aberto é R$ 98.200,00.',
        evidenceItems: [facts],
        agentToolPath: true,
      }).ok,
    ).toBe(true);
    expect(
      gateAdvisorEvidenceBoundAnswer({
        answerText: 'O total em aberto é R$ 98.200.',
        evidenceItems: [facts],
        agentToolPath: true,
      }).ok,
    ).toBe(true);
  });

  it('A3-G) escopo/provenance continuam obrigatórios', () => {
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText: 'No centro Alfa o aberto é R$ 98.200,00.',
      evidenceItems: [
        {
          text: 'entityScope: TENANT\nstock.payables.open: 98200.00',
          entityScope: 'TENANT',
          source: 'FINANCIAL_FACTS',
        },
      ],
      agentToolPath: true,
      requiredEntityScope: 'COST_CENTER',
      requiredCostCenterName: 'Alfa',
    });
    expect(gated.ok).toBe(false);
    expect(gated.reason).toBe('INCOMPATIBLE_EVIDENCE_SCOPE');
  });

  it('A3-H) multi-title ranking com valores individuais → PASS', () => {
    const tool = JSON.stringify({
      status: 'OK',
      domain: 'PAYABLE',
      entityScope: 'TENANT',
      lines: [
        { description: 'Folha', amount: '80000', unpaid: '80000' },
        { description: 'Aluguel', amount: '15000', unpaid: '15000' },
        { description: 'Energia', amount: '3200', unpaid: '3200' },
      ],
    });
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText:
        'Os maiores títulos são Folha R$ 80.000,00, Aluguel R$ 15.000,00 e Energia R$ 3.200,00.',
      evidenceItems: [{ text: tool, entityScope: 'TENANT', source: 'TOOL_RESULT' }],
      agentToolPath: true,
    });
    expect(gated.ok).toBe(true);
  });

  it('A3-I) soma inventada dos títulos → FAIL', () => {
    const tool = JSON.stringify({
      status: 'OK',
      domain: 'PAYABLE',
      entityScope: 'TENANT',
      lines: [
        { description: 'Folha', amount: '80000' },
        { description: 'Aluguel', amount: '15000' },
      ],
    });
    const gated = gateAdvisorEvidenceBoundAnswer({
      answerText:
        'Folha R$ 80.000,00 e Aluguel R$ 15.000,00. Esses títulos somam R$ 95.000,00.',
      evidenceItems: [{ text: tool, entityScope: 'TENANT', source: 'TOOL_RESULT' }],
      agentToolPath: true,
    });
    expect(gated.ok).toBe(false);
    expect(gated.unsupportedClaims.some((c) => c.includes('95.000'))).toBe(true);
  });

  it('A3-J) rewrite/salvage removendo soma e mantendo ranking → PASS', () => {
    const tool = JSON.stringify({
      status: 'OK',
      domain: 'PAYABLE',
      entityScope: 'TENANT',
      lines: [
        { description: 'Folha', amount: '80000' },
        { description: 'Aluguel', amount: '15000' },
        { description: 'Energia', amount: '3200' },
      ],
    });
    const rejected =
      '1. Folha — R$ 80.000,00\n2. Aluguel — R$ 15.000,00\n3. Energia — R$ 3.200,00\nTotal R$ 98.200,00.';
    const first = gateAdvisorEvidenceBoundAnswer({
      answerText: rejected,
      evidenceItems: [{ text: tool, entityScope: 'TENANT', source: 'TOOL_RESULT' }],
      agentToolPath: true,
    });
    expect(first.ok).toBe(false);
    const after = applyAdvisorEvidenceBoundRewrite({
      original: first,
      rejectedAnswerText: rejected,
      rewriteText: 'Não posso afirmar os valores financeiros citados porque eles não estão sustentados.',
      evidenceItems: [{ text: tool, entityScope: 'TENANT', source: 'TOOL_RESULT' }],
    });
    expect(after.ok).toBe(true);
    expect(after.text).toContain('80.000');
    expect(after.text).not.toContain('98.200');
    expect(stripUnsupportedMonetaryClaims(rejected, first.unsupportedClaims)).not.toContain(
      '98.200',
    );
  });

  it('J) REALIZED_CASH não satisfaz obligation PAYABLE', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'qual a maior conta a pagar?',
      comparison: false,
    });
    expect(demand.wantsPayableObligation).toBe(true);
    expect(demand.wantsPayableTitleDetail).toBe(true);
    const required = deriveAnalyticalObligations(demand);
    expect(required).toContain('PAYABLE_TITLES');
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [
        {
          toolName: 'cash_movement_lines',
          content: JSON.stringify({
            status: 'OK',
            domain: 'REALIZED_CASH',
            lines: [{ amount: '250', description: 'Pix' }],
          }),
          ok: true,
        },
      ],
      availableToolNames: ['cash_movement_lines', PAYABLE_TITLES_TOOL_NAME],
      preloadFactScopes: ['TENANT'],
    });
    expect(state.satisfiedObligations.has('PAYABLE_TITLES')).toBe(false);
    expect(state.missingObligations).toContain('PAYABLE_TITLES');
    expect(state.decision).not.toBe('ANSWER');
  });

  it('K) payable_stock agregado não autoriza título individual', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'qual a maior obrigação a pagar?',
      comparison: false,
    });
    expect(demand.wantsPayableTitleDetail).toBe(true);
    const required = deriveAnalyticalObligations(demand);
    const state = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [],
      availableToolNames: [PAYABLE_TITLES_TOOL_NAME],
      preloadFactScopes: ['TENANT'],
    });
    expect(state.satisfiedObligations.has('PAYABLE_TITLES')).toBe(false);
    expect(state.missingObligations).toContain('PAYABLE_TITLES');
  });

  it('L) Completion força tool PAYABLE quando demanda exige detalhe', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'quais são as 5 maiores contas a pagar?',
      comparison: false,
    });
    expect(demand.wantsPayableTitleDetail).toBe(true);
    const required = deriveAnalyticalObligations(demand);
    expect(required).toContain('PAYABLE_TITLES');
    const withPayable = evaluateAnalyticalCompletion({
      demand,
      requiredObligations: required,
      toolEvidence: [
        {
          toolName: PAYABLE_TITLES_TOOL_NAME,
          content: JSON.stringify({
            status: 'OK',
            domain: 'PAYABLE',
            entityScope: 'TENANT',
            lines: [{ amount: '8000' }, { amount: '5000' }],
          }),
          ok: true,
        },
      ],
      availableToolNames: listAdvisorAnalyticalTools().map((tool) => tool.name),
      preloadFactScopes: ['TENANT'],
    });
    expect(withPayable.satisfiedObligations.has('PAYABLE_TITLES')).toBe(true);
    expect(withPayable.decision).toBe('ANSWER');
  });

  it('M) maior gasto/saída realizada permanece REALIZED_CASH', () => {
    const demand = deriveQuestionAnalyticalDemand({
      content: 'qual foi minha maior saída realizada de caixa?',
      comparison: false,
    });
    expect(demand.wantsOutflow).toBe(true);
    expect(demand.wantsPayableObligation).toBe(false);
    const required = deriveAnalyticalObligations(demand);
    expect(required).not.toContain('PAYABLE_TITLES');
  });

  it('N) DUE_DATE_ASC ordena por vencimento', async () => {
    const service = createService(SAMPLE_OPEN);
    const result = await service.list({
      tenantId: TENANT_A,
      monthKey: '2026-10',
      status: 'OPEN',
      ordering: 'DUE_DATE_ASC',
      limit: 3,
      now: NOW,
    });
    expect(result.lines.map((line) => line.dueDate)).toEqual([
      '2026-10-05',
      '2026-10-18',
      '2026-10-20',
    ]);
  });

  it('O) capability AnalyticalQuery publicada + tool no catálogo', () => {
    expect(listAdvisorAnalyticalTools().some((tool) => tool.name === PAYABLE_TITLES_TOOL_NAME)).toBe(
      true,
    );
    const ranking = buildPayableTitlesQuery({
      monthKey: '2026-10',
      ordering: 'VALUE_DESC',
      limit: 5,
    });
    const validated = validateAnalyticalCapability(ranking);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.capability.executorKey).toBe('payableTitles');
      expect(validated.capability.metric).toBe('PAYABLE_TITLE');
    }
  });
});
