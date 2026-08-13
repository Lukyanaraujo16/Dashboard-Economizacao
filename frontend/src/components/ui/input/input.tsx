import { forwardRef, type InputHTMLAttributes } from 'react';

import { cx } from '../utils/cx';
import styles from './input.module.css';

export type InputProps = {
  readonly invalid?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'size'>;

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid = false, disabled, type = 'text', ...rest },
  ref,
) {
  return (
    <input
      {...rest}
      ref={ref}
      type={type}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={cx(styles.root, invalid && styles.invalid, className)}
    />
  );
});
