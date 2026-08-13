import type { HTMLAttributes } from 'react';

import { cx } from '../utils/cx';
import styles from './divider.module.css';

export type DividerOrientation = 'horizontal' | 'vertical';

export type DividerProps = {
  readonly orientation?: DividerOrientation;
} & HTMLAttributes<HTMLHRElement>;

export function Divider({ orientation = 'horizontal', className, ...rest }: DividerProps) {
  return (
    <hr
      {...rest}
      className={cx(styles.root, styles[orientation], className)}
      aria-orientation={orientation}
    />
  );
}
