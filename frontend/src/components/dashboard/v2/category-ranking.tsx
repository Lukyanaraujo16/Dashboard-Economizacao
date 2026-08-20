import type { CSSProperties } from 'react';

import { formatDelinquencyRate, formatMoneyBrl } from '../../../lib/format-money-brl';
import { cx } from '../../ui/utils/cx';
import { maxAbs, parseAmount } from './chart-math';
import styles from './category-ranking.module.css';

export type CategoryRankingItem = {
  readonly name: string;
  readonly amount: string;
  readonly percentage: string;
};

export type CategoryRankingProps = {
  readonly items: readonly CategoryRankingItem[];
  readonly maxItems?: number;
  /** Nome da variável CSS da série (ex.: `--color-series-revenue`). */
  readonly colorVar?: string;
  readonly emptyMessage?: string;
  readonly className?: string;
};

function barPercent(amount: string, scale: number): number {
  if (scale <= 0) {
    return 0;
  }
  const ratio = (Math.abs(parseAmount(amount)) / scale) * 100;
  return Math.min(100, Math.max(0, ratio));
}

/** Ranking horizontal das maiores categorias na competência do mês. */
export function CategoryRanking({
  items,
  maxItems = 5,
  colorVar = '--color-series-expense',
  emptyMessage = 'Nenhuma categoria na competência do mês.',
  className,
}: CategoryRankingProps) {
  const visible = items.slice(0, maxItems);
  const scale = maxAbs(visible.map((item) => parseAmount(item.amount)));
  const style = { '--ranking-color': `var(${colorVar})` } as CSSProperties;

  if (visible.length === 0) {
    return <p className={cx(styles.empty, className)}>{emptyMessage}</p>;
  }

  return (
    <ol className={cx(styles.list, className)} style={style}>
      {visible.map((item, index) => (
        <li key={`${item.name}-${index}`} className={styles.item}>
          <span className={styles.rank} aria-hidden="true">
            {index + 1}
          </span>
          <div className={styles.content}>
            <div className={styles.labelRow}>
              <span className={styles.name}>{item.name}</span>
              <span className={styles.value}>{formatMoneyBrl(item.amount)}</span>
            </div>
            <div className={styles.track}>
              <div
                className={styles.bar}
                style={{ width: `${barPercent(item.amount, scale)}%` }}
                aria-hidden="true"
              />
            </div>
          </div>
          <span className={styles.percentage}>{formatDelinquencyRate(item.percentage)}</span>
        </li>
      ))}
    </ol>
  );
}
