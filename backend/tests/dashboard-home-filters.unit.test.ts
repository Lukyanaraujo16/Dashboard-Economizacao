import { Prisma } from '../src/generated/prisma/client.js';
import { describe, expect, it } from 'vitest';

import { civilTodayInSaoPaulo } from '../src/modules/analytics/domain/analytical-timezone.js';
import { addCivilDays } from '../src/modules/analytics/domain/civil-calendar.js';
import {
  applyDashboardHomeFilters,
  isDashboardOverdue,
  matchesDashboardCategoryFilter,
  matchesDashboardSituation,
  matchesPreciseNamedCategory,
} from '../src/modules/analytics/domain/dashboard-home-filters.js';
import type { DashboardHomeFilterable } from '../src/modules/analytics/domain/dashboard-home-filters.js';

function row(input: {
  readonly status: DashboardHomeFilterable['status'];
  readonly unpaid?: string;
  readonly dueDate?: Date;
  readonly categoryExternalIds?: readonly string[];
}): DashboardHomeFilterable {
  const today = civilTodayInSaoPaulo(new Date());
  return {
    status: input.status,
    unpaid: new Prisma.Decimal(input.unpaid ?? '10'),
    dueDate: input.dueDate ?? today,
    categoryExternalIds: [...(input.categoryExternalIds ?? [])],
  };
}

describe('dashboard-home-filters', () => {
  const today = civilTodayInSaoPaulo(new Date());

  it('settled inclui PAID e exclui PARTIALLY_PAID', () => {
    expect(matchesDashboardSituation(row({ status: 'PAID', unpaid: '0' }), 'settled', today)).toBe(
      true,
    );
    expect(
      matchesDashboardSituation(row({ status: 'PARTIALLY_PAID', unpaid: '4' }), 'settled', today),
    ).toBe(false);
  });

  it('open inclui OPEN, OVERDUE e PARTIALLY_PAID; exclui PAID', () => {
    expect(matchesDashboardSituation(row({ status: 'OPEN' }), 'open', today)).toBe(true);
    expect(matchesDashboardSituation(row({ status: 'OVERDUE' }), 'open', today)).toBe(true);
    expect(matchesDashboardSituation(row({ status: 'PARTIALLY_PAID' }), 'open', today)).toBe(true);
    expect(matchesDashboardSituation(row({ status: 'PAID', unpaid: '0' }), 'open', today)).toBe(
      false,
    );
  });

  it('overdue segue D1, não o status persistido', () => {
    const yesterday = addCivilDays(today, -1);
    const tomorrow = addCivilDays(today, 1);
    expect(
      isDashboardOverdue(row({ status: 'OPEN', unpaid: '10', dueDate: yesterday }), today),
    ).toBe(true);
    expect(
      isDashboardOverdue(row({ status: 'OVERDUE', unpaid: '10', dueDate: tomorrow }), today),
    ).toBe(false);
    expect(isDashboardOverdue(row({ status: 'OPEN', unpaid: '10', dueDate: today }), today)).toBe(
      false,
    );
    expect(
      isDashboardOverdue(row({ status: 'OPEN', unpaid: '0', dueDate: yesterday }), today),
    ).toBe(false);
  });

  it('categoria nomeada exige match preciso D8', () => {
    expect(matchesPreciseNamedCategory(['serv'], 'serv')).toBe(true);
    expect(matchesPreciseNamedCategory(['serv', 'outro'], 'serv')).toBe(false);
    expect(matchesPreciseNamedCategory([], 'serv')).toBe(false);
    expect(matchesPreciseNamedCategory(['filho'], 'pai')).toBe(false);
  });

  it('REVENUE não casa no lado EXPENSE; UNKNOWN não é preciso', () => {
    const installment = row({ status: 'OPEN', categoryExternalIds: ['x'] });
    expect(
      matchesDashboardCategoryFilter(installment, { externalId: 'x', type: 'REVENUE' }, 'EXPENSE'),
    ).toBe(false);
    expect(
      matchesDashboardCategoryFilter(installment, { externalId: 'x', type: 'UNKNOWN' }, 'REVENUE'),
    ).toBe(false);
  });

  it('ausência de filtros preserva o conjunto', () => {
    const rows = [row({ status: 'PAID', unpaid: '0' }), row({ status: 'OPEN' })];
    expect(
      applyDashboardHomeFilters(rows, {
        situation: null,
        categoryFilter: null,
        expectedType: 'REVENUE',
        today,
      }),
    ).toHaveLength(2);
  });
});
