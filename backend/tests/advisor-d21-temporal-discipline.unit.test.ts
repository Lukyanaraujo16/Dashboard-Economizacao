import { describe, expect, it } from 'vitest';

import { Prisma } from '../src/generated/prisma/client.js';
import {
  ADVISOR_DRILLDOWN_DEFAULT_LIMIT,
  ADVISOR_DRILLDOWN_MAX_LIMIT,
  ADVISOR_PLATFORM_INSTRUCTIONS,
  CASH_MOVEMENT_LINES_TOOL_NAME,
  CASH_REALIZED_BREAKDOWN_TOOL_NAME,
  assertCashMovementLinesArgs,
  clampAdvisorDrilldownLimit,
  createAdvisorAnalyticalToolExecutor,
  extractAdvisorDrilldownLimit,
  resolveAdvisorConversationalPeriod,
  resolveAdvisorDrilldownIntent,
} from '../src/modules/advisor/index.js';

describe('F13.8.1D2.1 drill-down temporal e disciplina', () => {
  it('resolve julho explícito com limit 10 mesmo depois de agosto', () => {
    const now = new Date('2026-09-24T18:00:00.000Z');
    const july = resolveAdvisorConversationalPeriod({
      content: 'Me mostre os 10 maiores recebimentos de julho.',
      referenceMonthKey: '2026-09',
      now,
      priorUserContents: [
        'Como está agosto?',
        'E julho?',
        'Qual foi a diferença entre julho e agosto?',
        'Quais foram os 5 maiores recebimentos de agosto?',
      ],
    });
    expect(july).toEqual({ monthKey: '2026-07', source: 'EXPLICIT', comparison: false });
    const intent = resolveAdvisorDrilldownIntent('Me mostre os 10 maiores recebimentos de julho.');
    expect(intent).toEqual({
      toolName: CASH_MOVEMENT_LINES_TOOL_NAME,
      direction: 'INFLOW',
      sort: 'AMOUNT_DESC',
      limit: 10,
    });
  });

  it('preserva julho em follow-up desse mês e volta a agosto quando pedido', () => {
    const now = new Date('2026-09-24T18:00:00.000Z');
    const outflows = resolveAdvisorConversationalPeriod({
      content: 'E as 5 maiores saídas desse mês?',
      referenceMonthKey: '2026-09',
      now,
      priorUserContents: [
        'Quais foram os 5 maiores recebimentos de agosto?',
        'Me mostre os 10 maiores recebimentos de julho.',
      ],
    });
    expect(outflows.monthKey).toBe('2026-07');
    expect(resolveAdvisorDrilldownIntent('E as 5 maiores saídas desse mês?')).toEqual({
      toolName: CASH_MOVEMENT_LINES_TOOL_NAME,
      direction: 'OUTFLOW',
      sort: 'AMOUNT_DESC',
      limit: 5,
    });

    const august = resolveAdvisorConversationalPeriod({
      content: 'Agora em agosto?',
      referenceMonthKey: '2026-09',
      now,
      priorUserContents: [
        'Quais foram os 5 maiores recebimentos de agosto?',
        'Me mostre os 10 maiores recebimentos de julho.',
        'E as 5 maiores saídas desse mês?',
      ],
    });
    expect(august.monthKey).toBe('2026-08');
  });

  it('clampa limits 1/5/10/20/21/5000', () => {
    expect(extractAdvisorDrilldownLimit('os 1 maiores')).toBe(1);
    expect(extractAdvisorDrilldownLimit('maiores recebimentos')).toBe(ADVISOR_DRILLDOWN_DEFAULT_LIMIT);
    expect(extractAdvisorDrilldownLimit('os 10 maiores recebimentos')).toBe(10);
    expect(extractAdvisorDrilldownLimit('top 20')).toBe(20);
    expect(clampAdvisorDrilldownLimit(21).effectiveLimit).toBe(ADVISOR_DRILLDOWN_MAX_LIMIT);
    expect(clampAdvisorDrilldownLimit(5000).effectiveLimit).toBe(20);
    expect(assertCashMovementLinesArgs({
      monthKey: '2026-07',
      direction: 'INFLOW',
      limit: '10',
    })).toEqual({
      monthKey: '2026-07',
      direction: 'INFLOW',
      sort: 'AMOUNT_DESC',
      limit: 10,
    });
  });

  it('vincula monthKey da tool ao período resolvido e não troca para agosto', async () => {
    const executor = createAdvisorAnalyticalToolExecutor({
      cashComparison: {
        async compare() {
          throw new Error('compare não deveria rodar');
        },
      },
      cashMovements: {
        async list(input) {
          expect(input.monthKey).toBe('2026-07');
          expect(input.limit).toBe(10);
          return {
            monthKey: input.monthKey,
            scope: 'PERIOD',
            direction: input.direction,
            sort: input.sort,
            status: 'OK',
            requestedLimit: 10,
            effectiveLimit: 10,
            returnedCount: 10,
            hasMore: true,
            lines: Array.from({ length: 10 }, (_, index) => ({
              date: '2026-07-01',
              amount: new Prisma.Decimal(10 - index),
              description: null,
              partyName: null,
              categoryNames: [],
              costCenterNames: [],
            })),
          };
        },
      },
    });
    const result = await executor.execute({
      tenantId: 'tenant-a',
      resolvedMonthKey: '2026-07',
      call: {
        id: 'swap',
        name: CASH_MOVEMENT_LINES_TOOL_NAME,
        arguments: { monthKey: '2026-08', direction: 'INFLOW', limit: 10 },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.monthKey).toBe('2026-07');
    expect(result.content).toContain('"effectiveLimit":10');
    expect(result.content).toContain('"returnedCount":10');
  });

  it('intenção de categorias não vira movement lines', () => {
    expect(resolveAdvisorDrilldownIntent('Quais categorias mais faturaram em agosto de 2026?')).toEqual({
      toolName: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
      direction: 'INFLOW',
      sort: 'AMOUNT_DESC',
      limit: 5,
    });
    expect(
      resolveAdvisorDrilldownIntent('Quais foram as categorias com maiores saídas de caixa em agosto?'),
    ).toEqual({
      toolName: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
      direction: 'OUTFLOW',
      sort: 'AMOUNT_DESC',
      limit: 5,
    });
    expect(resolveAdvisorDrilldownIntent('Qual convênio individual mais faturou em agosto?')).toBeNull();
  });

  it('PLATFORM reforça disciplina objetiva, benchmark e ranking nominal', () => {
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('10 maiores recebimentos de julho');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('PERIOD_DRILLDOWN');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('PROIBIDO dizer que não conseguiu obter ranking/Top N');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO classifique automaticamente');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('despesa fixa');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('comum em clínicas');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO acrescente automaticamente: recomendo');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('estou à disposição');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('movimento individual descrito assim');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO autoriza concluir que aquele nome foi o convênio');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('EMPTY_RESULT = consulta válida sem linhas');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('RESULTADO DE CAIXA');
    expect(ADVISOR_PLATFORM_INSTRUCTIONS).toContain('NÃO acrescente automaticamente: recomendação');
  });
});
