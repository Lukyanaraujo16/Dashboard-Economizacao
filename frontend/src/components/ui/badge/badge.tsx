import type { HTMLAttributes, ReactNode } from 'react';

import { cx } from '../utils/cx';
import styles from './badge.module.css';

export type BadgeVariant = 'neutral' | 'success' | 'warning' | 'danger' | 'info';

export type BadgeProps = {
  readonly variant?: BadgeVariant;
  readonly children: ReactNode;
} & HTMLAttributes<HTMLSpanElement>;

export function Badge({ variant = 'neutral', children, className, ...rest }: BadgeProps) {
  return (
    <span {...rest} className={cx(styles.root, styles[variant], className)}>
      {children}
    </span>
  );
}
