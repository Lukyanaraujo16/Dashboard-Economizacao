import { describe, expect, it } from 'vitest';

import { resolveAdvisorConversationalPeriod } from '../src/modules/advisor/domain/resolve-advisor-conversational-period.js';

const SEPTEMBER_2026 = new Date('2026-09-24T18:00:00.000Z');

describe('resolveAdvisorConversationalPeriod (F13.8.1C)', () => {
  it('período explícito da pergunta atual vence o contexto da conversa', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E em julho de 2026?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: ['Como está meu faturamento em agosto de 2026?'],
      }),
    ).toEqual({
      monthKey: '2026-07',
      source: 'EXPLICIT',
      comparison: false,
    });
  });

  it('contexto da conversa vence o mês selecionado do Dashboard', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E quanto faltou para atingir nossa meta?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: ['Como está meu faturamento em agosto de 2026?'],
      }),
    ).toEqual({
      monthKey: '2026-08',
      source: 'CONVERSATION_CONTEXT',
      comparison: false,
    });
  });

  it('sem histórico preserva selected e depois o mês civil', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'Como está meu faturamento?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: [],
      }),
    ).toEqual({
      monthKey: '2026-09',
      source: 'SELECTED',
      comparison: false,
    });
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'Como está meu faturamento?',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({
      monthKey: '2026-09',
      source: 'CURRENT',
      comparison: false,
    });
  });

  it('follow-up após agosto mantém agosto', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E as despesas?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: ['Como foi agosto de 2026?'],
      }).monthKey,
    ).toBe('2026-08');
  });

  it('E em julho troca para julho e o follow-up seguinte herda julho', () => {
    const afterJuly = resolveAdvisorConversationalPeriod({
      content: 'E em julho?',
      referenceMonthKey: '2026-09',
      now: SEPTEMBER_2026,
      priorUserContents: ['Como foi agosto de 2026?'],
    });
    expect(afterJuly).toEqual({
      monthKey: '2026-07',
      source: 'EXPLICIT',
      comparison: false,
    });
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E as despesas?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: ['Como foi agosto de 2026?', 'E em julho?'],
      }),
    ).toEqual({
      monthKey: '2026-07',
      source: 'CONVERSATION_CONTEXT',
      comparison: false,
    });
  });

  it('nova conversa sem USER anterior não herda período', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'Como está meu faturamento?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: [],
      }).source,
    ).toBe('SELECTED');
  });

  it('reconstrói o contexto só com mensagens USER persistidas', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E quanto faltou para a meta?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: [
          'Como está meu faturamento em agosto de 2026?',
          'Pode detalhar o faturamento?',
        ],
      }),
    ).toMatchObject({
      monthKey: '2026-08',
      source: 'CONVERSATION_CONTEXT',
    });
  });

  it('não usa texto CONSULTANT mesmo se for passado por engano', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E as despesas?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: [],
      }).monthKey,
    ).toBe('2026-09');
  });

  it('mês passado na pergunta atual continua RELATIVE da F13.6.1', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'como foi o mês passado?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: ['Como foi julho de 2026?'],
      }),
    ).toEqual({
      monthKey: '2026-08',
      source: 'RELATIVE',
      comparison: false,
    });
  });

  it('dois meses explícitos sem intenção comparativa preservam o fallback seguro', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'como foi agosto de 2026 e setembro de 2026',
        referenceMonthKey: '2026-07',
        now: SEPTEMBER_2026,
        priorUserContents: ['Como foi junho de 2026?'],
      }),
    ).toEqual({
      monthKey: '2026-07',
      source: 'SELECTED',
      comparison: false,
    });
  });

  it('dois meses explícitos com compare usam o par oficial, não o Dashboard', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'compare agosto de 2026 e setembro de 2026',
        referenceMonthKey: '2026-07',
        now: SEPTEMBER_2026,
        priorUserContents: ['Como foi junho de 2026?'],
      }),
    ).toEqual({
      monthKey: '2026-09',
      source: 'EXPLICIT',
      comparison: true,
      comparisonMonthKey: '2026-08',
    });
  });

  it('comparando esses dois meses reconstrói julho e agosto, não setembro', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'qual foi a diferença de faturamento comparando esses dois meses?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: [
          'Como está meu faturamento em agosto de 2026?',
          'E em julho?',
        ],
      }),
    ).toEqual({
      monthKey: '2026-08',
      source: 'CONVERSATION_CONTEXT',
      comparison: true,
      comparisonMonthKey: '2026-07',
    });
  });

  it('dashboard SET + conversa AGO + follow-up sem mês = AGO', () => {
    const resolved = resolveAdvisorConversationalPeriod({
      content: 'E quanto faltou para atingir nossa meta?',
      referenceMonthKey: '2026-09',
      now: SEPTEMBER_2026,
      priorUserContents: ['Como está meu faturamento em agosto de 2026?'],
    });
    expect(resolved.monthKey).toBe('2026-08');
    expect(resolved.source).toBe('CONVERSATION_CONTEXT');
  });

  it('mudança do Dashboard não reescreve follow-up após agosto explícito', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E quanto faltou para a meta?',
        referenceMonthKey: '2026-10',
        now: SEPTEMBER_2026,
        priorUserContents: ['Como está meu faturamento em agosto de 2026?'],
      }).monthKey,
    ).toBe('2026-08');
  });

  it('RELATIVE em mensagem anterior não é herdado', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E as despesas?',
        referenceMonthKey: '2026-10',
        now: SEPTEMBER_2026,
        priorUserContents: ['como foi o mês passado?'],
      }),
    ).toEqual({
      monthKey: '2026-10',
      source: 'SELECTED',
      comparison: false,
    });
  });

  it('comparação explícita não reduz a pergunta ao mês citado', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E comparado com julho?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
        priorUserContents: ['Como foi agosto de 2026?'],
      }),
    ).toEqual({
      monthKey: '2026-08',
      source: 'CONVERSATION_CONTEXT',
      comparison: true,
      comparisonMonthKey: '2026-07',
    });
  });

  it('ano compartilhado forma o par comparativo e não inventa comparison sem cue', () => {
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'Compare julho e agosto de 2026.',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({
      monthKey: '2026-08',
      source: 'EXPLICIT',
      comparison: true,
      comparisonMonthKey: '2026-07',
    });
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'Compare julho de 2026 com agosto de 2026.',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({
      monthKey: '2026-08',
      source: 'EXPLICIT',
      comparison: true,
      comparisonMonthKey: '2026-07',
    });
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'Compare agosto de 2026 com julho de 2026.',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({
      monthKey: '2026-08',
      source: 'EXPLICIT',
      comparison: true,
      comparisonMonthKey: '2026-07',
    });
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'Compare dezembro de 2025 e janeiro de 2026.',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({
      monthKey: '2026-01',
      source: 'EXPLICIT',
      comparison: true,
      comparisonMonthKey: '2025-12',
    });
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'julho e agosto de 2026',
        now: SEPTEMBER_2026,
      }),
    ).toMatchObject({
      monthKey: '2026-08',
      comparison: false,
    });
    expect(
      resolveAdvisorConversationalPeriod({
        content: 'E qual mês teve maior faturamento?',
        now: SEPTEMBER_2026,
        priorUserContents: ['Compare julho e agosto de 2026.'],
      }),
    ).toEqual({
      monthKey: '2026-08',
      source: 'CONVERSATION_CONTEXT',
      comparison: true,
      comparisonMonthKey: '2026-07',
    });
  });
});
