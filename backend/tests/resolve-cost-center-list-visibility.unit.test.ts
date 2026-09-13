import { describe, expect, it } from 'vitest';

import { resolveCostCenterListVisibility } from '../src/modules/dashboard/domain/resolve-cost-center-list-visibility.js';

describe('resolveCostCenterListVisibility (11-A.1)', () => {
  const now = new Date('2026-09-13T15:00:00.000Z'); // SP ainda 2026-09-13

  it('Dashboard mês passado → historical', () => {
    expect(
      resolveCostCenterListVisibility(
        { context: 'dashboard_month', monthKey: '2026-08' },
        now,
      ),
    ).toBe('historical');
  });

  it('Dashboard mês atual → active_only', () => {
    expect(
      resolveCostCenterListVisibility(
        { context: 'dashboard_month', monthKey: '2026-09' },
        now,
      ),
    ).toBe('active_only');
  });

  it('Dashboard mês futuro → active_only', () => {
    expect(
      resolveCostCenterListVisibility(
        { context: 'dashboard_month', monthKey: '2026-10' },
        now,
      ),
    ).toBe('active_only');
  });

  it('Reports range sempre historical (mesmo incluindo mês atual)', () => {
    expect(
      resolveCostCenterListVisibility(
        { context: 'reports_range', monthKey: null },
        now,
      ),
    ).toBe('historical');
  });
});
