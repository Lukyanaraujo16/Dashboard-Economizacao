import { formatDelinquencyRate, formatMoneyBrl, isDecimalZero } from '../../lib/format-money-brl';
import type { DashboardMonthPhase } from '../../lib/dashboard-month';
import type { DashboardOverviewResponse } from '../../services/dashboard/overview.types';
import type { DailyPoint } from './v2/chart-math';
import type { MonthlyCashFlowView } from './dashboard-monthly-cash-flow-view';
import type { MonthlyContextKpiView } from './dashboard-monthly-kpis-view';

const CC_UNAVAILABLE = 'Indisponível no filtro por centro de custo';

function phaseBillingTitle(phase: DashboardMonthPhase): string {
  return phase === 'future' ? 'Faturamento previsto' : 'Faturamento';
}

function moneyKpi(
  id: string,
  title: string,
  amount: string | null,
  meta: string,
  emptyMeta: string,
): MonthlyContextKpiView {
  if (amount === null) {
    return {
      id,
      title,
      state: 'ready',
      value: '—',
      meta: CC_UNAVAILABLE,
    };
  }
  if (isDecimalZero(amount)) {
    return {
      id,
      title,
      state: 'empty',
      meta: emptyMeta,
      emptyMessage: emptyMeta,
    };
  }
  return {
    id,
    title,
    state: 'ready',
    value: formatMoneyBrl(amount),
    meta,
  };
}

/** Faturamento = MonthlyCashFlow.billing (realizado + previsto no prazo). */
export function toCashBillingKpi(
  view: MonthlyCashFlowView,
  phase: DashboardMonthPhase,
): MonthlyContextKpiView {
  const title = phaseBillingTitle(phase);
  if (view.billing === null) {
    return {
      id: 'cash-billing',
      title,
      state: 'ready',
      value: '—',
      meta: CC_UNAVAILABLE,
    };
  }
  if (isDecimalZero(view.billing)) {
    return {
      id: 'cash-billing',
      title,
      state: 'empty',
      meta: phase === 'future' ? 'Sem entradas previstas no caixa' : 'Sem faturamento de caixa no mês',
      emptyMessage:
        phase === 'future' ? 'Sem entradas previstas no caixa' : 'Sem faturamento de caixa no mês',
    };
  }
  return {
    id: 'cash-billing',
    title,
    state: 'ready',
    value: formatMoneyBrl(view.billing),
    meta:
      phase === 'future'
        ? 'Previsto para entrar no caixa no mês'
        : 'Recebido no caixa + a receber ainda no prazo',
  };
}

/** Já recebido = realized.inflows (occurredOn no mês). */
export function toCashReceivedKpi(view: MonthlyCashFlowView): MonthlyContextKpiView {
  return moneyKpi(
    'cash-received',
    'Já recebido',
    view.received,
    'Dinheiro efetivamente entrado no caixa no mês',
    'Sem entradas no caixa neste mês',
  );
}

/** A receber = expected.receivables (dueDate no mês, ainda no prazo). */
export function toCashReceivableKpi(
  view: MonthlyCashFlowView,
  phase: DashboardMonthPhase,
): MonthlyContextKpiView {
  return moneyKpi(
    'cash-receivable',
    'A receber',
    view.receivable,
    phase === 'future'
      ? 'Valores previstos para entrar no caixa no mês'
      : 'Ainda previstos para entrar no caixa dentro do mês',
    phase === 'future' ? 'Sem valores previstos no mês' : 'Sem valores a receber no prazo',
  );
}

/** Contas a pagar = expected.payables (dueDate no mês, ainda no prazo). */
export function toCashPayableKpi(
  view: MonthlyCashFlowView,
  phase: DashboardMonthPhase,
): MonthlyContextKpiView {
  return moneyKpi(
    'cash-payable',
    'Contas a pagar',
    view.payable,
    phase === 'future'
      ? 'Valores previstos para sair do caixa no mês'
      : 'A pagar ainda no prazo',
    phase === 'future' ? 'Sem valores previstos no mês' : 'Sem contas a pagar no prazo',
  );
}

