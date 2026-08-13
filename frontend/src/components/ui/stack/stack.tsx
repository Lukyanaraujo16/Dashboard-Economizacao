import type { CSSProperties, HTMLAttributes, ReactNode } from 'react';

import { cx } from '../utils/cx';
import styles from './stack.module.css';

export type StackDirection = 'vertical' | 'horizontal';
export type StackGap = 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12 | 16;

export type StackProps = {
  readonly direction?: StackDirection;
  readonly gap?: StackGap;
  readonly align?: 'start' | 'center' | 'end' | 'stretch';
  readonly justify?: 'start' | 'center' | 'end' | 'between';
  readonly wrap?: boolean;
  readonly children: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

export function Stack({
  direction = 'vertical',
  gap = 4,
  align = 'stretch',
  justify = 'start',
  wrap = false,
  children,
  className,
  style,
  ...rest
}: StackProps) {
  const mergedStyle = {
    ...style,
    ['--stack-gap' as string]: `var(--space-${gap})`,
  } as CSSProperties;

  return (
    <div
      {...rest}
      className={cx(
        styles.root,
        styles[direction],
        styles[`align-${align}`],
        styles[`justify-${justify}`],
        wrap && styles.wrap,
        className,
      )}
      style={mergedStyle}
    >
      {children}
    </div>
  );
}
