import { formatMoneyBrl } from '../../lib/format-money-brl';
import { formatCivilDatePtBr } from './dashboard-upcoming-view';
import type { DashboardExpectedPayableDetailItem } from '../../services/dashboard/expected-payable-details.types';
import styles from './expected-payable-details-panel.module.css';

/** Título neutro quando não há fornecedor nem categoria utilizável. */
export const EXPECTED_PAYABLE_TITLE_FALLBACK = 'Pagamento previsto';

/** Frase legado — não deve mais aparecer na UI. */
export const EXPECTED_PAYABLE_SUPPLIER_FALLBACK = 'Sem fornecedor vinculado no Conta Azul';

export const EXPECTED_PAYABLE_DESCRIPTION_FALLBACK = 'Sem descrição';
export const EXPECTED_PAYABLE_CATEGORY_FALLBACK = 'Sem categoria';

export function trimPresent(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

export function normalizeExpectedPayableCategoryNames(
  categoryNames: readonly string[],
): readonly string[] {
  return categoryNames.map((name) => name.trim()).filter((name) => name.length > 0);
}

export function formatExpectedPayableDescription(description: string | null): string {
  return trimPresent(description) ?? EXPECTED_PAYABLE_DESCRIPTION_FALLBACK;
}

export function formatExpectedPayableCategories(categoryNames: readonly string[]): string {
  const normalized = normalizeExpectedPayableCategoryNames(categoryNames);
  if (normalized.length === 0) {
    return EXPECTED_PAYABLE_CATEGORY_FALLBACK;
  }
  return normalized.join(' · ');
}

export type ExpectedPayableTitlePresentation = {
  readonly title: string;
  /** Categoria só abaixo quando o título é o fornecedor. */
  readonly showCategoryBelow: boolean;
  readonly categoryBelow: string | null;
};

/**
 * Título principal: fornecedor → categoria → “Pagamento previsto”.
 * Sem fornecedor + com categoria: não duplica a categoria na linha inferior.
 */
export function resolveExpectedPayableTitlePresentation(
  item: Pick<DashboardExpectedPayableDetailItem, 'supplierName' | 'categoryNames'>,
): ExpectedPayableTitlePresentation {
  const supplier = trimPresent(item.supplierName);
  const categories = normalizeExpectedPayableCategoryNames(item.categoryNames);
  const categoryLabel = categories.length > 0 ? categories.join(' · ') : null;

  if (supplier) {
    return {
      title: supplier,
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
    title: EXPECTED_PAYABLE_TITLE_FALLBACK,
    showCategoryBelow: false,
    categoryBelow: null,
  };
}

type ExpectedPayableDetailsPanelProps = {
  readonly items: readonly DashboardExpectedPayableDetailItem[];
};

export function ExpectedPayableDetailsPanel({ items }: ExpectedPayableDetailsPanelProps) {
  if (items.length === 0) {
    return (
      <p className={styles.empty}>Nenhum pagamento previsto no prazo neste período.</p>
    );
  }

  return (
    <ul className={styles.list} aria-label="Pagamentos previstos">
      {items.map((item) => {
        const presentation = resolveExpectedPayableTitlePresentation(item);
        return (
          <li key={item.id} className={styles.item}>
            <div className={styles.rowPrimary}>
              <span className={styles.supplier}>{presentation.title}</span>
              <span className={styles.amount}>{formatMoneyBrl(item.amount)}</span>
            </div>
            <p className={styles.rowSecondary}>
              {formatCivilDatePtBr(item.dueDate)} ·{' '}
              {formatExpectedPayableDescription(item.description)}
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
