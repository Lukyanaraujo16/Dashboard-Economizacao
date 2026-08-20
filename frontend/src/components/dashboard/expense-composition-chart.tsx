import { formatDelinquencyRate, formatMoneyBrl } from '../../lib/format-money-brl';
import type { DashboardExpenseCompositionItem } from '../../services/dashboard/expense-composition.types';
import { Typography } from '../ui';
import { compositionBarWidth } from './dashboard-expense-composition-view';
import styles from './expense-composition.module.css';

export type ExpenseCompositionChartProps = {
  readonly items: readonly DashboardExpenseCompositionItem[];
  readonly coverageRate: string | null;
  readonly universeLabel?: string;
};

export function ExpenseCompositionChart({
  items,
  coverageRate,
  universeLabel = 'do estoque a pagar em aberto',
}: ExpenseCompositionChartProps) {
  return (
    <div>
      {coverageRate !== null ? (
        <Typography as="p" variant="caption" className={styles.coverage}>
          {formatDelinquencyRate(coverageRate)} do estoque em aberto possuem classificação precisa.
        </Typography>
      ) : null}

      <ul className={styles.list}>
        {items.map((item) => {
          const width = compositionBarWidth(item.percentage);
          return (
            <li key={`${item.kind}-${item.name}`} className={styles.row} data-kind={item.kind}>
              <div className={styles.meta}>
                <span className={styles.name}>{item.name}</span>
                <span className={styles.figures}>
                  <span className={styles.amount}>{formatMoneyBrl(item.amount)}</span>
                  <span className={styles.percent}>{formatDelinquencyRate(item.percentage)}</span>
                </span>
              </div>
              <div
                className={styles.track}
                role="img"
                aria-label={`${item.name}: ${formatMoneyBrl(item.amount)}, ${formatDelinquencyRate(item.percentage)} ${universeLabel}`}
              >
                <div className={styles.fill} data-kind={item.kind} style={{ width: `${width}%` }} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
