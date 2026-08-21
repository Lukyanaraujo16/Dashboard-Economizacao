import { describe, expect, it } from 'vitest';

import {
  buildDashboardCostCenterSearchParams,
  isValidDashboardCostCenterId,
  parseDashboardCostCenterFromSearchParams,
  resolveSelectedDashboardCostCenterId,
} from '../src/lib/dashboard-cost-center';
import { buildDashboardMonthSearchParams } from '../src/lib/dashboard-month';

const CENTER_A = '11111111-1111-4111-8111-111111111111';
const CENTER_B = '22222222-2222-4222-8222-222222222222';

describe('dashboard-cost-center', () => {
  it('valida UUID de centro de custo', () => {
    expect(isValidDashboardCostCenterId(CENTER_A)).toBe(true);
    expect(isValidDashboardCostCenterId('not-a-uuid')).toBe(false);
    expect(isValidDashboardCostCenterId('11111111-1111-1111-1111-111111111111')).toBe(false);
  });

  it('parse/resolve omite ausente e inválido', () => {
    expect(parseDashboardCostCenterFromSearchParams(new URLSearchParams())).toBeNull();
    expect(
      parseDashboardCostCenterFromSearchParams(new URLSearchParams(`costCenter=${CENTER_A}`)),
    ).toBe(CENTER_A);
    expect(
      resolveSelectedDashboardCostCenterId(new URLSearchParams('costCenter=bad')),
    ).toBeNull();
  });

  it('build omite Todos e preserva month', () => {
    const withMonth = new URLSearchParams('month=2026-07');
    const selected = buildDashboardCostCenterSearchParams(withMonth, CENTER_A);
    expect(selected.get('month')).toBe('2026-07');
    expect(selected.get('costCenter')).toBe(CENTER_A);

    const cleared = buildDashboardCostCenterSearchParams(selected, null);
    expect(cleared.get('month')).toBe('2026-07');
    expect(cleared.get('costCenter')).toBeNull();
  });

  it('troca de mês preserva costCenter e troca de centro preserva month', () => {
    const both = new URLSearchParams(`month=2026-07&costCenter=${CENTER_A}`);
    const nextMonth = buildDashboardMonthSearchParams(both, '2026-06', '2026-08');
    expect(nextMonth.get('month')).toBe('2026-06');
    expect(nextMonth.get('costCenter')).toBe(CENTER_A);

    const nextCenter = buildDashboardCostCenterSearchParams(both, CENTER_B);
    expect(nextCenter.get('month')).toBe('2026-07');
    expect(nextCenter.get('costCenter')).toBe(CENTER_B);
  });
});
