import type { ReactNode } from 'react';

import { Typography } from '../ui';
import { cx } from '../ui/utils/cx';
import styles from './empty-state.module.css';

export type EmptyStateProps = {
  readonly title?: string;
  readonly description: string;
  readonly className?: string;
  readonly icon?: ReactNode;
  readonly align?: 'start' | 'center';
  readonly children?: ReactNode;
};

/** Mensagem de empty state — sem dados, sem números. */
export function EmptyState({
  title,
  description,
  className,
  icon,
  align = 'start',
  children,
}: EmptyStateProps) {
  return (
    <div
      className={cx(styles.root, align === 'center' && styles.center, className)}
      data-empty-state="true"
    >
      {icon ? <div className={styles.iconSlot}>{icon}</div> : null}
      {title ? (
        <Typography as="p" variant="label" className={styles.title}>
          {title}
        </Typography>
      ) : null}
      <Typography as="p" variant="body" className={styles.description}>
        {description}
      </Typography>
      {children}
    </div>
  );
}
