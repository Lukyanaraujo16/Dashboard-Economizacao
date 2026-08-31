import type { DashboardCashRealizedCategoryComposition } from '../../services/dashboard/monthly-cash-flow.types';
import { cashCompositionToRankingItems } from './dashboard-cash-modal-view';
import { CategoryRanking } from './v2/category-ranking';

export type CashCategoryRankingProps = {
  readonly composition: DashboardCashRealizedCategoryComposition | null;
  readonly sectionTitle: string;
  readonly colorVar?: string;
  /**
   * Limite visual opcional. Omitido = todas as categorias do DTO (detalhamento).
   * Não inventa "Outras"; só fatia a lista já completa da API.
   */
  readonly maxItems?: number;
  readonly emptyMessage?: string;
};

/**
 * Ranking de categorias de caixa realizado — rótulo explícito (não mistura previsto).
 * Por padrão lista o dataset completo do DTO (modal/zoom).
 */
export function CashCategoryRanking({
  composition,
  sectionTitle,
  colorVar = '--color-series-revenue',
  maxItems,
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
        maxItems={maxItems ?? items.length}
        colorVar={colorVar}
        emptyMessage={emptyMessage}
      />
    </div>
  );
}
