import { describe, expect, it } from 'vitest';

import { parseDashboardMonth } from '../src/modules/dashboard/http/parse-dashboard-month.js';

describe('parseDashboardMonth', () => {
  it('ausente retorna null', () => {
    expect(parseDashboardMonth({})).toBeNull();
    expect(parseDashboardMonth(undefined)).toBeNull();
  });

  it('aceita 2026-08', () => {
    expect(parseDashboardMonth({ month: '2026-08' })).toBe('2026-08');
  });

  it('rejeita formato inválido', () => {
    expect(() => parseDashboardMonth({ month: '2026-8' })).toThrow(/YYYY-MM/);
    expect(() => parseDashboardMonth({ month: '2026-13' })).toThrow(/YYYY-MM/);
    expect(() => parseDashboardMonth({ month: 202608 })).toThrow(/YYYY-MM/);
  });
});
