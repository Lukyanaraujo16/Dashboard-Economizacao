'use client';

import { forwardRef, useId, useState, type InputHTMLAttributes } from 'react';

import { IconButton } from '../icon-button';
import { IconEye, IconEyeOff } from '../icons';
import { Input } from '../input';
import { cx } from '../utils/cx';
import styles from './password-input.module.css';

export type PasswordInputProps = {
  readonly invalid?: boolean;
} & Omit<InputHTMLAttributes<HTMLInputElement>, 'size' | 'type'>;

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
          tone="neutral"
          disabled={disabled}
          aria-label={visible ? 'Ocultar senha' : 'Mostrar senha'}
          aria-controls={inputId}
          aria-pressed={visible}
          onClick={() => setVisible((current) => !current)}
        >
          {visible ? <IconEyeOff /> : <IconEye />}
        </IconButton>
      </div>
    );
  },
);
