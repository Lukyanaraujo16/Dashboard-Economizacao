import { describe, expect, it } from 'vitest';

import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';

describe('civilTodayInSaoPaulo', () => {
  it('ainda é o dia anterior em São Paulo quando UTC já virou o dia', () => {
    const now = new Date('2026-08-19T02:30:00.000Z');
    expect(civilTodayInSaoPaulo(now).toISOString()).toBe('2026-08-18T00:00:00.000Z');
  });

  it('usa o dia corrente em São Paulo após a meia-noite local', () => {
    const now = new Date('2026-08-19T03:00:00.000Z');
    expect(civilTodayInSaoPaulo(now).toISOString()).toBe('2026-08-19T00:00:00.000Z');
  });

  it('respeita virada de mês em America/Sao_Paulo', () => {
    const before = new Date('2026-09-01T02:30:00.000Z');
    const after = new Date('2026-09-01T03:00:00.000Z');
    expect(civilTodayInSaoPaulo(before).toISOString()).toBe('2026-08-31T00:00:00.000Z');
    expect(civilTodayInSaoPaulo(after).toISOString()).toBe('2026-09-01T00:00:00.000Z');
  });

  it('respeita virada de ano em America/Sao_Paulo', () => {
    const before = new Date('2027-01-01T02:30:00.000Z');
    const after = new Date('2027-01-01T03:00:00.000Z');
    expect(civilTodayInSaoPaulo(before).toISOString()).toBe('2026-12-31T00:00:00.000Z');
    expect(civilTodayInSaoPaulo(after).toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('usa IANA America/Sao_Paulo em período histórico de horário de verão', () => {
    const stillPreviousDay = new Date('2018-02-17T01:59:59.000Z');
    expect(civilTodayInSaoPaulo(stillPreviousDay).toISOString()).toBe('2018-02-16T00:00:00.000Z');
    const afterLocalMidnight = new Date('2018-02-17T02:00:00.000Z');
    expect(civilTodayInSaoPaulo(afterLocalMidnight).toISOString()).toBe('2018-02-17T00:00:00.000Z');
    const wouldBePreviousDayIfHardcodedMinus03 = new Date('2018-02-17T02:30:00.000Z');
    expect(civilTodayInSaoPaulo(wouldBePreviousDayIfHardcodedMinus03).toISOString()).toBe(
      '2018-02-17T00:00:00.000Z',
    );
  });
});
