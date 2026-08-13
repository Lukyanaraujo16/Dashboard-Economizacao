'use client';

import {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
} from 'react';

import { Typography } from '../typography';
import { cx } from '../utils/cx';
import styles from './form-field.module.css';

type ControlProps = {
  readonly id?: string;
  readonly 'aria-describedby'?: string;
  readonly 'aria-invalid'?: boolean;
  readonly invalid?: boolean;
};

export type FormFieldProps = {
  readonly label: ReactNode;
  readonly htmlFor?: string;
  readonly hint?: ReactNode;
  readonly error?: ReactNode;
  readonly required?: boolean;
  readonly className?: string;
  readonly children: ReactElement<ControlProps>;
};

export function FormField({
  label,
  htmlFor,
  hint,
  error,
  required = false,
  className,
  children,
}: FormFieldProps) {
  const generatedId = useId();
  const control = Children.only(children);
  const controlId = htmlFor ?? control.props.id ?? generatedId;
  const hintId = hint ? `${controlId}-hint` : undefined;
  const errorId = error ? `${controlId}-error` : undefined;
  const describedBy =
    [control.props['aria-describedby'], errorId, hintId].filter(Boolean).join(' ') || undefined;

  const controlWithA11y = isValidElement(control)
    ? cloneElement(control, {
        id: controlId,
        'aria-describedby': describedBy,
        'aria-invalid': Boolean(error) || control.props['aria-invalid'],
        invalid: Boolean(error) || control.props.invalid,
      })
    : control;

  return (
    <div className={cx(styles.root, className)}>
      <label className={styles.label} htmlFor={controlId}>
        <Typography as="span" variant="label">
          {label}
          {required ? (
            <span className={styles.required} aria-hidden="true">
              {' '}
              *
            </span>
          ) : null}
        </Typography>
      </label>
      {controlWithA11y}
      {hint && !error ? (
        <Typography id={hintId} as="p" variant="caption" className={styles.hint}>
          {hint}
        </Typography>
      ) : null}
      {error ? (
        <Typography id={errorId} as="p" variant="caption" className={styles.error} role="alert">
          {error}
        </Typography>
      ) : null}
    </div>
  );
}
