import { IconBarChart3, IconGauge, IconList } from '../ui/icons';
import { Typography } from '../ui';
import type { ExecutiveInsightRow } from './dashboard-executive-insights-view';
import styles from './executive-insights.module.css';

const ICONS = {
  'revenue-expense-total': IconBarChart3,
  'revenue-expense-balance': IconGauge,
  'top-revenue-category': IconBarChart3,
  'top-expense-category': IconBarChart3,
  'expense-classification-gap': IconList,
} as const;

export type ExecutiveInsightsListProps = {
  readonly rows: readonly ExecutiveInsightRow[];
};

export function ExecutiveInsightsList({ rows }: ExecutiveInsightsListProps) {
  return (
    <ul className={styles.list}>
      {rows.map((row) => {
        const Icon = ICONS[row.id as keyof typeof ICONS] ?? IconList;
        return (
          <li key={row.id} className={styles.item} data-insight={row.id}>
            <span className={styles.icon} aria-hidden="true">
              <Icon size={16} />
            </span>
            <Typography as="p" variant="body" className={styles.body}>
              {row.body}
            </Typography>
          </li>
        );
      })}
    </ul>
  );
}
