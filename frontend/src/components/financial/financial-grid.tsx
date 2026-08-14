import type { CSSProperties, ReactNode } from 'react';

import { cx } from '../ui/utils/cx';
import styles from './financial-grid.module.css';

export type FinancialGridProps = {
  readonly children: ReactNode;
  readonly className?: string;
  /** Largura mínima de cada coluna — quantidade de colunas emerge do viewport. */
  readonly minItemWidth?: string;
};

/**
 * Grade financeira responsiva desacoplada da contagem de cards.
 * Usa `auto-fit` + `minmax` — adapta-se a 1…N itens sem prop `columns`.
 */
export function FinancialGrid({ children, className, minItemWidth = '14rem' }: FinancialGridProps) {
  const style = {
    ['--financial-grid-min' as string]: minItemWidth,
  } as CSSProperties;

  return (
    <div className={cx(styles.root, className)} style={style} data-financial-grid="true">
      {children}
    </div>
  );
}
