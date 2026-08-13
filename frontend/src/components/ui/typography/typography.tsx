import type { ElementType, HTMLAttributes, ReactNode } from 'react';

import { cx } from '../utils/cx';
import styles from './typography.module.css';

export type TypographyVariant =
  'display' | 'heading' | 'title' | 'body' | 'label' | 'caption' | 'numeric';

export type TypographyProps = {
  readonly as?: ElementType;
  readonly variant?: TypographyVariant;
  readonly tabular?: boolean;
  readonly children: ReactNode;
  readonly className?: string;
} & Omit<HTMLAttributes<HTMLElement>, 'children' | 'className'>;

const DEFAULT_ELEMENTS: Record<TypographyVariant, ElementType> = {
  display: 'h1',
  heading: 'h2',
  title: 'h3',
  body: 'p',
  label: 'span',
  caption: 'span',
  numeric: 'span',
};

export function Typography({
  as,
  variant = 'body',
  tabular = false,
  children,
  className,
  ...rest
}: TypographyProps) {
  const Component = as ?? DEFAULT_ELEMENTS[variant];
  const useTabular = tabular || variant === 'numeric';

  return (
    <Component
      {...rest}
      className={cx(styles.root, styles[variant], useTabular && styles.tabular, className)}
    >
      {children}
    </Component>
  );
}