/** Despesas = realized.outflows + expected.payables. */
export function toCashExpensesKpi(
  view: MonthlyCashFlowView,
  phase: DashboardMonthPhase,
): MonthlyContextKpiView {
  return moneyKpi(
    'cash-expenses',
    'Despesas',
    view.monthlyExpenses,
    phase === 'future'
      ? 'Previsto para sair do caixa no mês'
      : 'Pago no caixa + a pagar ainda no prazo',
    phase === 'future' ? 'Sem saídas previstas no mês' : 'Sem despesas de caixa no mês',
  );
}

/**
 * Resultado = billing − monthlyExpenses (realizado + previsto no prazo).
 * Não usa realized.result.
 */
export function toCashManagerialResultKpi(view: MonthlyCashFlowView): MonthlyContextKpiView {
  if (view.managerialResult === null) {
    return {
      id: 'cash-result',
      title: 'Resultado',
      state: 'ready',
      value: '—',
      meta: CC_UNAVAILABLE,
    };
  }
  if (isDecimalZero(view.managerialResult)) {
    return {
      id: 'cash-result',
      title: 'Resultado',
      state: 'empty',
      meta: 'Sem resultado de caixa no mês',
      emptyMessage: 'Sem resultado de caixa no mês',
    };
  }
  return {
    id: 'cash-result',
    title: 'Resultado',
    state: 'ready',
    value: formatMoneyBrl(view.managerialResult),
    meta: 'Faturamento − despesas (realizado + previsto no prazo)',
  };
}

/** Inadimplência absoluta D1 = overdue.receivables (carteira global). */
export function toCashOverdueReceivablesKpi(view: MonthlyCashFlowView): MonthlyContextKpiView {
  if (view.overdueReceivables === null) {
    return {
      id: 'cash-overdue-ar',
      title: 'Vencido agora',
      state: 'ready',
      value: '—',
      meta: CC_UNAVAILABLE,
    };
  }
  if (isDecimalZero(view.overdueReceivables)) {
    return {
      id: 'cash-overdue-ar',
      title: 'Vencido agora',
      state: 'empty',
      meta: 'Sem títulos vencidos agora',
      emptyMessage: 'Sem títulos vencidos agora',
    };
  }
  return {
    id: 'cash-overdue-ar',
    title: 'Vencido agora',
    state: 'ready',
    value: formatMoneyBrl(view.overdueReceivables),
    meta: 'Carteira global em atraso (D1)',
  };
}

/** Taxa D1 do overview: vencido / aberto global. */
export function toOverviewDelinquencyRateKpi(
  overview: DashboardOverviewResponse,
): MonthlyContextKpiView {
  const rate = overview.delinquency.rate;
  if (isDecimalZero(overview.delinquency.openUnpaid)) {
    return {
      id: 'd1-delinquency-rate',
      title: 'Taxa',
      state: 'empty',
      meta: 'Sem valores em aberto agora',
      emptyMessage: 'Sem valores em aberto agora',
    };
  }
  return {
    id: 'd1-delinquency-rate',
    title: 'Taxa',
    state: 'ready',
    value: formatDelinquencyRate(rate),
    meta: 'Vencido agora ÷ aberto global (D1)',
  };
}

export function moneyOrDashCash(value: string | null | undefined): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return formatMoneyBrl(value);
}

/** Sparkline honesta: só realized.inflows por dia. */
export function cashReceivedDailySeries(view: MonthlyCashFlowView): readonly DailyPoint[] | undefined {
  if (!view.costCenterCashSplit || view.received === null) {
    return undefined;
  }
  const points = view.dailyRealized
    .filter((point) => point.inflows !== null)
    .map((point) => ({ date: point.date, amount: point.inflows as string }));
  return points.length > 0 ? points : undefined;
}

/** Sparkline honesta: só expected.receivables por dia. */
export function cashReceivableDailySeries(
  view: MonthlyCashFlowView,
): readonly DailyPoint[] | undefined {
  if (!view.costCenterCashSplit || view.receivable === null) {
    return undefined;
  }
  const points = view.dailyExpected
    .filter((point) => point.receivables !== null)
    .map((point) => ({ date: point.date, amount: point.receivables as string }));
  return points.length > 0 ? points : undefined;
}

export const CASH_RECEIVED_SPARKLINE_CAPTION = 'Entradas no caixa por dia de baixa';
export const CASH_RECEIVABLE_SPARKLINE_CAPTION = 'A receber no prazo por dia de vencimento';
export const CASH_PAYABLE_SPARKLINE_CAPTION = 'A pagar no prazo por dia de vencimento';
