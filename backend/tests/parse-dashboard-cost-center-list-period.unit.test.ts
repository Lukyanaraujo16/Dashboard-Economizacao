import { describe, expect, it } from 'vitest';

import { parseDashboardCostCenterListPeriod } from '../src/modules/dashboard/http/parse-dashboard-cost-center-list-period.js';
import { ValidationError } from '../src/shared/errors/application-error.js';

describe('parseDashboardCostCenterListPeriod', () => {
  it('aceita month=YYYY-MM', () => {
    const period = parseDashboardCostCenterListPeriod({ month: '2026-08' });
    expect(period.monthKey).toBe('2026-08');
    expect(period.from.toISOString()).toBe('2026-08-01T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-08-31T00:00:00.000Z');
  });

  it('aceita from/to inclusivos', () => {
    const period = parseDashboardCostCenterListPeriod({ from: '2026-07', to: '2026-09' });
    expect(period.monthKey).toBeNull();
    expect(period.fromKey).toBe('2026-07');
    expect(period.toKey).toBe('2026-09');
    expect(period.from.toISOString()).toBe('2026-07-01T00:00:00.000Z');
    expect(period.to.toISOString()).toBe('2026-09-30T00:00:00.000Z');
  });

  it('rejeita month misturado com from/to', () => {
    expect(() => parseDashboardCostCenterListPeriod({ month: '2026-08', from: '2026-07' })).toThrow(
      ValidationError,
    );
  });
});
