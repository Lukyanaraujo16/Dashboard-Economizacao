import type { HTMLAttributes, ReactNode } from 'react';

import { cx } from '../utils/cx';
import styles from './card.module.css';

export type CardVariant = 'default' | 'elevated';

export type CardProps = {
  readonly variant?: CardVariant;
  readonly children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function Card({ variant = 'default', children, className, ...rest }: CardProps) {
  return (
    <div {...rest} className={cx(styles.root, styles[variant], className)}>
      {children}
    </div>
  );
}
