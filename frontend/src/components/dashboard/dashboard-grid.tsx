import type { ReactNode } from 'react';

import { FinancialGrid } from '../financial';

export type DashboardGridColumns = 1 | 2 | 4;

export type DashboardGridProps = {
  readonly columns?: DashboardGridColumns;
  readonly children: ReactNode;
  readonly className?: string;
};

const MIN_WIDTH_BY_COLUMNS: Record<DashboardGridColumns, string> = {
  1: '100%',
  2: '18rem',
  4: '14rem',
};

/** @deprecated Preferir `FinancialGrid` de `components/financial`. */
export function DashboardGrid({ columns = 4, children, className }: DashboardGridProps) {
  return (
    <div data-dashboard-grid={columns}>
      <FinancialGrid minItemWidth={MIN_WIDTH_BY_COLUMNS[columns]} className={className}>
        {children}
      </FinancialGrid>
    </div>
  );
}
