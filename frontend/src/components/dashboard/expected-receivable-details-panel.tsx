import { formatMoneyBrl } from '../../lib/format-money-brl';
import { formatCivilDatePtBr } from './dashboard-upcoming-view';
import type { DashboardExpectedReceivableDetailItem } from '../../services/dashboard/expected-receivable-details.types';
import type { DashboardReceivableStockDetailItem } from '../../services/dashboard/receivable-stock-details.types';
import { formatInstallmentStockSituation } from './installment-stock-situation';
import styles from './expected-receivable-details-panel.module.css';

export const EXPECTED_RECEIVABLE_CUSTOMER_FALLBACK = 'Sem cliente vinculado no Conta Azul';
export const EXPECTED_RECEIVABLE_DESCRIPTION_FALLBACK = 'Sem descrição';
export const EXPECTED_RECEIVABLE_CATEGORY_FALLBACK = 'Sem categoria';

export function formatExpectedReceivableCustomerName(
  customerName: string | null,
): string {
  const trimmed = customerName?.trim();
  return trimmed ? trimmed : EXPECTED_RECEIVABLE_CUSTOMER_FALLBACK;
}

export function formatExpectedReceivableDescription(description: string | null): string {
  const trimmed = description?.trim();
  return trimmed ? trimmed : EXPECTED_RECEIVABLE_DESCRIPTION_FALLBACK;
}

export function formatExpectedReceivableCategories(categoryNames: readonly string[]): string {
  if (categoryNames.length === 0) {
    return EXPECTED_RECEIVABLE_CATEGORY_FALLBACK;
  }
  return categoryNames.join(' · ');
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
        const stockItem = hasStockSituation(item) ? item : null;
        const situation = stockItem
          ? formatInstallmentStockSituation(stockItem.situation, stockItem.overdueDays)
          : null;
        return (
          <li key={item.id} className={styles.item}>
            <div className={styles.rowPrimary}>
              <span className={styles.customer}>
                {formatExpectedReceivableCustomerName(item.customerName)}
              </span>
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
            <p className={styles.rowTertiary}>
              {formatExpectedReceivableCategories(item.categoryNames)}
            </p>
          </li>
        );
      })}
    </ul>
  );
}
