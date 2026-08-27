import { formatMoneyBrl } from '../../../lib/format-money-brl';
import { cx } from '../../ui/utils/cx';
import styles from './compact-month-end.module.css';

export type CompactMonthEndSummary = {
  readonly receivable: string;
  readonly payable: string;
  readonly net: string;
};

export type CompactMonthEndProps = {
  readonly summary: CompactMonthEndSummary;
  readonly remainingDays?: number;
  readonly className?: string;
};

function remainingDaysLabel(days: number): string {
  if (days <= 0) {
    return 'Último dia do mês';
  }
  return days === 1 ? 'Falta 1 dia no mês' : `Faltam ${days} dias no mês`;
}

/** Pressão de caixa até o fim do mês em lista compacta — previsto, não saldo. */
export function CompactMonthEnd({ summary, remainingDays, className }: CompactMonthEndProps) {
  return (
    <div className={cx(styles.root, className)}>
      {remainingDays !== undefined ? (
        <p className={styles.horizon}>{remainingDaysLabel(remainingDays)}</p>
      ) : null}

      <dl className={styles.list}>
        <div className={styles.row} data-kind="receivable">
          <dt className={styles.label}>
            <span className={cx(styles.marker, styles.receivableMarker)} aria-hidden="true" />
            {'A receber'}
          </dt>
          <dd className={cx(styles.value, styles.receivableValue)}>
            {formatMoneyBrl(summary.receivable)}
          </dd>
        </div>
        <div className={styles.row} data-kind="payable">
          <dt className={styles.label}>
            <span className={cx(styles.marker, styles.payableMarker)} aria-hidden="true" />
            {'A pagar'}
          </dt>
          <dd className={cx(styles.value, styles.payableValue)}>
            {formatMoneyBrl(summary.payable)}
          </dd>
        </div>
        <div className={cx(styles.row, styles.netRow)} data-kind="net">
          <dt className={styles.label}>
            <span className={cx(styles.marker, styles.netMarker)} aria-hidden="true" />
            Diferença prevista
          </dt>
          <dd className={cx(styles.value, styles.netValue)}>{formatMoneyBrl(summary.net)}</dd>
        </div>
      </dl>

      <p className={styles.caption}>Diferença prevista; não é saldo bancário.</p>
    </div>
  );
}
