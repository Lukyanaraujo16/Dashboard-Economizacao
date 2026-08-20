import { formatMoneyBrl } from '../../lib/format-money-brl';
import type { DashboardMonthPhase } from '../../lib/dashboard-month';
import type { DashboardMonthlyExpenseResponse } from '../../services/dashboard/monthly-expenses.types';
import { CategoryDonutChart } from './category-donut-chart';
import { presentTopCategoryDonutSlices } from './category-donut-view';
import monthlyStyles from './monthly-revenue.module.css';

export type MonthlyExpensePanelProps = {
  readonly data: DashboardMonthlyExpenseResponse;
  readonly phase: DashboardMonthPhase;
};

export function MonthlyExpensePanel({ data, phase }: MonthlyExpensePanelProps) {
  const { payables } = data;
  const slices = presentTopCategoryDonutSlices(payables.items);

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
          <dd>{formatMoneyBrl(payables.total)}</dd>
        </div>
        <div>
          <dt>Já pago</dt>
          <dd>{formatMoneyBrl(payables.paid)}</dd>
        </div>
        <div>
          <dt>A pagar</dt>
          <dd>{formatMoneyBrl(payables.outstanding)}</dd>
        </div>
      </dl>
      {slices.length > 0 ? (
        <CategoryDonutChart slices={slices} ariaLabel="Despesas por categoria do mês selecionado" />
      ) : null}
    </div>
  );
}
