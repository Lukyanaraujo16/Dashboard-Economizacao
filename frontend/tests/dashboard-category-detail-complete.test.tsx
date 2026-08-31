import { describe, expect, it } from 'vitest';

import { CashCategoryRanking } from '../src/components/dashboard/cash-category-ranking';
import { cashCompositionToRankingItems } from '../src/components/dashboard/dashboard-cash-modal-view';
import { presentTopCategoryDonutSlices } from '../src/components/dashboard/category-donut-view';
import type { DashboardCashRealizedCategoryComposition } from '../src/services/dashboard/monthly-cash-flow.types';
import { render, screen } from '@testing-library/react';

function compositionWithNamed(count: number): DashboardCashRealizedCategoryComposition {
  const items = Array.from({ length: count }, (_, index) => ({
    kind: 'category' as const,
    key: `c-${index}`,
    name: `Cat ${index}`,
    amount: String(count - index),
    percentage: '0',
  }));
  const total = items.reduce((sum, item) => sum + Number(item.amount), 0);
  return {
    total: String(total),
    classified: String(total),
    uncategorized: '0',
    imprecise: '0',
    coverageRate: '100',
    items,
  };
}

describe('detalhamento completo por categoria (modal)', () => {
  it('cashCompositionToRankingItems preserva N categorias do DTO', () => {
    const composition = compositionWithNamed(25);
    const ranking = cashCompositionToRankingItems(composition);
    expect(ranking).toHaveLength(25);
    expect(ranking.some((item) => item.name === 'Outras categorias')).toBe(false);
  });

  it('CashCategoryRanking lista todas as categorias sem maxItems default 5', () => {
    const composition = compositionWithNamed(12);
    render(
      <CashCategoryRanking
        composition={composition}
        sectionTitle="Saídas detalhadas"
        colorVar="--color-series-expense"
      />,
    );
    expect(screen.getByText('Cat 0')).toBeTruthy();
    expect(screen.getByText('Cat 11')).toBeTruthy();
    expect(screen.queryByText('Outras')).toBeNull();
    expect(screen.queryByText('Outras categorias')).toBeNull();
  });

  it('Top N visual não muta o array original do DTO', () => {
    const composition = compositionWithNamed(8);
    const before = composition.items.map((item) => item.name);
    presentTopCategoryDonutSlices(composition.items, 5);
    expect(composition.items.map((item) => item.name)).toEqual(before);
    expect(composition.items).toHaveLength(8);
  });
});
