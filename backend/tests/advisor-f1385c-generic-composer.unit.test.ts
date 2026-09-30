import { describe, expect, it } from 'vitest';

import { composeAdvisorFactualAnswer } from '../src/modules/advisor/domain/compose-advisor-factual-answer.js';
import { classifyAdvisorFactualResponse } from '../src/modules/advisor/domain/classify-advisor-factual-response.js';
import { resolveAdvisorDrilldownIntent } from '../src/modules/advisor/domain/resolve-advisor-drilldown-intent.js';
import { CASH_REALIZED_BREAKDOWN_TOOL_NAME } from '../src/modules/advisor/domain/advisor-cash-realized-breakdown.js';
import { CASH_MOVEMENT_LINES_TOOL_NAME } from '../src/modules/advisor/domain/advisor-cash-movement-lines.js';
import {
  ADVISOR_BREAKDOWN_FACT_KIND,
  ADVISOR_MOVEMENT_FACT_KIND,
} from '../src/modules/advisor/domain/advisor-drilldown-fact-contract.js';
import { validateAnalyticalCapability } from '../src/modules/advisor/domain/analytical/index.js';

function breakdownFacts(direction: 'INFLOW' | 'OUTFLOW', categories: unknown[]) {
  return {
    status: categories.length === 0 ? 'EMPTY_RESULT' : 'OK',
    monthKey: '2026-08',
    direction,
    factKind: ADVISOR_BREAKDOWN_FACT_KIND,
    totalRealized: '224790.30',
    requestedLimit: 5,
    returnedCount: categories.length,
    hasMore: false,
    categories,
  };
}

describe('F13.8.5C generic factual composer — breakdown', () => {
  it('fecha FACTUAL_CLOSED para categorias de entrada e não chama provider', () => {
    const facts = breakdownFacts('INFLOW', [
      { label: 'Atendimentos Convênio', amount: '207185.50', sharePercent: '92.17', rank: 1 },
      { label: 'Atendimentos Particulares', amount: '17469.35', sharePercent: '7.77', rank: 2 },
    ]);
    const composed = composeAdvisorFactualAnswer({
      content: 'Quais categorias tiveram as maiores entradas em agosto de 2026?',
      anaphora: 'NONE',
      toolName: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
    expect(composed.meta?.providerCalled).toBe(false);
    expect(composed.answer).toContain('entradas realizadas de caixa');
    expect(composed.answer).toContain('agosto de 2026');
    expect(composed.answer).toContain('Atendimentos Convênio');
    expect(composed.answer).toContain('R$ 207.185,50');
    expect(composed.answer).toContain('92,17%');
    expect(composed.answer).toContain('R$ 224.790,30');
    expect(composed.answer).not.toMatch(/faturamento/i);
    expect(resolveAdvisorDrilldownIntent(
      'Quais categorias tiveram as maiores entradas em agosto de 2026?',
    )?.toolName).toBe(CASH_REALIZED_BREAKDOWN_TOOL_NAME);
  });

  it('fecha OUTFLOW breakdown sem label de entrada', () => {
    const facts = breakdownFacts('OUTFLOW', [
      { label: 'Folha', amount: '1000', sharePercent: '100', rank: 1 },
    ]);
    facts.totalRealized = '1000';
    const composed = composeAdvisorFactualAnswer({
      content: 'Quais categorias tiveram as maiores saídas em agosto de 2026?',
      anaphora: 'NONE',
      toolName: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify(facts),
    });
    expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
    expect(composed.answer).toContain('saídas realizadas de caixa');
    expect(composed.answer).not.toContain('entradas realizadas');
  });

  it('empty breakdown não vira zero', () => {
    const composed = composeAdvisorFactualAnswer({
      content: 'Quais categorias tiveram as maiores entradas em agosto de 2026?',
      anaphora: 'NONE',
      toolName: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify(breakdownFacts('INFLOW', [])),
    });
    expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
    expect(composed.answer).toMatch(/não há categorias/i);
    expect(composed.answer).not.toContain('R$ 0,00');
  });

  it('pergunta interpretativa não fecha breakdown', () => {
    const classification = classifyAdvisorFactualResponse({
      content: 'O que você acha das categorias de entrada de agosto?',
      anaphora: 'NONE',
      toolName: CASH_REALIZED_BREAKDOWN_TOOL_NAME,
      toolOk: true,
      facts: breakdownFacts('INFLOW', [
        { label: 'A', amount: '10', sharePercent: '100', rank: 1 },
      ]),
    });
    expect(classification.kind).toBe('INTERPRETIVE');
  });
});

describe('F13.8.5C generic factual composer — movements', () => {
  it('fecha FACTUAL_CLOSED para janela de movimentos', () => {
    const composed = composeAdvisorFactualAnswer({
      content: 'Quais foram os maiores recebimentos de agosto de 2026?',
      anaphora: 'NONE',
      toolName: CASH_MOVEMENT_LINES_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify({
        status: 'OK',
        monthKey: '2026-08',
        direction: 'INFLOW',
        factKind: ADVISOR_MOVEMENT_FACT_KIND,
        requestedLimit: 2,
        returnedCount: 1,
        hasMore: true,
        lines: [
          {
            date: '2026-08-03',
            amount: '1500.5',
            description: 'Recebimento Unimed',
            partyName: 'Unimed',
            categoryNames: [],
            costCenterNames: [],
          },
        ],
      }),
    });
    expect(composed.classification.kind).toBe('FACTUAL_CLOSED');
    expect(composed.meta?.providerCalled).toBe(false);
    expect(composed.answer).toContain('entradas realizadas de caixa');
    expect(composed.answer).toContain('R$ 1.500,50');
    expect(composed.answer).toContain('Unimed');
    expect(composed.answer).toMatch(/janela limitada/i);
    expect(composed.answer).toMatch(/além deste recorte/i);
  });

  it('empty movements não inventa linhas', () => {
    const composed = composeAdvisorFactualAnswer({
      content: 'Quais foram os maiores pagamentos de agosto de 2026?',
      anaphora: 'NONE',
      toolName: CASH_MOVEMENT_LINES_TOOL_NAME,
      toolOk: true,
      toolContent: JSON.stringify({
        status: 'EMPTY_RESULT',
        monthKey: '2026-08',
        direction: 'OUTFLOW',
        factKind: ADVISOR_MOVEMENT_FACT_KIND,
        requestedLimit: 5,
        returnedCount: 0,
        hasMore: false,
        lines: [],
      }),
    });
    expect(composed.answer).toMatch(/não há movimentações/i);
    expect(composed.answer).toContain('saídas realizadas de caixa');
  });
});

describe('F13.8.5C capabilities unchanged', () => {
  it('continua negando OUTFLOW counterparty year', () => {
    expect(
      validateAnalyticalCapability({
        semanticFamily: 'FLOW',
        metric: 'REALIZED_CASH',
        direction: 'OUTFLOW',
        period: { kind: 'YEAR', year: 2025, rangeKey: '2025', isPartialYear: false },
        dimension: 'COUNTERPARTY',
        operation: 'RANKING_WINNER',
        limit: 1,
        filters: { categoryReference: 'x' },
      }).ok,
    ).toBe(false);
  });
});
