import type { HTMLAttributes, ReactNode } from 'react';

import { cx } from '../utils/cx';
import styles from './container.module.css';

export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl';

export type ContainerProps = {
  readonly size?: ContainerSize;
  readonly children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function Container({ size = 'lg', children, className, ...rest }: ContainerProps) {
  return (
    <div {...rest} className={cx(styles.root, styles[size], className)}>
      {children}
    </div>
  );
}
