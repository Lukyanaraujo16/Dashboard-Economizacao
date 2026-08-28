import type { DashboardCashRealizedCategoryComposition } from '../../services/dashboard/monthly-cash-flow.types';
import { cashCompositionToRankingItems } from './dashboard-cash-modal-view';
import { CategoryRanking } from './v2/category-ranking';

export type CashCategoryRankingProps = {
  readonly composition: DashboardCashRealizedCategoryComposition | null;
  readonly sectionTitle: string;
  readonly colorVar?: string;
  readonly maxItems?: number;
  readonly emptyMessage?: string;
};

/**
 * Ranking de categorias de caixa realizado — rótulo explícito (não mistura previsto).
 */
export function CashCategoryRanking({
  composition,
  sectionTitle,
  colorVar = '--color-series-revenue',
  maxItems = 5,
  emptyMessage = 'Sem movimentação categorizada neste recorte.',
}: CashCategoryRankingProps) {
  const items = cashCompositionToRankingItems(composition);
  if (items.length === 0) {
    return <p>{emptyMessage}</p>;
  }

  return (
    <div data-cash-category-ranking={sectionTitle}>
      <CategoryRanking
        items={items}
        maxItems={maxItems}
        colorVar={colorVar}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
