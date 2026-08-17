import type { ButtonHTMLAttributes, ReactNode } from 'react';

import { cx } from '../utils/cx';
import styles from './icon-button.module.css';

export type IconButtonVariant = 'primary' | 'secondary' | 'ghost';
/** Tom de hover suave para ações icon-only (Linear / Vercel style). */
export type IconButtonTone = 'neutral' | 'info' | 'warning' | 'danger' | 'success';
export type IconButtonSize = 'sm' | 'md' | 'lg';

export type IconButtonProps = {
  readonly variant?: IconButtonVariant;
  readonly tone?: IconButtonTone;
  readonly size?: IconButtonSize;
  readonly loading?: boolean;
  readonly 'aria-label': string;
  readonly children: ReactNode;
} & Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'>;

export function IconButton({
  variant = 'ghost',
  tone = 'neutral',
  size = 'md',
  loading = false,
  disabled = false,
  className,
  type = 'button',
  children,
  ...rest
}: IconButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...rest}
      type={type}
      className={cx(
        styles.root,
        styles[variant],
        styles[size],
        variant === 'ghost' ? styles[`tone_${tone}`] : null,
        className,
      )}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-disabled={isDisabled || undefined}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : children}
    </button>
  );
}
