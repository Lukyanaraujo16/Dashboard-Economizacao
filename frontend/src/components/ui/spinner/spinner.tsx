import type { HTMLAttributes } from 'react';

import { cx } from '../utils/cx';
import styles from './spinner.module.css';

export type SpinnerSize = 'sm' | 'md' | 'lg';

export type SpinnerProps = {
  readonly size?: SpinnerSize;
  readonly label?: string;
} & HTMLAttributes<HTMLSpanElement>;

export function Spinner({ size = 'md', label = 'Carregando', className, ...rest }: SpinnerProps) {
  return (
    <span
      {...rest}
      className={cx(styles.root, styles[size], className)}
      role="status"
      aria-live="polite"
      aria-label={label}
    >
      <span className={styles.visual} aria-hidden="true" />
      <span className={styles.srOnly}>{label}</span>
    </span>
  );
}
