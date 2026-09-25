import { describe, expect, it } from 'vitest';

import {
  countAdvisorNamedPeriods,
  resolveAdvisorPeriod,
} from '../src/modules/advisor/domain/resolve-advisor-period.js';

const SEPTEMBER_2026 = new Date('2026-09-24T18:00:00.000Z');

describe('resolveAdvisorPeriod (F13.6.1)', () => {
  it('resolve agosto de 2026 em variantes explícitas', () => {
    const now = SEPTEMBER_2026;
    const cases = [
      'Qual foi meu faturamento em agosto de 2026?',
      'Agosto de 2026',
      'faturamento ago/2026',
      'faturamento 08/2026',
      'faturamento 2026-08',
    ];
    for (const content of cases) {
      expect(resolveAdvisorPeriod({ content, referenceMonthKey: '2026-09', now })).toEqual({
        monthKey: '2026-08',
        source: 'EXPLICIT',
      });
    }
  });

  it('resolve janeiro de 2027 e dezembro de 2025', () => {
    expect(
      resolveAdvisorPeriod({
        content: 'janeiro de 2027',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2027-01', source: 'EXPLICIT' });
    expect(
      resolveAdvisorPeriod({
        content: 'dezembro de 2025',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2025-12', source: 'EXPLICIT' });
  });

  it('mês passado usa a referência civil e cruza o ano', () => {
    expect(
      resolveAdvisorPeriod({
        content: 'como foi o mês passado?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-08', source: 'RELATIVE' });
    expect(
      resolveAdvisorPeriod({
        content: 'mês anterior',
        referenceMonthKey: '2027-01',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-12', source: 'RELATIVE' });
  });

  it('este mês usa o mês selecionado quando disponível', () => {
    expect(
      resolveAdvisorPeriod({
        content: 'como está este mês?',
        referenceMonthKey: '2026-08',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-08', source: 'SELECTED' });
    expect(
      resolveAdvisorPeriod({
        content: 'mês atual',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-09', source: 'CURRENT' });
  });

  it('sem período usa selected e depois o mês civil SP', () => {
    expect(
      resolveAdvisorPeriod({
        content: 'Qual foi meu faturamento?',
        referenceMonthKey: '2026-08',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-08', source: 'SELECTED' });
    expect(
      resolveAdvisorPeriod({
        content: 'Qual foi meu faturamento?',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-09', source: 'CURRENT' });
  });

  it('regression smoke: agosto/2026 vence selected setembro/2026', () => {
    expect(
      resolveAdvisorPeriod({
        content: 'Qual foi meu faturamento em agosto de 2026?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-08', source: 'EXPLICIT' });
  });

  it('mês sem ano usa o ano da referência ou o ano civil SP', () => {
    expect(
      resolveAdvisorPeriod({
        content: 'quanto faturei em agosto?',
        referenceMonthKey: '2026-09',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-08', source: 'EXPLICIT' });
    expect(
      resolveAdvisorPeriod({
        content: 'quanto faturei em agosto?',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-08', source: 'EXPLICIT' });
  });

  it('dois meses explícitos distintos não inventa e cai no default', () => {
    expect(
      resolveAdvisorPeriod({
        content: 'compare agosto de 2026 e setembro de 2026',
        referenceMonthKey: '2026-07',
        now: SEPTEMBER_2026,
      }),
    ).toEqual({ monthKey: '2026-07', source: 'SELECTED' });
    expect(countAdvisorNamedPeriods('compare agosto de 2026 e setembro de 2026')).toBe(2);
    expect(countAdvisorNamedPeriods('Como está meu faturamento em agosto de 2026?')).toBe(1);
    expect(countAdvisorNamedPeriods('E quanto faltou para a meta?')).toBe(0);
  });
});
