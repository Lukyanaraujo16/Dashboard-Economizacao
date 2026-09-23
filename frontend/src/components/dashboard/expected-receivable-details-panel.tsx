import { formatMoneyBrl } from '../../lib/format-money-brl';
import { formatCivilDatePtBr } from './dashboard-upcoming-view';
import type { DashboardExpectedReceivableDetailItem } from '../../services/dashboard/expected-receivable-details.types';
import type { DashboardReceivableStockDetailItem } from '../../services/dashboard/receivable-stock-details.types';
import { formatInstallmentStockSituation } from './installment-stock-situation';
import styles from './expected-receivable-details-panel.module.css';

/** Título neutro quando não há cliente nem categoria utilizável. */
export const EXPECTED_RECEIVABLE_TITLE_FALLBACK = 'Recebimento previsto';

export const EXPECTED_RECEIVABLE_DESCRIPTION_FALLBACK = 'Sem descrição';
export const EXPECTED_RECEIVABLE_CATEGORY_FALLBACK = 'Sem categoria';

export function trimPresent(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeExpectedReceivableCategoryNames(
  categoryNames: readonly string[] | null | undefined,
): readonly string[] {
  if (!categoryNames) {
    return [];
  }
  return categoryNames.map((name) => name.trim()).filter((name) => name.length > 0);
}

export function formatExpectedReceivableDescription(description: string | null): string {
  return trimPresent(description) ?? EXPECTED_RECEIVABLE_DESCRIPTION_FALLBACK;
}

export function formatExpectedReceivableCategories(
  categoryNames: readonly string[] | null | undefined,
): string {
  const normalized = normalizeExpectedReceivableCategoryNames(categoryNames);
  if (normalized.length === 0) {
    return EXPECTED_RECEIVABLE_CATEGORY_FALLBACK;
  }
  return normalized.join(' · ');
}

export type ExpectedReceivableTitlePresentation = {
  readonly title: string;
  /** Categoria só abaixo quando o título é o cliente. */
  readonly showCategoryBelow: boolean;
  readonly categoryBelow: string | null;
};

/**
 * Título principal: cliente → categoria → “Recebimento previsto”.
 * Sem cliente + com categoria: não duplica a categoria na linha inferior.
 */
export function resolveExpectedReceivableTitlePresentation(
  item: Pick<DashboardExpectedReceivableDetailItem, 'customerName' | 'categoryNames'>,
): ExpectedReceivableTitlePresentation {
  const customer = trimPresent(item.customerName);
  const categories = normalizeExpectedReceivableCategoryNames(item.categoryNames);
  const categoryLabel = categories.length > 0 ? categories.join(' · ') : null;

  if (customer) {
    return {
      title: customer,
      showCategoryBelow: categoryLabel !== null,
      categoryBelow: categoryLabel,
    };
  }

  if (categoryLabel) {
    return {
      title: categoryLabel,
      showCategoryBelow: false,
      categoryBelow: null,
    };
  }

  return {
    title: EXPECTED_RECEIVABLE_TITLE_FALLBACK,
    showCategoryBelow: false,
    categoryBelow: null,
  };
}

type ReceivableDetailsItem =
  | DashboardExpectedReceivableDetailItem
  | DashboardReceivableStockDetailItem;

type ExpectedReceivableDetailsPanelProps = {
  readonly items: readonly ReceivableDetailsItem[];
  readonly emptyMessage?: string;
  readonly ariaLabel?: string;
};

function hasStockSituation(
  item: ReceivableDetailsItem,
): item is DashboardReceivableStockDetailItem {
  return 'situation' in item;
}

export function ExpectedReceivableDetailsPanel({
  items,
  emptyMessage = 'Nenhum recebimento previsto no prazo neste período.',
  ariaLabel = 'Recebimentos previstos',
}: ExpectedReceivableDetailsPanelProps) {
  if (items.length === 0) {
    return <p className={styles.empty}>{emptyMessage}</p>;
  }

  return (
    <ul className={styles.list} aria-label={ariaLabel}>
      {items.map((item) => {
        const presentation = resolveExpectedReceivableTitlePresentation(item);
        const stockItem = hasStockSituation(item) ? item : null;
        const situation = stockItem
          ? formatInstallmentStockSituation(stockItem.situation, stockItem.overdueDays)
          : null;
        return (
          <li key={item.id} className={styles.item}>
            <div className={styles.rowPrimary}>
              <span className={styles.customer}>{presentation.title}</span>
              <span className={styles.amount}>{formatMoneyBrl(item.amount)}</span>
            </div>
            <p className={styles.rowSecondary}>
              {situation ? (
                <span
                  className={
                    stockItem?.situation === 'OVERDUE' ? styles.situationOverdue : styles.situation
                  }
                >
                  {situation}
                </span>
              ) : null}
              {situation ? ' · ' : null}
              {formatCivilDatePtBr(item.dueDate)} · {formatExpectedReceivableDescription(item.description)}
            </p>
            {presentation.showCategoryBelow && presentation.categoryBelow ? (
              <p className={styles.rowTertiary}>{presentation.categoryBelow}</p>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}
