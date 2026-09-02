import { formatMoneyBrl } from '../../lib/format-money-brl';
import { formatCivilDatePtBr } from './dashboard-upcoming-view';
import type { DashboardExpectedPayableDetailItem } from '../../services/dashboard/expected-payable-details.types';
import styles from './expected-payable-details-panel.module.css';

export const EXPECTED_PAYABLE_SUPPLIER_FALLBACK = 'Sem fornecedor vinculado no Conta Azul';
export const EXPECTED_PAYABLE_DESCRIPTION_FALLBACK = 'Sem descrição';
export const EXPECTED_PAYABLE_CATEGORY_FALLBACK = 'Sem categoria';

export function formatExpectedPayableSupplierName(supplierName: string | null): string {
  const trimmed = supplierName?.trim();
  return trimmed ? trimmed : EXPECTED_PAYABLE_SUPPLIER_FALLBACK;
}

export function formatExpectedPayableDescription(description: string | null): string {
  const trimmed = description?.trim();
  return trimmed ? trimmed : EXPECTED_PAYABLE_DESCRIPTION_FALLBACK;
}

export function formatExpectedPayableCategories(categoryNames: readonly string[]): string {
  if (categoryNames.length === 0) {
    return EXPECTED_PAYABLE_CATEGORY_FALLBACK;
  }
  return categoryNames.join(' · ');
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
      {items.map((item) => (
        <li key={item.id} className={styles.item}>
          <div className={styles.rowPrimary}>
            <span className={styles.supplier}>
              {formatExpectedPayableSupplierName(item.supplierName)}
            </span>
            <span className={styles.amount}>{formatMoneyBrl(item.amount)}</span>
          </div>
          <p className={styles.rowSecondary}>
            {formatCivilDatePtBr(item.dueDate)} · {formatExpectedPayableDescription(item.description)}
          </p>
          <p className={styles.rowTertiary}>
            {formatExpectedPayableCategories(item.categoryNames)}
          </p>
        </li>
      ))}
    </ul>
  );
}
