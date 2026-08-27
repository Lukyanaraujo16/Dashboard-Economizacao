'use client';

import type { DashboardCashRealizedCategoryComposition } from '../../services/dashboard/monthly-cash-flow.types';
import { CategoryDonutChart } from './category-donut-chart';
import { presentTopCategoryDonutSlices } from './category-donut-view';
import { formatCompactBrl } from './v2/chart-math';

export type CashRealizedCategoryPanelProps = {
  readonly composition: DashboardCashRealizedCategoryComposition;
  readonly ariaLabel: string;
  readonly centerCaption: string;
};

/** Donut de caixa realizado — total no centro = Σ realized (não billing/despesas). */
export function CashRealizedCategoryPanel({
  composition,
  ariaLabel,
  centerCaption,
}: CashRealizedCategoryPanelProps) {
  const slices = presentTopCategoryDonutSlices(composition.items);
  if (slices.length === 0) {
    return null;
  }

  const centerLabel = formatCompactBrl(Number(composition.total));

  return (
    <CategoryDonutChart
      slices={slices}
      ariaLabel={ariaLabel}
      centerLabel={centerLabel}
      centerCaption={centerCaption}
      interactive
      size="md"
    />
  );
}
