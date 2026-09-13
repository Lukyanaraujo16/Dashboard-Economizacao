import { describe, expect, it } from 'vitest';

import { resolveFinancialCategoryListVisibility } from '../src/modules/dashboard/domain/resolve-financial-category-list-visibility.js';

describe('resolveFinancialCategoryListVisibility (11-C)', () => {
  const now = new Date('2026-09-13T15:00:00.000Z');

  it('D) Dashboard mês atual → active_only', () => {
    expect(
      resolveFinancialCategoryListVisibility(
        { context: 'dashboard_month', monthKey: '2026-09' },
        now,
      ),
    ).toBe('active_only');
  });

  it('E) Dashboard mês futuro → active_only', () => {
    expect(
      resolveFinancialCategoryListVisibility(
        { context: 'dashboard_month', monthKey: '2026-10' },
        now,
      ),
    ).toBe('active_only');
  });

  it('F) Dashboard mês passado → historical', () => {
    expect(
      resolveFinancialCategoryListVisibility(
        { context: 'dashboard_month', monthKey: '2026-08' },
        now,
      ),
    ).toBe('historical');
  });

  it('G) Reports range sempre historical (mesmo incluindo mês atual)', () => {
    expect(
      resolveFinancialCategoryListVisibility(
        { context: 'reports_range', monthKey: null },
        now,
      ),
    ).toBe('historical');
  });
});
