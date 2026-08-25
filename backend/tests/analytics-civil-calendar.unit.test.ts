import { describe, expect, it } from 'vitest';

import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import {
  addCivilDays,
  civilMonthKey,
  listInclusiveCivilMonthKeys,
  listInclusiveMonthKeysFromKeys,
} from '../src/modules/analytics/domain/civil-calendar.js';

describe('civil calendar', () => {
  it('soma dias civis sem usar 24h em milissegundos', () => {
    const today = new Date('2026-08-19T00:00:00.000Z');
    expect(addCivilDays(today, 0).toISOString()).toBe('2026-08-19T00:00:00.000Z');
    expect(addCivilDays(today, 90).toISOString()).toBe('2026-11-17T00:00:00.000Z');
    expect(addCivilDays(today, 91).toISOString()).toBe('2026-11-18T00:00:00.000Z');
  });

  it('atravessa DST histórico brasileiro no calendário civil', () => {
    const now = new Date('2018-02-17T02:30:00.000Z');
    const today = civilTodayInSaoPaulo(now);
    expect(today.toISOString()).toBe('2018-02-17T00:00:00.000Z');
    expect(addCivilDays(today, 1).toISOString()).toBe('2018-02-18T00:00:00.000Z');
    const plus90 = addCivilDays(today, 90);
    expect(plus90.toISOString().endsWith('T00:00:00.000Z')).toBe(true);
    const millisecondHorizon = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    expect(plus90.toISOString()).not.toBe(millisecondHorizon.toISOString());
  });

  it('lista meses civis inclusivos com virada de ano', () => {
    const from = new Date('2026-12-20T00:00:00.000Z');
    const to = addCivilDays(from, 90);
    expect(to.toISOString()).toBe('2027-03-20T00:00:00.000Z');
    expect(listInclusiveCivilMonthKeys(from, to)).toEqual([
      '2026-12',
      '2027-01',
      '2027-02',
      '2027-03',
    ]);
    expect(civilMonthKey(from)).toBe('2026-12');
    expect(civilMonthKey(to)).toBe('2027-03');
  });

  it('lista YYYY-MM inclusivos a partir de chaves', () => {
    expect(listInclusiveMonthKeysFromKeys('2026-01', '2026-08')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
  });
});
