import { describe, expect, it, vi } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import type { MonthlyCashFlow } from '../src/modules/analytics/domain/types.js';
import { createFakeIaProvider } from '../src/infrastructure/ai/fake-ia-provider.js';
import {
  ADVISOR_MAX_TOOL_ROUNDS,
  ADVISOR_PLATFORM_INSTRUCTIONS,
  CASH_MOVEMENT_LINES_TOOL_NAME,
  CASH_REALIZED_BREAKDOWN_TOOL_NAME,
  COMPARE_CASH_MONTHS_TOOL_NAME,
  assertCashMovementLinesArgs,
  assertCashRealizedBreakdownArgs,
  createAdvisorAnalyticalToolExecutor,
  createAdvisorCashBreakdownService,
  createAdvisorCashMovementLinesService,
  listAdvisorAnalyticalTools,
  resolveAdvisorConversationalPeriod,
} from '../src/modules/advisor/index.js';
import { AdvisorDomainError } from '../src/modules/advisor/domain/advisor-domain-error.js';

function dec(value: string): Prisma.Decimal {
  return new Prisma.Decimal(value);
}

function flow(tenantId: string, monthKey: string): MonthlyCashFlow {
  return {
    tenantId,
    today: new Date('2026-09-24T00:00:00.000Z'),
    monthKey,
    from: new Date(`${monthKey}-01T00:00:00.000Z`),
    to: new Date(`${monthKey}-28T00:00:00.000Z`),
    costCenterCashSplit: true,
    realized: { inflows: dec('224790.3'), outflows: dec('10'), result: dec('224780.3') },
    realizedByCategory: {
      inflows: {
        total: dec('224790.3'),
        classified: dec('224790.3'),
        uncategorized: dec('0'),
        imprecise: dec('0'),
        coverageRate: dec('100'),
        items: [
          {
            kind: 'category',
            key: 'cat-convenio',
            name: 'Atendimentos Convênio',
            amount: dec('207185.5'),
            percentage: dec('92.17'),
          },
        ],
      },
      outflows: {
        total: dec('10'),
        classified: dec('10'),
        uncategorized: dec('0'),
        imprecise: dec('0'),
        coverageRate: dec('100'),
        items: [
          {
            kind: 'category',
            key: 'cat-folha',
            name: 'Folha',
            amount: dec('10'),
            percentage: dec('100'),
          },
        ],
      },
    },
    expected: { receivables: dec('0'), payables: dec('0'), result: dec('0') },
    overdue: {
      receivables: dec('0'),
      payables: dec('0'),
      ofMonth: { receivables: dec('0'), payables: dec('0') },
    },
    stock: {
      receivables: { open: null, overdue: null, dueToday: null, upcoming: null },
      payables: { open: null, overdue: null, dueToday: null, upcoming: null },
    },
    coverage: null,
    daily: { realized: [], expected: [] },
  };
}

