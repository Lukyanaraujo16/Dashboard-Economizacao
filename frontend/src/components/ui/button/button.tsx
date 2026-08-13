import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from '../utils/cx';
import styles from './button.module.css';

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

export type ButtonProps = {
  readonly variant?: ButtonVariant;
  readonly size?: ButtonSize;
  readonly loading?: boolean;
  readonly leftIcon?: ReactNode;
  readonly rightIcon?: ReactNode;
  readonly children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'>;

export function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled = false,
  leftIcon,
  rightIcon,
  children,
  className,
  type = 'button',
  ...rest
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      type={type}
      className={cx(styles.root, styles[variant], styles[size], className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : null}
      {!loading && leftIcon ? <span className={styles.icon}>{leftIcon}</span> : null}
      <span className={styles.label}>{children}</span>
      {!loading && rightIcon ? <span className={styles.icon}>{rightIcon}</span> : null}
      {loading ? <span className={styles.srOnly}>Carregando</span> : null}
    </button>
  );
}
