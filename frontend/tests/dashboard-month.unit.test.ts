import { describe, expect, it } from 'vitest';

import {
  buildDashboardMonthSearchParams,
  compareMonthKeys,
  currentDashboardMonthKey,
  dashboardMonthPhase,
  isValidDashboardMonthKey,
  listInclusiveDashboardMonthKeys,
  resolveSelectedDashboardMonthKey,
  shiftDashboardMonthKey,
} from '../src/lib/dashboard-month';

describe('dashboard-month', () => {
  it('valida monthKey YYYY-MM', () => {
    expect(isValidDashboardMonthKey('2026-08')).toBe(true);
    expect(isValidDashboardMonthKey('2026-8')).toBe(false);
  });

  it('resolveSelectedDashboardMonthKey usa URL ou fallback', () => {
    const params = new URLSearchParams('month=2026-07');
    expect(resolveSelectedDashboardMonthKey(params, '2026-08')).toBe('2026-07');
    expect(resolveSelectedDashboardMonthKey(new URLSearchParams(), '2026-08')).toBe('2026-08');
    expect(resolveSelectedDashboardMonthKey(new URLSearchParams('month=bad'), '2026-08')).toBe(
      '2026-08',
    );
  });

  it('classifica passado, atual e futuro', () => {
    expect(dashboardMonthPhase('2026-07', '2026-08')).toBe('past');
    expect(dashboardMonthPhase('2026-08', '2026-08')).toBe('current');
    expect(dashboardMonthPhase('2026-09', '2026-08')).toBe('future');
  });

  it('shiftDashboardMonthKey atravessa virada de ano', () => {
    expect(shiftDashboardMonthKey('2026-12', 1)).toBe('2027-01');
    expect(shiftDashboardMonthKey('2027-01', -1)).toBe('2026-12');
  });

  it('lista meses inclusivos até o teto de 24', () => {
    expect(listInclusiveDashboardMonthKeys('2026-01', '2026-08')).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
      '2026-07',
      '2026-08',
    ]);
    expect(listInclusiveDashboardMonthKeys('2026-08', '2026-01')).toEqual([]);
    expect(listInclusiveDashboardMonthKeys('2025-01', '2026-12')).toHaveLength(24);
  });

  it('buildDashboardMonthSearchParams omite mês corrente', () => {
    const params = new URLSearchParams('month=2026-07');
    const next = buildDashboardMonthSearchParams(params, '2026-08', '2026-08');
    expect(next.get('month')).toBeNull();
    const keep = buildDashboardMonthSearchParams(new URLSearchParams(), '2026-07', '2026-08');
    expect(keep.get('month')).toBe('2026-07');
  });

  it('buildDashboardMonthSearchParams preserva costCenter', () => {
    const params = new URLSearchParams(
      'costCenter=11111111-1111-4111-8111-111111111111&month=2026-07',
    );
    const next = buildDashboardMonthSearchParams(params, '2026-06', '2026-08');
    expect(next.get('month')).toBe('2026-06');
    expect(next.get('costCenter')).toBe('11111111-1111-4111-8111-111111111111');
  });

  it('compareMonthKeys ordena cronologicamente', () => {
    expect(compareMonthKeys('2026-07', '2026-08')).toBeLessThan(0);
    expect(currentDashboardMonthKey(new Date('2026-08-19T15:00:00Z'))).toMatch(/^\d{4}-\d{2}$/);
  });
});