describe('F13.8.1D2 drill-down analítico', () => {
  it('allowlist registra as três tools sem tenantId no schema', () => {
    const names = listAdvisorAnalyticalTools().map((tool) => tool.name);
    expect(names).toEqual([
      COMPARE_CASH_MONTHS_TOOL_NAME,
      CASH_REALIZED_BREAKDOWN_TOOL_NAME,
      CASH_MOVEMENT_LINES_TOOL_NAME,
      'cash_nominal_dimension_ranking',
      'cash_nominal_dimension_lookup',
      'compare_cash_nominal_dimension',
      'cash_cost_center_ranking',
      'cash_cost_center_lookup',
    ]);
    expect(JSON.stringify(listAdvisorAnalyticalTools())).not.toContain('tenantId');
  });

  it('rejeita tenantId, SQL, categoryKey e monthKey/direction inválidos', () => {
    expect(() =>
      assertCashRealizedBreakdownArgs({
        monthKey: '2026-08',
        direction: 'INFLOW',
        tenantId: 'evil',
      }),
    ).toThrow(AdvisorDomainError);
    expect(() =>
      assertCashMovementLinesArgs({
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        sql: 'select 1',
      }),
    ).toThrow(/proibido/);
    expect(() =>
      assertCashMovementLinesArgs({
        monthKey: '2026-08',
        direction: 'INFLOW',
        categoryKey: 'cat-convenio',
      }),
    ).toThrow(/proibido|aceita apenas/);
    expect(() =>
      assertCashRealizedBreakdownArgs({ monthKey: '2026-13', direction: 'INFLOW' }),
    ).toThrow(/YYYY-MM/);
    expect(() =>
      assertCashRealizedBreakdownArgs({ monthKey: '2026-08', direction: 'BOTH' }),
    ).toThrow(/INFLOW ou OUTFLOW/);
  });

  it('executa breakdown e movement lines com tenant do runtime', async () => {
    const cashCalls: string[] = [];
    const reportCalls: Array<{ tenantId: string; direction: string; fromKey: string }> = [];
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: {
        async compare() {
          throw new Error('compare não deveria rodar');
        },
      },
      cashBreakdown: createAdvisorCashBreakdownService({
        cashFlow: {
          async getMonthlyCashFlow(input) {
            cashCalls.push(input.tenantId);
            if (input.tenantId !== 'tenant-a') {
              throw new Error(`cross-tenant ${input.tenantId}`);
            }
            return flow(input.tenantId, input.monthKey ?? '2026-08');
          },
        },
      }),
      cashMovements: createAdvisorCashMovementLinesService({
        reportCashDetails: {
          async listAllReportCashDetails(input) {
            reportCalls.push({
              tenantId: input.tenantId,
              direction: input.direction,
              fromKey: input.fromKey,
            });
            if (input.tenantId !== 'tenant-a') {
              throw new Error(`cross-tenant ${input.tenantId}`);
            }
            return {
              available: true,
              unavailableReason: null,
              situation: 'REALIZED',
              direction: input.direction,
              totalAmount: dec('900'),
              items: [
                {
                  date: new Date('2026-08-10T00:00:00.000Z'),
                  description: 'Recebimento oficial',
                  partyName: 'Party A',
                  categoryNames: ['Atendimentos Convênio'],
                  costCenterNames: ['Centro'],
                  situation: 'REALIZED',
                  amount: dec('900'),
                  installmentKind: 'RECEIVABLE',
                  installmentExternalId: 'secret-inst',
                  settlementExternalId: 'secret-set',
                },
              ],
            };
          },
        },
      }),
    });

    const breakdown = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'b1',
        name: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
        arguments: { monthKey: '2026-08', direction: 'INFLOW' },
      },
    });
    expect(breakdown.ok).toBe(true);
    expect(breakdown.content).toContain('Atendimentos Convênio');
    expect(breakdown.content).toContain('OFFICIAL_REALIZED_BY_CATEGORY');
    expect(cashCalls).toEqual(['tenant-a']);

    const movements = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'm1',
        name: CASH_MOVEMENT_LINES_TOOL_NAME,
        arguments: { monthKey: '2026-08', direction: 'INFLOW', limit: 5 },
      },
    });
    expect(movements.ok).toBe(true);
    expect(movements.content).toContain('Party A');
    expect(movements.content).not.toContain('secret-inst');
    expect(movements.content).not.toContain('secret-set');
    expect(movements.content).toContain('notAConvenioRanking');
    expect(reportCalls).toEqual([
      { tenantId: 'tenant-a', direction: 'revenue', fromKey: '2026-08' },
    ]);

    const injected = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'bad',
        name: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
        arguments: { monthKey: '2026-08', direction: 'INFLOW', tenantId: 'tenant-b' },
      },
    });
    expect(injected.ok).toBe(false);
    expect(injected.content).toContain('UNAVAILABLE');
    expect(injected.content).not.toContain('tenant-b');
  });

  it('limit abusivo é clamped e falha não vira zero', async () => {
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: {
        async compare() {
          throw new Error('compare não deveria rodar');
        },
      },
      cashBreakdown: {
        async breakdown(input) {
          expect(input.limit).toBe(5000);
          return {
            tenantId: input.tenantId,
            monthKey: input.monthKey,
            scope: 'PERIOD',
            direction: input.direction,
            coverage: 'FULL_BILLING',
            status: 'OK',
            totalRealized: dec('10'),
            requestedLimit: 5000,
            effectiveLimit: 20,
            hasMore: false,
            categories: [
              {
                key: 'x',
                label: 'X',
                kind: 'category',
                amount: dec('10'),
                sharePercent: dec('100'),
                rank: 1,
              },
            ],
          };
        },
      },
      cashMovements: {
        async list() {
          throw new Error('boom');
        },
      },
    });
    const limited = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'lim',
        name: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
        arguments: { monthKey: '2026-08', direction: 'INFLOW', limit: 5000 },
      },
    });
    expect(limited.ok).toBe(true);
    expect(limited.content).toContain('"effectiveLimit":20');

    const failed = await executor.execute({
      tenantId: 'tenant-a',
      call: {
        id: 'fail',
        name: CASH_MOVEMENT_LINES_TOOL_NAME,
        arguments: { monthKey: '2026-08', direction: 'OUTFLOW' },
      },
    });
    expect(failed.ok).toBe(false);
    expect(failed.content).toContain('UNAVAILABLE');
    expect(failed.content).not.toMatch(/"amount":"0"/);
    expect(failed.content).toContain('Não consegui obter o detalhamento das movimentações agora.');
  });

  it('fake provider solicita breakdown e movement lines e recebe resultado', async () => {
    const provider = createFakeIaProvider({
      script: [
        {
          toolCalls: [
            {
              id: '1',
              name: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
              arguments: { monthKey: '2026-08', direction: 'INFLOW' },
            },
          ],
        },
        { text: 'Categoria líder oficial recebida.' },
      ],
    });
    const first = await provider.generate({
      tenantId: 'tenant-a',
      provider: 'OPENAI',
      model: 'gpt-test',
      blocks: [],
      tools: listAdvisorAnalyticalTools(),
    });
    expect(first.toolCalls?.[0]?.name).toBe(CASH_REALIZED_BREAKDOWN_TOOL_NAME);
    const second = await provider.generate({
      tenantId: 'tenant-a',
      provider: 'OPENAI',
      model: 'gpt-test',
      blocks: [],
      toolRounds: [
        {
          calls: first.toolCalls ?? [],
          results: [
            {
              id: '1',
              name: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
              ok: true,
              content: '{"status":"OK","categories":[{"label":"Atendimentos Convênio"}]}',
            },
          ],
        },
      ],
    });
    expect(second.text).toBe('Categoria líder oficial recebida.');
    expect(ADVISOR_MAX_TOOL_ROUNDS).toBe(3);
  });

  it('resolver temporal de drill-down herda julho e depois agosto', () => {
    const now = new Date('2026-09-24T18:00:00.000Z');
    const july = resolveAdvisorConversationalPeriod({
      content: 'Quais foram os maiores recebimentos desse mês?',
      referenceMonthKey: '2026-09',
      now,
      priorUserContents: ['Como está agosto?', 'E julho?'],
    });
    expect(july.monthKey).toBe('2026-07');
    expect(july.source).toBe('CONVERSATION_CONTEXT');

    const august = resolveAdvisorConversationalPeriod({
      content: 'Quais foram as maiores saídas?',
      referenceMonthKey: '2026-09',
      now,
      priorUserContents: ['Como está agosto?', 'E julho?', 'E em agosto?'],
    });
    expect(august.monthKey).toBe('2026-08');
  });

  it('comparação D1 não exige movement tool e convênio individual continua indisponível', () => {
    const compare = resolveAdvisorConversationalPeriod({
      content: 'Qual foi a diferença entre julho e agosto?',
      referenceMonthKey: '2026-09',
      now: new Date('2026-09-24T18:00:00.000Z'),
    });
    expect(compare).toEqual({
      monthKey: '2026-08',
      source: 'EXPLICIT',
      comparison: true,
      comparisonMonthKey: '2026-07',
    });
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO chame cash_realized_breakdown nem cash_movement_lines');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('compare_cash_months');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO chame drill-down');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('cash_realized_breakdown');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('cash_movement_lines');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('maiores recebimentos/pagamentos/saídas');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('PROIBIDO: usar Top 5/20');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('qual cliente, fornecedor ou convênio individual mais faturou');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('Bradesco, Vale, Unimed');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('Atendimentos Convênio');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('RESULTADO DE CAIXA');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO acrescente automaticamente: recomendação');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('UNAVAILABLE');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('EMPTY_RESULT');
  });

  it('tool desconhecida continua rejeitada', async () => {
    const execute = vi.fn();
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: { compare: execute },
    });
    const unknown = await executor.execute({
      tenantId: 'tenant-a',
      call: { id: 'x', name: 'drop_table', arguments: { monthKey: '2026-08', direction: 'INFLOW' } },
    });
    expect(unknown.ok).toBe(false);
    expect(unknown.content).toContain('UNAVAILABLE');
    expect(execute).not.toHaveBeenCalled();
  });
});
