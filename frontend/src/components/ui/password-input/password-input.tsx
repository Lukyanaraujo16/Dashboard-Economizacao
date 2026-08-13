'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

import { IconButton } from '../icon-button';
import { Input } from '../input';
import { cx } from '../utils/cx';
import styles from './password-input.module.css';

export type PasswordInputProps = {
  readonly invalid?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'>;

function EyeIcon({ open }: { readonly open: boolean }) {
  if (open) {
    return (
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path
          d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <circle cx="8" cy="8" r="2" stroke="currentColor" strokeWidth="1.5" />
      </svg>
    );
  }

  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <path d="M3 13.5 13 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

export const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(
  function PasswordInput({ className, invalid, disabled, id, ...rest }, ref) {
    const [visible, setVisible] = useState(false);
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className={styles.wrap}>
        <Input
          {...rest}
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          invalid={invalid}
          disabled={disabled}
          className={cx(styles.input, className)}
          autoComplete={rest.autoComplete ?? 'current-password'}
        />
        <IconButton
          className={styles.toggle}
          type="button"
          size="sm"
          variant="ghost"
          disabled={disabled}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-controls={inputId}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          <EyeIcon open={visible} />
        </IconButton>
      </div>
    );
  },
);
