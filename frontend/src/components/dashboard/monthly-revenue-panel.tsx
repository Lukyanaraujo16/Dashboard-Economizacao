import { formatMoneyBrl } from '../../lib/format-money-brl';
import type { DashboardMonthPhase } from '../../lib/dashboard-month';
import type { DashboardMonthlyRevenueResponse } from '../../services/dashboard/monthly-revenue.types';
import { CategoryDonutChart } from './category-donut-chart';
import { presentTopCategoryDonutSlices } from './category-donut-view';
import monthlyStyles from './monthly-revenue.module.css';

export type MonthlyRevenuePanelProps = {
  readonly data: DashboardMonthlyRevenueResponse;
  readonly phase: DashboardMonthPhase;
};

export function MonthlyRevenuePanel({ data, phase }: MonthlyRevenuePanelProps) {
  const { receivables } = data;
  const slices = presentTopCategoryDonutSlices(receivables.items);

  return (
    <div>
      {phase === 'future' ? (
        <p className={monthlyStyles.axis}>
          Competência futura — ausência de títulos não indica realização.
        </p>
      ) : null}
      <dl className={monthlyStyles.metricsCompact}>
        <div>
          <dt>Total</dt>
          <dd>{formatMoneyBrl(receivables.total)}</dd>
        </div>
        <div>
          <dt>Já recebido</dt>
          <dd>{formatMoneyBrl(receivables.received)}</dd>
        </div>
        <div>
          <dt>A receber</dt>
          <dd>{formatMoneyBrl(receivables.outstanding)}</dd>
        </div>
      </dl>
      {slices.length > 0 ? (
        <CategoryDonutChart slices={slices} ariaLabel="Receitas por categoria do mês selecionado" />
      ) : null}
    </div>
  );
}
