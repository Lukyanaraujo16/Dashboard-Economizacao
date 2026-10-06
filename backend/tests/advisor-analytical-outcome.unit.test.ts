import { describe, expect, it } from 'vitest';

import {
  answerSourceFromIntent,
  classifyAnalyticalOutcome,
  type AnalyticalTrailFacts,
} from '../src/modules/advisor/domain/classify-analytical-outcome.js';
import { deriveAnalyticalToolTrace } from '../src/modules/advisor/domain/derive-analytical-tool-trace.js';

const emptyFacts = {
  providerFailed: false,
  capabilityDenied: false,
  clarificationRequired: false,
  factualClosed: false,
  factualPartial: false,
  structuredStatus: null,
  traces: [],
} satisfies AnalyticalTrailFacts;

describe('classificação do resultado analítico', () => {
  it('não lê a prosa: o mesmo texto não entra no contrato', () => {
    expect(classifyAnalyticalOutcome(emptyFacts)).toBe('UNSUPPORTED');
    expect(
      classifyAnalyticalOutcome({
        ...emptyFacts,
        traces: [
          {
            status: 'SUCCESS',
            reason: null,
            contentStatus: 'OK',
          },
        ],
      }),
    ).toBe('ANSWERED');
  });

  it('separa sucesso técnico do provedor de pergunta sem capability', () => {
    expect(classifyAnalyticalOutcome(emptyFacts)).toBe('UNSUPPORTED');
  });

  it('fecha fast-path positivo como ANSWERED', () => {
    expect(
      classifyAnalyticalOutcome({
        ...emptyFacts,
        factualClosed: true,
        structuredStatus: 'OK',
      }),
    ).toBe('ANSWERED');
    expect(answerSourceFromIntent('BILLING_MONTH', null)).toBe('BILLING');
    expect(answerSourceFromIntent('BILLING_SERIES', null)).toBe('BILLING_SERIES');
  });

  it('marca ausência estruturada como NO_DATA', () => {
    expect(
      classifyAnalyticalOutcome({
        ...emptyFacts,
        factualClosed: true,
        structuredStatus: 'EMPTY_RESULT',
      }),
    ).toBe('NO_DATA');
  });

  it('marca timeout de tool como TOOL_ERROR', () => {
    expect(
      classifyAnalyticalOutcome({
        ...emptyFacts,
        traces: [{ status: 'UNAVAILABLE', reason: 'TOOL_TIMEOUT' }],
      }),
    ).toBe('TOOL_ERROR');
  });

  it('marca falha do provedor como PROVIDER_ERROR', () => {
    expect(classifyAnalyticalOutcome({ ...emptyFacts, providerFailed: true })).toBe('PROVIDER_ERROR');
  });

  it('pede esclarecimento quando a entidade está ambígua', () => {
    expect(
      classifyAnalyticalOutcome({
        ...emptyFacts,
        clarificationRequired: true,
        factualClosed: true,
      }),
    ).toBe('CLARIFICATION_REQUIRED');
  });

  it('não trata limitação factual sem fato como resposta', () => {
    expect(
      classifyAnalyticalOutcome({
        ...emptyFacts,
        factualClosed: true,
        structuredStatus: 'UNRESOLVED',
      }),
    ).toBe('UNSUPPORTED');
  });
});

describe('rastro estruturado de tool', () => {
  it('deriva SUCCESS sem guardar valor financeiro', () => {
    const trace = deriveAnalyticalToolTrace({
      name: 'cash_cost_center_lookup',
      round: 1,
      durationMs: 42,
      content: JSON.stringify({
        status: 'OK',
        returnedCount: 1,
        total: '999999.99',
      }),
    });
    expect(trace).toMatchObject({
      toolName: 'cash_cost_center_lookup',
      round: 1,
      status: 'SUCCESS',
      durationMs: 42,
      resultCardinality: 1,
      known: true,
      reason: null,
    });
    expect(JSON.stringify(trace)).not.toContain('999999.99');
  });

  it('separa timeout, tool desconhecida e capability negada', () => {
    expect(
      deriveAnalyticalToolTrace({
        name: 'cash_movement_lines',
        round: 1,
        content: JSON.stringify({
          status: 'UNAVAILABLE',
          code: 'ANALYTICAL_TOOL_FAILED',
          message: 'A tool analítica excedeu o tempo limite.',
        }),
      }).reason,
    ).toBe('TOOL_TIMEOUT');
    expect(
      deriveAnalyticalToolTrace({
        name: 'sql_livre',
        round: 1,
        content: JSON.stringify({
          status: 'UNAVAILABLE',
          code: 'ANALYTICAL_TOOL_UNKNOWN',
          message: 'Tool desconhecida.',
        }),
      }),
    ).toMatchObject({ known: false, reason: 'UNKNOWN_TOOL', status: 'UNAVAILABLE' });
    expect(
      deriveAnalyticalToolTrace({
        name: 'compare_cash_months',
        round: 1,
        content: JSON.stringify({
          status: 'UNAVAILABLE',
          code: 'ANALYTICAL_TOOL_INVALID_INPUT',
          message: 'Nenhuma capability publicada para esta combinação (deny by default).',
        }),
      }).reason,
    ).toBe('CAPABILITY_DENIED');
  });

  it('guarda só o nome da entidade não resolvida', () => {
    const trace = deriveAnalyticalToolTrace({
      name: 'cash_cost_center_lookup',
      round: 1,
      arguments: { costCenterQuery: 'clinica life laranjeiras', amount: '10.00' },
      content: JSON.stringify({ status: 'NOT_FOUND' }),
    });
    expect(trace.reason).toBe('ENTITY_NOT_FOUND');
    expect(trace.unresolvedDimension).toBe('COST_CENTER');
    expect(trace.unresolvedEntity).toBe('clinica life laranjeiras');
    expect(JSON.stringify(trace)).not.toContain('10.00');
  });
});
