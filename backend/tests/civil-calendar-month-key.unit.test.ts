import { describe, expect, it } from 'vitest';

import {
  civilMonthBoundsFromKey,
  isValidMonthKey,
} from '../src/modules/analytics/domain/civil-calendar.js';

describe('civilMonthBoundsFromKey', () => {
  it('aceita YYYY-MM válido', () => {
    const bounds = civilMonthBoundsFromKey('2026-08');
    expect(bounds.monthKey).toBe('2026-08');
    expect(bounds.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(bounds.to.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('virada de ano 2026-12', () => {
    const dec = civilMonthBoundsFromKey('2026-12');
    expect(dec.to.toISOString()).toBe('2026-12-31T00:00:00.000Z');
    const jan = civilMonthBoundsFromKey('2027-01');
    expect(jan.from.toISOString()).toBe('2027-01-01T00:00:00.000Z');
  });

  it('isValidMonthKey rejeita formatos inválidos', () => {
    expect(isValidMonthKey('2026-8')).toBe(false);
    expect(isValidMonthKey('2026-00')).toBe(false);
    expect(isValidMonthKey('2026-13')).toBe(false);
    expect(isValidMonthKey('26-08')).toBe(false);
  });
});
