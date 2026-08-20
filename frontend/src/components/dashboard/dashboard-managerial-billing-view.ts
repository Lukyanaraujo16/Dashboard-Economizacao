import { formatMoneyBrl } from '../../lib/format-money-brl';
import type { DashboardMonthPhase } from '../../lib/dashboard-month';
import type { DashboardMonthlyRevenueResponse } from '../../services/dashboard/monthly-revenue.types';
import { isMonthlyRevenueEmpty } from './dashboard-monthly-revenue-view';

export type ManagerialBillingKpiView = {
  readonly id: 'managerial-billing';
  readonly title: string;
  readonly state: 'ready' | 'empty';
  readonly value?: string;
  readonly meta: string;
  readonly emptyMessage?: string;
};

/**
 * Faturamento Gerencial = Σ total AR por competenceDate do mês (monthly-revenue).
 * received/outstanding no payload NÃO são caixa do mês — não entram no valor do card.
 */
export function toManagerialBillingKpi(
  data: DashboardMonthlyRevenueResponse,
  phase: DashboardMonthPhase,
): ManagerialBillingKpiView {
  if (isMonthlyRevenueEmpty(data)) {
    return emptyManagerialBillingKpi(phase);
  }

  if (phase === 'future') {
    return {
      id: 'managerial-billing',
      title: 'Faturamento previsto',
      state: 'ready',
      value: formatMoneyBrl(data.receivables.total),
      meta: 'Receitas já lançadas na competência',
    };
  }

  if (phase === 'past') {
    return {
      id: 'managerial-billing',
      title: 'Faturamento',
      state: 'ready',
      value: formatMoneyBrl(data.receivables.total),
      meta: 'Gerado na competência',
    };
  }

  return {
    id: 'managerial-billing',
    title: 'Faturamento',
    state: 'ready',
    value: formatMoneyBrl(data.receivables.total),
    meta: 'Gerado até agora',
  };
}

export function emptyManagerialBillingKpi(phase: DashboardMonthPhase): ManagerialBillingKpiView {
  if (phase === 'future') {
    return {
      id: 'managerial-billing',
      title: 'Faturamento previsto',
      state: 'empty',
      meta: 'Sem receitas previstas',
      emptyMessage: 'Sem receitas previstas',
    };
  }
  if (phase === 'past') {
    return {
      id: 'managerial-billing',
      title: 'Faturamento',
      state: 'empty',
      meta: 'Sem receitas na competência',
      emptyMessage: 'Sem receitas na competência',
    };
  }
  return {
    id: 'managerial-billing',
    title: 'Faturamento',
    state: 'empty',
    meta: 'Sem receitas na competência',
    emptyMessage: 'Sem receitas na competência',
  };
}
